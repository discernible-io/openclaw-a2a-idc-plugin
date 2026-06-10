// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, test } from "bun:test";

import { createRoditOutboundAuthProvider } from "../../src/auth/create-rodit-outbound-auth.js";
import { RoditOutboundAuthProvider } from "../../src/auth/rodit-outbound.js";
import { RoditP2pOutboundAuthProvider } from "../../src/auth/rodit-p2p-outbound.js";
import { RoditAutoOutboundAuthProvider } from "../../src/auth/rodit-auto-outbound.js";
import type { RoditPeerLoginFn } from "../../src/auth/rodit-peer-login.js";
import type { RoditLoginFn } from "../../src/auth/rodit-outbound.js";

const originalEnv = {
    accountId: process.env.IDENTYCLAW_ACCOUNT_ID,
    privateKey: process.env.IDENTYCLAW_NEAR_PRIVATE_KEY,
    baseUrl: process.env.IDENTYCLAW_BASE_URL,
};

afterEach(() => {
    process.env.IDENTYCLAW_ACCOUNT_ID = originalEnv.accountId;
    process.env.IDENTYCLAW_NEAR_PRIVATE_KEY = originalEnv.privateKey;
    process.env.IDENTYCLAW_BASE_URL = originalEnv.baseUrl;
});

describe("createRoditOutboundAuthProvider", () => {
    test("defaults to mediated provider", () => {
        const provider = createRoditOutboundAuthProvider({ provider: "rodit" }, {});
        expect(provider).toBeInstanceOf(RoditOutboundAuthProvider);
    });

    test("selects P2P provider when mode is p2p", () => {
        const provider = createRoditOutboundAuthProvider(
            { provider: "rodit", mode: "p2p" },
            { peer: { url: "https://peer.example/.well-known/agent-card.json" } },
        );
        expect(provider).toBeInstanceOf(RoditP2pOutboundAuthProvider);
    });

    test("selects auto provider when mode is auto", () => {
        const provider = createRoditOutboundAuthProvider(
            { provider: "rodit", mode: "auto" },
            { peer: { url: "https://peer.example/.well-known/agent-card.json" } },
        );
        expect(provider).toBeInstanceOf(RoditAutoOutboundAuthProvider);
    });
});

describe("RoditP2pOutboundAuthProvider", () => {
    test("caches JWT per agent id", async () => {
        process.env.IDENTYCLAW_ACCOUNT_ID = "agent-a.near";
        process.env.IDENTYCLAW_NEAR_PRIVATE_KEY = "abc";
        process.env.IDENTYCLAW_BASE_URL = "https://api.identyclaw.com";

        let loginCount = 0;
        const peerLoginFn: RoditPeerLoginFn = async (baseUrl) => {
            loginCount += 1;
            return `token-${baseUrl}-${loginCount}`;
        };

        const provider = new RoditP2pOutboundAuthProvider(
            { provider: "rodit", mode: "p2p", jwtCacheTtlSeconds: 300 },
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
        process.env.IDENTYCLAW_ACCOUNT_ID = "agent-a.near";
        process.env.IDENTYCLAW_NEAR_PRIVATE_KEY = "abc";
        process.env.IDENTYCLAW_BASE_URL = "https://api.identyclaw.com";

        const seen: string[] = [];
        const peerLoginFn: RoditPeerLoginFn = async (baseUrl) => {
            seen.push(baseUrl);
            return "jwt";
        };

        const provider = new RoditP2pOutboundAuthProvider(
            { provider: "rodit", mode: "p2p" },
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
        process.env.IDENTYCLAW_ACCOUNT_ID = "agent-a.near";
        process.env.IDENTYCLAW_NEAR_PRIVATE_KEY = "abc";
        process.env.IDENTYCLAW_BASE_URL = "https://api.identyclaw.com";

        const provider = new RoditP2pOutboundAuthProvider(
            { provider: "rodit", mode: "p2p" },
            {},
            async () => "jwt",
        );

        await expect(provider.getAuthorizationHeader()).rejects.toThrow(/requires agentId/);
    });
});

describe("RoditOutboundAuthProvider mediated compatibility", () => {
    test("ignores outbound auth context", async () => {
        process.env.IDENTYCLAW_ACCOUNT_ID = "agent-a.near";
        process.env.IDENTYCLAW_NEAR_PRIVATE_KEY = "abc";
        process.env.IDENTYCLAW_BASE_URL = "https://api.identyclaw.com";

        let loginCount = 0;
        const loginFn: RoditLoginFn = async () => {
            loginCount += 1;
            return `token-${loginCount}`;
        };

        const provider = new RoditOutboundAuthProvider({ provider: "rodit" }, loginFn);

        await expect(
            provider.getAuthorizationHeader({
                agentId: "peer",
                agentCardUrl: "https://peer.example/.well-known/agent-card.json",
            }),
        ).resolves.toBe("Bearer token-1");
        expect(loginCount).toBe(1);
    });
});
