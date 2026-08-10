// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
    type A2AAgents,
    type A2AToolDefinition,
    A2ATools,
    ArtifactSettings,
    JSONTaskStore,
    LocalFileStore,
} from "@a2anet/a2a-utils";
import type { TSchema } from "@sinclair/typebox";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { A2AAuditLogger } from "../audit/logger.js";
import { extractTaskContextIds, summarizeMessageContent } from "../audit/redact.js";
import { createRoditOutboundAuthProvider } from "../auth/create-rodit-outbound-auth.js";
import type { A2AAgentEntry, A2AOutboundAuthConfig } from "../config.js";
import { type AgentTool, jsonResult } from "../types.js";
import { AuthenticatedA2AAgents } from "./authenticated-agents.js";
import { createPollingA2ASession } from "./polling-a2a-session.js";
import { withOutboundAuthRetry } from "./retry.js";
import { TokenPeerResolver } from "./token-peer-resolver.js";
import {
    normalizeA2AToolParams,
    normalizeA2AToolResult,
    preferTokenIdInToolSchema,
    sanitizeOpenAiToolSchema,
} from "./tool-params.js";

export type CreateOutboundToolsParams = {
    agents: Record<string, A2AAgentEntry>;
    auth?: A2AOutboundAuthConfig;
    stateDir: string;
    workspaceDir: string;
    taskStore?: boolean;
    fileStore?: boolean;
    agentCardTimeout?: number;
    sendMessageTimeout?: number;
    getTaskTimeout?: number;
    getTaskPollInterval?: number;
    sendMessageCharacterLimit?: number;
    minimizedObjectStringLength?: number;
    viewArtifactCharacterLimit?: number;
    resolvePeersByTokenId?: boolean;
    persistResolvedPeers?: boolean;
    audit?: A2AAuditLogger;
    onInfo?: (message: string) => void;
    onWarn?: (message: string) => void;
};

export type CreateOutboundToolsResult = {
    tools: AgentTool[];
    agents: AuthenticatedA2AAgents;
};

/**
 * Create the 6 outbound A2A tools backed by @a2anet/a2a-utils.
 *
 * This is the thin wrapper that bridges A2ATools to OpenClaw's tool registration
 * format. Tool metadata (name, description, schema) comes from a2a-utils;
 * the `a2a_` prefix is added here for OpenClaw namespacing.
 */
export function createOutboundTools(params: CreateOutboundToolsParams): CreateOutboundToolsResult {
    const authProvider = createRoditOutboundAuthProvider(params.auth, params.agents);
    const resolvePeersByTokenId =
        params.auth?.provider === "rodit" && params.resolvePeersByTokenId !== false;
    const tokenPeerResolver = resolvePeersByTokenId
        ? new TokenPeerResolver({
              stateDir: params.stateDir,
              persist: params.persistResolvedPeers === true,
              logLevel: params.auth?.logLevel,
              onInfo: params.onInfo,
              onWarn: params.onWarn,
          })
        : undefined;
    const agents = new AuthenticatedA2AAgents(
        params.agents,
        authProvider,
        params.agentCardTimeout,
        tokenPeerResolver,
    );

    const taskStore =
        params.taskStore !== false
            ? new JSONTaskStore(`${params.stateDir}/a2a/outbound/tasks`)
            : undefined;
    const fileStore =
        params.fileStore !== false
            ? new LocalFileStore(`${params.workspaceDir}/a2a/outbound/files`)
            : undefined;

    const session = createPollingA2ASession(agents as unknown as A2AAgents, {
        taskStore,
        fileStore,
        sendMessageTimeout: params.sendMessageTimeout,
        getTaskTimeout: params.getTaskTimeout,
        getTaskPollInterval: params.getTaskPollInterval,
    });

    const artifactSettings = new ArtifactSettings({
        sendMessageCharacterLimit: params.sendMessageCharacterLimit,
        minimizedObjectStringLength: params.minimizedObjectStringLength,
        viewArtifactCharacterLimit: params.viewArtifactCharacterLimit,
    });

    const tools = new A2ATools(session, { artifactSettings });
    const audit = params.audit;

    const agentTools = (tools.tools as A2AToolDefinition[]).map((def) => {
        const { $schema: _, ...jsonSchema } = zodToJsonSchema(def.schema, { target: "openAi" });
        sanitizeOpenAiToolSchema(jsonSchema);
        preferTokenIdInToolSchema(jsonSchema, def.name);
        return {
            name: `a2a_${def.name}`,
            label: `a2a_${def.name}`,
            description: def.description,
            parameters: jsonSchema as TSchema,
            execute: async (_toolCallId: string, toolParams: Record<string, unknown>) =>
                withOutboundAuthRetry(authProvider, async () => {
                    const started = Date.now();
                    const normalized = normalizeA2AToolParams(toolParams);
                    const peer =
                        typeof normalized.agentId === "string" ? normalized.agentId : undefined;
                    try {
                        const result = normalizeA2AToolResult(
                            (await def.execute(normalized)) as Record<string, unknown>,
                        );
                        logOutboundToolAudit(audit, {
                            toolName: def.name,
                            peer,
                            params: normalized,
                            result,
                            durationMs: Date.now() - started,
                        });
                        return jsonResult(result);
                    } catch (err) {
                        audit?.log({
                            eventType: "error",
                            direction: "outbound",
                            status: "failure",
                            targetAgent: peer,
                            tool: `a2a_${def.name}`,
                            durationMs: Date.now() - started,
                            error: {
                                message: err instanceof Error ? err.message : String(err),
                            },
                        });
                        throw err;
                    }
                }),
        };
    });

    return { tools: agentTools, agents };
}

function logOutboundToolAudit(
    audit: A2AAuditLogger | undefined,
    params: {
        toolName: string;
        peer?: string;
        params: Record<string, unknown>;
        result: Record<string, unknown>;
        durationMs: number;
    },
): void {
    if (!audit?.enabled) {
        return;
    }
    const tool = `a2a_${params.toolName}`;
    const ids = extractTaskContextIds(params.result);
    const durationMs = params.durationMs;

    if (params.toolName === "send_message") {
        audit.log({
            eventType: "message_sent",
            direction: "outbound",
            status: "success",
            targetAgent: params.peer,
            tool,
            taskId: ids.taskId,
            contextId: ids.contextId,
            contentSummary: summarizeMessageContent(params.params),
            durationMs,
        });
        return;
    }
    if (params.toolName === "get_task") {
        audit.log({
            eventType: "task_get",
            direction: "outbound",
            status: "success",
            targetAgent: params.peer,
            tool,
            taskId:
                ids.taskId ??
                (typeof params.params.taskId === "string" ? params.params.taskId : undefined),
            contextId: ids.contextId,
            durationMs,
        });
        return;
    }
    if (params.toolName === "get_agent" || params.toolName === "get_agents") {
        audit.log({
            eventType: "agent_discovered",
            direction: "outbound",
            status: "success",
            targetAgent: params.peer,
            tool,
            durationMs,
            metadata:
                params.toolName === "get_agents"
                    ? {
                          agent_count: Array.isArray(params.result.agents)
                              ? params.result.agents.length
                              : undefined,
                      }
                    : undefined,
        });
    }
}
