// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import {
    AgentCardBuilder,
    DEFAULT_AGENT_CARD_INPUT_MODES,
    DEFAULT_AGENT_CARD_OUTPUT_MODES,
    DEFAULT_AGENT_SKILL_ID,
} from "../../src/inbound/agent-card.js";

describe("AgentCardBuilder", () => {
    const baseParams = {
        openclawConfig: {},
        publicUrl: "https://example.com",
    };

    test("uses agentCard name when set", () => {
        const card = new AgentCardBuilder({
            ...baseParams,
            agentCardConfig: { name: "Custom Name" },
        }).build();
        expect(card.name).toBe("Custom Name");
    });

    test("falls back to OpenClaw identity name", () => {
        const card = new AgentCardBuilder({
            ...baseParams,
            openclawConfig: {
                agents: {
                    list: [{ id: "main", identity: { name: "Identity Name" } }],
                },
            },
        }).build();
        expect(card.name).toBe("Identity Name");
    });

    test("falls back to agent name from config", () => {
        const card = new AgentCardBuilder({
            ...baseParams,
            openclawConfig: {
                agents: { list: [{ id: "main", name: "Agent Name" }] },
            },
        }).build();
        expect(card.name).toBe("Agent Name");
    });

    test("falls back to generic name with agent ID", () => {
        const card = new AgentCardBuilder(baseParams).build();
        expect(card.name).toBe("OpenClaw Agent (main)");
    });

    test("uses custom agentId for lookup", () => {
        const card = new AgentCardBuilder({
            ...baseParams,
            agentId: "custom",
            openclawConfig: {
                agents: {
                    list: [
                        { id: "main", identity: { name: "Main" } },
                        { id: "custom", identity: { name: "Custom" } },
                    ],
                },
            },
        }).build();
        expect(card.name).toBe("Custom");
    });

    test("sets A2A endpoint URL", () => {
        const card = new AgentCardBuilder(baseParams).build();
        expect(card.url).toBe("https://example.com/a2a");
    });

    test("uses publicBaseUrl-style external base for endpoint URL", () => {
        const card = new AgentCardBuilder({
            ...baseParams,
            publicUrl: "https://agent-a.diholai.io",
        }).build();
        expect(card.url).toBe("https://agent-a.diholai.io/a2a");
    });

    test("strips trailing slash from URL", () => {
        const card = new AgentCardBuilder({
            ...baseParams,
            publicUrl: "https://example.com/",
        }).build();
        expect(card.url).toBe("https://example.com/a2a");
    });

    test("uses per-agent rpcPath for the endpoint URL", () => {
        const card = new AgentCardBuilder({
            ...baseParams,
            agentId: "swe",
            rpcPath: "/a2a/swe",
        }).build();
        expect(card.url).toBe("https://example.com/a2a/swe");
    });

    test("sets protocol version and capabilities", () => {
        const card = new AgentCardBuilder(baseParams).build();
        expect(card.protocolVersion).toBe("0.3.0");
        expect(card.capabilities?.streaming).toBe(true);
        expect(card.capabilities?.pushNotifications).toBe(false);
        expect(card.defaultInputModes).toEqual(DEFAULT_AGENT_CARD_INPUT_MODES);
        expect(card.defaultOutputModes).toEqual(DEFAULT_AGENT_CARD_OUTPUT_MODES);
    });

    test("uses configured default input and output modes", () => {
        const card = new AgentCardBuilder({
            ...baseParams,
            agentCardConfig: {
                defaultInputModes: ["text"],
                defaultOutputModes: ["text"],
            },
        }).build();
        expect(card.defaultInputModes).toEqual(["text"]);
        expect(card.defaultOutputModes).toEqual(["text"]);
    });

    test("omits per-skill modes when not configured", () => {
        const card = new AgentCardBuilder({
            ...baseParams,
            agentCardConfig: {
                skills: [{ id: "chat", name: "Chat", description: "General chat" }],
            },
        }).build();
        expect(card.skills[0].inputModes).toBeUndefined();
        expect(card.skills[0].outputModes).toBeUndefined();
    });

    test("includes per-skill modes when configured", () => {
        const card = new AgentCardBuilder({
            ...baseParams,
            agentCardConfig: {
                skills: [
                    {
                        id: "chat",
                        name: "Chat",
                        description: "General chat",
                        inputModes: ["text"],
                        outputModes: ["text"],
                    },
                ],
            },
        }).build();
        expect(card.skills[0].inputModes).toEqual(["text"]);
        expect(card.skills[0].outputModes).toEqual(["text"]);
    });

    test("adds identyclaw extensions from config", () => {
        const card = new AgentCardBuilder({
            ...baseParams,
            agentCardConfig: {
                extensions: {
                    identyclaw: {
                        registryId: "com.identyclaw.lemuel_gulliver",
                        registryUrl:
                            "https://www.a2a-registry.org/agent/com.identyclaw.lemuel_gulliver",
                        passportTokenId: "Abcd1234efgh",
                        did: "did:rodit:Abcd1234efgh",
                        verifyUrl: "https://verify.identyclaw.com",
                        verifyRpcDocs: "npx @identyclaw/verify-hola report --rpc",
                        channels: ["a2a", "email", "discord", "telegram"],
                        contactUris: [
                            "a2a:identyclaw.com:https://identyclaw-concierge.identyclaw.com:7443",
                        ],
                    },
                },
            },
        }).build();
        expect(card.extensions).toEqual({
            identyclaw: {
                registryId: "com.identyclaw.lemuel_gulliver",
                registryUrl: "https://www.a2a-registry.org/agent/com.identyclaw.lemuel_gulliver",
                passportTokenId: "Abcd1234efgh",
                did: "did:rodit:Abcd1234efgh",
                verifyUrl: "https://verify.identyclaw.com",
                verifyRpcDocs: "npx @identyclaw/verify-hola report --rpc",
                channels: ["a2a", "email", "discord", "telegram"],
                contactUris: [
                    "a2a:identyclaw.com:https://identyclaw-concierge.identyclaw.com:7443",
                ],
            },
        });
    });

    test("builds a rich IdentyClaw concierge card", () => {
        const card = new AgentCardBuilder({
            openclawConfig: {},
            publicUrl: "https://identyclaw-concierge.identyclaw.com:7443",
            rpcPath: "",
            authRequired: true,
            authScheme: "jwt",
            agentCardConfig: {
                name: "Lemuel Gulliver",
                description:
                    "Lemuel Gulliver (IdentyClaw A2A) — identity onboarding, Passport guidance, live HOLA demos, and agent-to-agent assistance. Channels: A2A, email, Discord, Telegram.",
                version: "1.0.0",
                skills: [
                    {
                        id: "concierge",
                        name: "IdentyClaw Concierge",
                        description:
                            "Identity onboarding, Passport guidance, and agent-to-agent assistance via IdentyClaw.",
                        tags: ["identyclaw", "concierge", "a2a", "passport", "hola"],
                        examples: [
                            "Help me understand IdentyClaw Passport setup",
                            "What can you do over A2A?",
                            "Send me a HOLA I can verify",
                        ],
                        inputModes: ["text"],
                        outputModes: ["text"],
                    },
                    {
                        id: "verify_hola_explainer",
                        name: "HOLA mutual authentication",
                        description:
                            "Send a live HOLA demo; verify at verify.identyclaw.com or npx @identyclaw/verify-hola report --rpc",
                        tags: ["hola", "security"],
                    },
                    {
                        id: "enrollment_checklist",
                        name: "Enrollment checklist",
                        description:
                            "Step-by-step: NEAR key → mint at purchase.identyclaw.com → plugin → identyclaw_get_my_identity",
                        tags: ["identity", "enrollment", "openclaw", "near"],
                    },
                ],
                extensions: {
                    identyclaw: {
                        registryId: "com.identyclaw.lemuel_gulliver",
                        registryUrl:
                            "https://www.a2a-registry.org/agent/com.identyclaw.lemuel_gulliver",
                        passportTokenId: "REPLACE_WITH_LOBBY_TOKEN_ID",
                        did: "did:rodit:REPLACE_WITH_LOBBY_TOKEN_ID",
                        verifyUrl: "https://verify.identyclaw.com",
                        verifyRpcDocs: "npx @identyclaw/verify-hola report --rpc",
                        channels: ["a2a", "email", "discord", "telegram"],
                        contactUris: [
                            "a2a:identyclaw.com:https://identyclaw-concierge.identyclaw.com:7443",
                            "email:identyclaw.com:concierge@identyclaw.com",
                            "discord:identyclaw.com:identyclaw",
                            "telegram:identyclaw.com:@identyclaw",
                        ],
                    },
                },
            },
        }).build();

        expect(card.name).toBe("Lemuel Gulliver");
        expect(card.url).toBe("https://identyclaw-concierge.identyclaw.com:7443");
        expect(card.skills).toHaveLength(3);
        expect(card.skills[1].inputModes).toBeUndefined();
        expect(card.securitySchemes).toEqual({
            a2aBearerJwt: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT",
            },
        });
        expect(card.extensions?.identyclaw?.channels).toEqual([
            "a2a",
            "email",
            "discord",
            "telegram",
        ]);
    });

    test("builds skills from agentCard config", () => {
        const card = new AgentCardBuilder({
            ...baseParams,
            agentCardConfig: {
                skills: [{ id: "chat", name: "Chat", description: "General chat" }],
            },
        }).build();
        expect(card.skills).toHaveLength(1);
        expect(card.skills[0].id).toBe("chat");
    });

    test("returns a default skill when none configured", () => {
        const card = new AgentCardBuilder(baseParams).build();
        expect(card.skills).toHaveLength(1);
        expect(card.skills[0].id).toBe(DEFAULT_AGENT_SKILL_ID);
        expect(card.skills[0].name).toBe("OpenClaw Agent (main)");
        expect(card.skills[0].description).toBe("AI assistant powered by OpenClaw");
    });

    test("uses agentCard description", () => {
        const card = new AgentCardBuilder({
            ...baseParams,
            agentCardConfig: { description: "My custom description" },
        }).build();
        expect(card.description).toBe("My custom description");
    });

    test("falls back to default description", () => {
        const card = new AgentCardBuilder(baseParams).build();
        expect(card.description).toBe("AI assistant powered by OpenClaw");
    });

    test("adds JWT security schemes when auth uses rodit", () => {
        const card = new AgentCardBuilder({
            ...baseParams,
            authRequired: true,
            authScheme: "jwt",
        }).build();
        const raw = card as Record<string, unknown>;
        expect(raw.securitySchemes).toEqual({
            a2aBearerJwt: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT",
            },
        });
        expect(raw.security).toEqual([{ a2aBearerJwt: [] }]);
    });

    test("adds API key security schemes when auth uses apiKey", () => {
        const card = new AgentCardBuilder({ ...baseParams, authRequired: true }).build();
        const raw = card as Record<string, unknown>;
        expect(raw.securitySchemes).toBeDefined();
        expect(raw.security).toBeDefined();
    });

    test("omits security schemes when auth not required", () => {
        const card = new AgentCardBuilder(baseParams).build();
        const raw = card as Record<string, unknown>;
        expect(raw.securitySchemes).toBeUndefined();
        expect(raw.security).toBeUndefined();
    });
});
