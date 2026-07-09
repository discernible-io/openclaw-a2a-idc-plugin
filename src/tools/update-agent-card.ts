// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Type } from "@sinclair/typebox";

import type { A2AAgentCardConfig } from "../config.js";
import { buildRootConfigWithA2A } from "../config.js";
import { type AgentTool, jsonResult } from "../types.js";

export type UpdateAgentCardDeps = {
    loadConfig: () => Promise<Record<string, unknown>>;
    writeConfigFile: (config: Record<string, unknown>) => Promise<void>;
    /** Wrap a card patch in the A2A config shape that persists it to this agent. */
    buildConfigUpdate: (patch: Partial<A2AAgentCardConfig>) => Record<string, unknown>;
    /** Called after config is written to update the in-memory agent card. */
    updateLiveCard: (patch: Partial<A2AAgentCardConfig>) => void;
};

/**
 * Create the a2a_update_agent_card tool for live-updating the inbound agent card.
 */
export function createUpdateAgentCardTool(deps: UpdateAgentCardDeps): AgentTool {
    return {
        name: "a2a_update_agent_card",
        label: "a2a_update_agent_card",
        description:
            "Update this agent's A2A Agent Card. Changes take effect immediately for " +
            "incoming discovery requests, and are persisted to config. " +
            "At least one of name, description, skills, version, defaultInputModes, " +
            "defaultOutputModes, or extensions must be provided.",
        parameters: Type.Object({
            name: Type.Optional(Type.String({ description: "New agent card name." })),
            description: Type.Optional(Type.String({ description: "New agent card description." })),
            version: Type.Optional(Type.String({ description: "Agent implementation version." })),
            defaultInputModes: Type.Optional(
                Type.Array(Type.String(), { description: "Default input MIME modes." }),
            ),
            defaultOutputModes: Type.Optional(
                Type.Array(Type.String(), { description: "Default output MIME modes." }),
            ),
            skills: Type.Optional(
                Type.Array(
                    Type.Object({
                        id: Type.String({ description: "Unique skill identifier." }),
                        name: Type.String({ description: "Human-readable skill name." }),
                        description: Type.String({ description: "What this skill does." }),
                        tags: Type.Optional(Type.Array(Type.String())),
                        examples: Type.Optional(Type.Array(Type.String())),
                        inputModes: Type.Optional(Type.Array(Type.String())),
                        outputModes: Type.Optional(Type.Array(Type.String())),
                    }),
                    { description: "Replace the agent card's advertised skills." },
                ),
            ),
            extensions: Type.Optional(
                Type.Object({
                    identyclaw: Type.Optional(
                        Type.Object({
                            registryId: Type.Optional(Type.String()),
                            registryUrl: Type.Optional(Type.String()),
                            passportTokenId: Type.Optional(Type.String()),
                            did: Type.Optional(Type.String()),
                            verifyUrl: Type.Optional(Type.String()),
                            verifyRpcDocs: Type.Optional(Type.String()),
                            channels: Type.Optional(Type.Array(Type.String())),
                            contactUris: Type.Optional(Type.Array(Type.String())),
                        }),
                    ),
                }),
            ),
        }),
        async execute(_toolCallId, params) {
            const toolParams = params as Record<string, unknown>;
            const name = typeof toolParams.name === "string" ? toolParams.name.trim() : undefined;
            const description =
                typeof toolParams.description === "string"
                    ? toolParams.description.trim()
                    : undefined;
            const version =
                typeof toolParams.version === "string" ? toolParams.version.trim() : undefined;
            const defaultInputModes = Array.isArray(toolParams.defaultInputModes)
                ? toolParams.defaultInputModes.map(String)
                : undefined;
            const defaultOutputModes = Array.isArray(toolParams.defaultOutputModes)
                ? toolParams.defaultOutputModes.map(String)
                : undefined;
            const skills = Array.isArray(toolParams.skills) ? toolParams.skills : undefined;
            const extensions =
                toolParams.extensions && typeof toolParams.extensions === "object"
                    ? (toolParams.extensions as Record<string, unknown>)
                    : undefined;

            if (
                !name &&
                !description &&
                !version &&
                !defaultInputModes &&
                !defaultOutputModes &&
                !skills &&
                !extensions
            ) {
                return jsonResult({
                    error: true,
                    error_message:
                        "At least one of name, description, skills, version, defaultInputModes, " +
                        "defaultOutputModes, or extensions must be provided.",
                });
            }

            const patch: Partial<A2AAgentCardConfig> = {};
            if (name) {
                patch.name = name;
            }
            if (description) {
                patch.description = description;
            }
            if (version) {
                patch.version = version;
            }
            if (defaultInputModes) {
                patch.defaultInputModes = defaultInputModes;
            }
            if (defaultOutputModes) {
                patch.defaultOutputModes = defaultOutputModes;
            }
            if (skills) {
                patch.skills = skills.map((s: Record<string, unknown>) => ({
                    id: String(s.id ?? ""),
                    name: String(s.name ?? ""),
                    description: String(s.description ?? ""),
                    ...(Array.isArray(s.tags) ? { tags: s.tags.map(String) } : {}),
                    ...(Array.isArray(s.examples) ? { examples: s.examples.map(String) } : {}),
                    ...(Array.isArray(s.inputModes)
                        ? { inputModes: s.inputModes.map(String) }
                        : {}),
                    ...(Array.isArray(s.outputModes)
                        ? { outputModes: s.outputModes.map(String) }
                        : {}),
                }));
            }
            if (extensions?.identyclaw && typeof extensions.identyclaw === "object") {
                const raw = extensions.identyclaw as Record<string, unknown>;
                patch.extensions = {
                    identyclaw: {
                        ...(typeof raw.registryId === "string"
                            ? { registryId: raw.registryId.trim() }
                            : {}),
                        ...(typeof raw.registryUrl === "string"
                            ? { registryUrl: raw.registryUrl.trim() }
                            : {}),
                        ...(typeof raw.passportTokenId === "string"
                            ? { passportTokenId: raw.passportTokenId.trim() }
                            : {}),
                        ...(typeof raw.did === "string" ? { did: raw.did.trim() } : {}),
                        ...(typeof raw.verifyUrl === "string"
                            ? { verifyUrl: raw.verifyUrl.trim() }
                            : {}),
                        ...(typeof raw.verifyRpcDocs === "string"
                            ? { verifyRpcDocs: raw.verifyRpcDocs.trim() }
                            : {}),
                        ...(Array.isArray(raw.channels)
                            ? { channels: raw.channels.map(String) }
                            : {}),
                        ...(Array.isArray(raw.contactUris)
                            ? { contactUris: raw.contactUris.map(String) }
                            : {}),
                    },
                };
            }

            try {
                const currentConfig = await deps.loadConfig();
                await deps.writeConfigFile(
                    buildRootConfigWithA2A(currentConfig, deps.buildConfigUpdate(patch)),
                );
                deps.updateLiveCard(patch);

                const changes: string[] = [];
                if (name) {
                    changes.push(`name: "${name}"`);
                }
                if (description) {
                    changes.push(`description: "${description}"`);
                }
                if (version) {
                    changes.push(`version: "${version}"`);
                }
                if (defaultInputModes) {
                    changes.push(`defaultInputModes: ${defaultInputModes.length} mode(s)`);
                }
                if (defaultOutputModes) {
                    changes.push(`defaultOutputModes: ${defaultOutputModes.length} mode(s)`);
                }
                if (skills) {
                    changes.push(`skills: ${skills.length} skill(s)`);
                }
                if (extensions) {
                    changes.push("extensions: updated");
                }

                return jsonResult({
                    updated: changes,
                    note: "Changes are live and persisted to config.",
                });
            } catch (err) {
                return jsonResult({
                    error: true,
                    error_message: `Failed to update agent card: ${err instanceof Error ? err.message : String(err)}`,
                });
            }
        },
    };
}
