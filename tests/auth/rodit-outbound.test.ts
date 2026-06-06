// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, test } from "bun:test";

import { type RoditLoginFn, RoditOutboundAuthProvider } from "../../src/auth/rodit-outbound.js";

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

describe("RoditOutboundAuthProvider", () => {
    test("reads default env var names", () => {
        process.env.IDENTYCLAW_ACCOUNT_ID = "agent-a.near";
        process.env.IDENTYCLAW_NEAR_PRIVATE_KEY = "ed25519:abc";
        process.env.IDENTYCLAW_BASE_URL = "https://api.identyclaw.com";

        const provider = new RoditOutboundAuthProvider({ provider: "rodit" });
        expect(provider.resolveCredentials()).toEqual({
            accountId: "agent-a.near",
            privateKey: "ed25519:abc",
            baseUrl: "https://api.identyclaw.com",
        });
    });

    test("caches JWT until TTL expires", async () => {
        process.env.IDENTYCLAW_ACCOUNT_ID = "agent-a.near";
        process.env.IDENTYCLAW_NEAR_PRIVATE_KEY = "abc";
        process.env.IDENTYCLAW_BASE_URL = "https://api.identyclaw.com";

        let loginCount = 0;
        const loginFn: RoditLoginFn = async () => {
            loginCount += 1;
            return `token-${loginCount}`;
        };

        const provider = new RoditOutboundAuthProvider(
            { provider: "rodit", jwtCacheTtlSeconds: 300 },
            loginFn,
        );

        await expect(provider.getAuthorizationHeader()).resolves.toBe("Bearer token-1");
        await expect(provider.getAuthorizationHeader()).resolves.toBe("Bearer token-1");
        expect(loginCount).toBe(1);
    });

    test("refreshes JWT after invalidate", async () => {
        process.env.IDENTYCLAW_ACCOUNT_ID = "agent-a.near";
        process.env.IDENTYCLAW_NEAR_PRIVATE_KEY = "abc";
        process.env.IDENTYCLAW_BASE_URL = "https://api.identyclaw.com";

        let loginCount = 0;
        const loginFn: RoditLoginFn = async () => {
            loginCount += 1;
            return `token-${loginCount}`;
        };

        const provider = new RoditOutboundAuthProvider({ provider: "rodit" }, loginFn);

        await expect(provider.getBearerToken()).resolves.toBe("token-1");
        provider.invalidate();
        await expect(provider.getBearerToken()).resolves.toBe("token-2");
        expect(loginCount).toBe(2);
    });
});
