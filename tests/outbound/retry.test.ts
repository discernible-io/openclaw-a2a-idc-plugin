// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";

import type { OutboundAuthProvider } from "../../src/auth/outbound-auth.js";
import { isLikelyAuthFailure, withOutboundAuthRetry } from "../../src/outbound/retry.js";

describe("withOutboundAuthRetry", () => {
    test("retries once after auth failure when provider is configured", async () => {
        let attempts = 0;
        const authProvider: OutboundAuthProvider = {
            getAuthorizationHeader: async () => "Bearer token",
            invalidate: () => {
                attempts += 1;
            },
        };

        const result = await withOutboundAuthRetry(authProvider, async () => {
            if (attempts === 0) {
                throw new Error("HTTP 401 Unauthorized");
            }
            return "ok";
        });

        expect(result).toBe("ok");
        expect(attempts).toBe(1);
    });

    test("does not retry non-auth failures", async () => {
        let invalidated = false;
        const authProvider: OutboundAuthProvider = {
            getAuthorizationHeader: async () => "Bearer token",
            invalidate: () => {
                invalidated = true;
            },
        };

        await expect(
            withOutboundAuthRetry(authProvider, async () => {
                throw new Error("network timeout");
            }),
        ).rejects.toThrow("network timeout");
        expect(invalidated).toBe(false);
    });
});

describe("isLikelyAuthFailure", () => {
    test("detects common auth error messages", () => {
        expect(isLikelyAuthFailure(new Error("HTTP 401 Unauthorized"))).toBe(true);
        expect(
            isLikelyAuthFailure(
                new Error("JSON-RPC error: Authentication required (code: -32001)"),
            ),
        ).toBe(true);
        expect(isLikelyAuthFailure(new Error("network timeout"))).toBe(false);
    });
});
