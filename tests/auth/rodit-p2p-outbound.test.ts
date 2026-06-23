// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";

import { createRoditOutboundAuthProvider } from "../../src/auth/create-rodit-outbound-auth.js";
import { RoditP2pOutboundAuthProvider } from "../../src/auth/rodit-p2p-outbound.js";
import type { RoditPeerLoginFn } from "../../src/auth/rodit-peer-login.js";

describe("createRoditOutboundAuthProvider", () => {
    test("returns P2P provider for rodit auth", () => {
        const provider = createRoditOutboundAuthProvider({ provider: "rodit" }, {});
        expect(provider).toBeInstanceOf(RoditP2pOutboundAuthProvider);
    });
});

describe("RoditP2pOutboundAuthProvider", () => {
    test("caches JWT per agent id", async () => {
        let loginCount = 0;
        const peerLoginFn: RoditPeerLoginFn = async (baseUrl) => {
            loginCount += 1;
            return `token-${baseUrl}-${loginCount}`;
        };

        const provider = new RoditP2pOutboundAuthProvider(
            { provider: "rodit", jwtCacheTtlSeconds: 300 },
            {
                peer: { url: "https://peer.example/.well-known/agent-card.json" },
            },
            peerLoginFn,
        );

        const context = {
            agentId: "peer",
            agentCardUrl: "https://peer.example/.well-known/agent-card.json",
        };

        await expect(provider.getAuthorizationHeader(context)).resolves.toBe(
            "Bearer token-https://peer.example-1",
        );
        await expect(provider.getAuthorizationHeader(context)).resolves.toBe(
            "Bearer token-https://peer.example-1",
        );
        expect(loginCount).toBe(1);
    });

    test("uses loginBaseUrl override when configured", async () => {
        const seen: string[] = [];
        const peerLoginFn: RoditPeerLoginFn = async (baseUrl) => {
            seen.push(baseUrl);
            return "jwt";
        };

        const provider = new RoditP2pOutboundAuthProvider(
            { provider: "rodit" },
            {
                peer: {
                    url: "https://wrong.example/.well-known/agent-card.json",
                    loginBaseUrl: "https://peer.example:9443",
                },
            },
            peerLoginFn,
        );

        await provider.getAuthorizationHeader({
            agentId: "peer",
            agentCardUrl: "https://wrong.example/.well-known/agent-card.json",
        });
        expect(seen).toEqual(["https://peer.example:9443"]);
    });

    test("requires agent context", async () => {
        const provider = new RoditP2pOutboundAuthProvider({ provider: "rodit" }, {}, async () => "jwt");

        await expect(provider.getAuthorizationHeader()).rejects.toThrow(/requires agentId/);
    });
});
