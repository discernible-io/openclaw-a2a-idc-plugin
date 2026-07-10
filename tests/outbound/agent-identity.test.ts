// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import type { AgentCard } from "@a2a-js/sdk";

import {
    enrichAgentSummaryForLlm,
    resolveOutboundTokenId,
} from "../../src/outbound/agent-identity.js";

const sampleCard = (overrides: Partial<AgentCard> = {}): AgentCard => ({
    name: "Juanelo",
    description: "Peer agent",
    protocolVersion: "0.3.0",
    version: "1.0.0",
    url: "https://peer.example.com/a2a",
    capabilities: { streaming: true },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills: [],
    ...overrides,
});

describe("resolveOutboundTokenId", () => {
    test("uses the registry key when it is a Passport token_id", () => {
        expect(resolveOutboundTokenId("Lncqsncdshcj")).toBe("lncqsncdshcj");
    });

    test("reads passportTokenId from identyclaw Agent Card extensions", () => {
        expect(
            resolveOutboundTokenId(
                "peer-alias",
                sampleCard({
                    extensions: {
                        identyclaw: {
                            passportTokenId: "Abcd1234efgh",
                        },
                    },
                }),
            ),
        ).toBe("abcd1234efgh");
    });

    test("returns undefined for non-passport registry keys without card metadata", () => {
        expect(resolveOutboundTokenId("self")).toBeUndefined();
    });
});

describe("enrichAgentSummaryForLlm", () => {
    test("exposes token_id only for passport registry keys", () => {
        expect(
            enrichAgentSummaryForLlm(
                "lncqsncdshcj",
                { name: "Juanelo", description: "Peer agent" },
                sampleCard(),
            ),
        ).toEqual({
            token_id: "lncqsncdshcj",
            name: "Juanelo",
            description: "Peer agent",
        });
    });

    test("keeps token_id separate from display name", () => {
        const enriched = enrichAgentSummaryForLlm(
            "lncqsncdshcj",
            { name: "Juanelo", description: "Peer agent" },
            sampleCard({ name: "Juanelo" }),
        );
        expect(enriched.token_id).toBe("lncqsncdshcj");
        expect(enriched.name).toBe("Juanelo");
        expect(enriched.agent_id).toBeUndefined();
    });

    test("exposes agent_id only for legacy non-passport config aliases", () => {
        expect(
            enrichAgentSummaryForLlm("self", { name: "Self-Loop Agent", description: "Dev peer" }),
        ).toEqual({
            agent_id: "self",
            name: "Self-Loop Agent",
            description: "Dev peer",
        });
    });

    test("prefers token_id when the Agent Card advertises a passportTokenId", () => {
        expect(
            enrichAgentSummaryForLlm(
                "peer-alias",
                { name: "Juanelo", description: "Peer agent" },
                sampleCard({
                    extensions: {
                        identyclaw: {
                            passportTokenId: "Abcd1234efgh",
                        },
                    },
                }),
            ),
        ).toEqual({
            token_id: "abcd1234efgh",
            name: "Juanelo",
            description: "Peer agent",
        });
    });
});
