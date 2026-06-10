// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
    type A2AAgents,
    A2ASession,
    type A2AToolDefinition,
    A2ATools,
    ArtifactSettings,
    JSONTaskStore,
    LocalFileStore,
} from "@a2anet/a2a-utils";
import type { TSchema } from "@sinclair/typebox";
import { zodToJsonSchema } from "zod-to-json-schema";

import { createRoditOutboundAuthProvider } from "../auth/create-rodit-outbound-auth.js";
import type { A2AAgentEntry, A2AOutboundAuthConfig } from "../config.js";
import { type AgentTool, jsonResult } from "../types.js";
import { AuthenticatedA2AAgents } from "./authenticated-agents.js";
import { withOutboundAuthRetry } from "./retry.js";

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
    const agents = new AuthenticatedA2AAgents(params.agents, authProvider, params.agentCardTimeout);

    const taskStore =
        params.taskStore !== false
            ? new JSONTaskStore(`${params.stateDir}/a2a/outbound/tasks`)
            : undefined;
    const fileStore =
        params.fileStore !== false
            ? new LocalFileStore(`${params.workspaceDir}/a2a/outbound/files`)
            : undefined;

    const session = new A2ASession(agents as unknown as A2AAgents, {
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

    const agentTools = (tools.tools as A2AToolDefinition[]).map((def) => {
        const { $schema: _, ...jsonSchema } = zodToJsonSchema(def.schema, { target: "openAi" });
        return {
            name: `a2a_${def.name}`,
            label: `a2a_${def.name}`,
            description: def.description,
            parameters: jsonSchema as TSchema,
            execute: async (_toolCallId: string, toolParams: Record<string, unknown>) =>
                withOutboundAuthRetry(authProvider, async () =>
                    jsonResult(await def.execute(toolParams)),
                ),
        };
    });

    return { tools: agentTools, agents };
}
