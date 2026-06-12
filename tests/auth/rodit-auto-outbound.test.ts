// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, test } from "bun:test";

import { createRoditOutboundAuthProvider } from "../../src/auth/create-rodit-outbound-auth.js";
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

const peerContext = {
    agentId: "peer",
    agentCardUrl: "https://peer.example/.well-known/agent-card.json",
};

const peerAgents = {
    peer: {
        url: "https://peer.example/.well-known/agent-card.json",
        loginBaseUrl: "https://peer.example:7443",
    },
};

describe("RoditAutoOutboundAuthProvider", () => {
    test("factory selects auto provider", () => {
        const provider = createRoditOutboundAuthProvider(
            { provider: "rodit", mode: "auto" },
            { peer: { url: "https://peer.example/.well-known/agent-card.json" } },
        );
        expect(provider).toBeInstanceOf(RoditAutoOutboundAuthProvider);
    });

    test("uses P2P JWT when peer login succeeds", async () => {
        process.env.IDENTYCLAW_ACCOUNT_ID = "agent-a.near";
        process.env.IDENTYCLAW_NEAR_PRIVATE_KEY = "abc";
        process.env.IDENTYCLAW_BASE_URL = "https://api.identyclaw.com";

        const peerLoginFn: RoditPeerLoginFn = async () => "p2p-jwt";
        const loginFn: RoditLoginFn = async () => {
            throw new Error("mediated should not run");
        };
        const warnings: string[] = [];

        const provider = new RoditAutoOutboundAuthProvider(
            { provider: "rodit", mode: "auto" },
            peerAgents,
            {
                logWarn: (message) => warnings.push(message),
                peerLoginFn,
                loginFn,
            },
        );

        await expect(provider.getAuthorizationHeader(peerContext)).resolves.toBe("Bearer p2p-jwt");
        expect(warnings).toHaveLength(0);
    });

    test("logs and falls back to mediated when P2P login fails", async () => {
        process.env.IDENTYCLAW_ACCOUNT_ID = "agent-a.near";
        process.env.IDENTYCLAW_NEAR_PRIVATE_KEY = "abc";
        process.env.IDENTYCLAW_BASE_URL = "https://api.identyclaw.com";

        const peerLoginFn: RoditPeerLoginFn = async () => {
            throw new Error("peer unreachable");
        };
        const loginFn: RoditLoginFn = async () => "mediated-jwt";
        const warnings: string[] = [];

        const provider = new RoditAutoOutboundAuthProvider(
            { provider: "rodit", mode: "auto" },
            peerAgents,
            {
                logWarn: (message) => warnings.push(message),
                peerLoginFn,
                loginFn,
            },
        );

        await expect(provider.getAuthorizationHeader(peerContext)).resolves.toBe(
            "Bearer mediated-jwt",
        );

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("Outbound auth fallback");
        expect(warnings[0]).toContain("P2P login failed (peer unreachable)");
        expect(warnings[0]).toContain("https://peer.example:7443");
        expect(warnings[0]).toContain("mediated login");
    });

    test("logs and falls back when agent context is missing", async () => {
        process.env.IDENTYCLAW_ACCOUNT_ID = "agent-a.near";
        process.env.IDENTYCLAW_NEAR_PRIVATE_KEY = "abc";
        process.env.IDENTYCLAW_BASE_URL = "https://api.identyclaw.com";

        const loginFn: RoditLoginFn = async () => "mediated-jwt";
        const warnings: string[] = [];

        const provider = new RoditAutoOutboundAuthProvider(
            { provider: "rodit", mode: "auto" },
            {},
            {
                logWarn: (message) => warnings.push(message),
                loginFn,
            },
        );

        await expect(provider.getAuthorizationHeader()).resolves.toBe("Bearer mediated-jwt");
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("agentId and agentCardUrl");
    });
});
