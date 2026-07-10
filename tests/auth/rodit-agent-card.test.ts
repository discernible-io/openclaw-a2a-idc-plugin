// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";

import {
    buildAgentCardConfigFromPassport,
    passportDisplayName,
    resolveRoditAgentCard,
} from "../../src/auth/rodit-agent-card.js";
import type { RoditOwnConfig } from "../../src/auth/rodit-own-config.js";

function makeOwnConfig(
    overrides: Partial<RoditOwnConfig["own_rodit"]> & {
        metadata?: Partial<RoditOwnConfig["own_rodit"]["metadata"]>;
    } = {},
): RoditOwnConfig {
    return {
        own_rodit: {
            token_id: "Abcd1234efgh",
            owner_id: "owner.near",
            metadata: {
                subjectuniqueidentifier_url: "https://api.identyclaw.com",
                webhook_url: "https://agent.example.com:9443/hooks/agent",
                userselected_dn: "Juanelo",
                ...overrides.metadata,
            },
            ...overrides,
        },
        own_rodit_bytes_private_key: new Uint8Array([1, 2, 3]),
    };
}

describe("passportDisplayName", () => {
    test("prefers DN creature and face", () => {
        expect(
            passportDisplayName({ userselected_dn: "Juanelo" }, { creature: "Archimedes", face: "Wise" }),
        ).toBe("Archimedes Wise");
    });

    test("ignores DN-style userselected_dn values", () => {
        expect(
            passportDisplayName({
                userselected_dn: "ContactUri=email:identyclaw.com:user@example.com",
            }),
        ).toBeUndefined();
    });

    test("uses plain userselected_dn when DN traits are absent", () => {
        expect(passportDisplayName({ userselected_dn: "Juanelo" })).toBe("Juanelo");
    });
});

describe("buildAgentCardConfigFromPassport", () => {
    test("maps passport token metadata into identyclaw extensions", () => {
        const card = buildAgentCardConfigFromPassport(makeOwnConfig(), {
            dn: { contactUri: "email:identyclaw.com:juanelo@example.com" },
        });

        expect(card.name).toBe("Juanelo");
        expect(card.extensions?.identyclaw).toEqual({
            passportTokenId: "Abcd1234efgh",
            did: "did:rodit:Abcd1234efgh",
            contactUris: ["email:identyclaw.com:juanelo@example.com"],
        });
    });

    test("parses ContactUri from userselected_dn when API DN is absent", () => {
        const card = buildAgentCardConfigFromPassport(
            makeOwnConfig({
                metadata: {
                    userselected_dn: "ContactUri=email:identyclaw.com:user@example.com",
                },
            }),
        );

        expect(card.extensions?.identyclaw?.contactUris).toEqual([
            "email:identyclaw.com:user@example.com",
        ]);
        expect(card.name).toBeUndefined();
    });
});

describe("resolveRoditAgentCard", () => {
    test("returns passport card defaults and public base URL", async () => {
        const ownConfig = makeOwnConfig();
        const result = await resolveRoditAgentCard(
            {},
            {
                getRoditOwnConfig: async () => ownConfig,
                fetchTokenIdentityFull: async () => ({
                    dn: { creature: "Juanelo", face: "Agent" },
                }),
            },
        );

        expect(result.agentCard?.name).toBe("Juanelo Agent");
        expect(result.agentCard?.extensions?.identyclaw?.passportTokenId).toBe("Abcd1234efgh");
        expect(result.publicBaseUrl).toBe("https://agent.example.com:9443");
    });

    test("falls back to chain metadata when identity API is unavailable", async () => {
        const result = await resolveRoditAgentCard(
            {},
            {
                getRoditOwnConfig: async () => makeOwnConfig(),
                fetchTokenIdentityFull: async () => {
                    throw new Error("API unavailable");
                },
            },
        );

        expect(result.agentCard?.name).toBe("Juanelo");
        expect(result.publicBaseUrl).toBe("https://agent.example.com:9443");
    });
});
