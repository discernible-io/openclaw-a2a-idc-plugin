// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import type { IncomingMessage } from "node:http";

import { type RoditJwtValidator, validateRoditInbound } from "../../src/auth/rodit-inbound.js";

function fakeReq(authorization?: string): IncomingMessage {
    return { headers: { authorization } } as unknown as IncomingMessage;
}

const roditConfig = {
    issuer: "https://api.identyclaw.com",
    audience: "agent-a.diholai.io",
    identityClaim: "token_id",
};

describe("validateRoditInbound", () => {
    test("rejects missing bearer token", async () => {
        const result = await validateRoditInbound(fakeReq(), roditConfig, async () => ({
            valid: true,
            payload: { token_id: "peer-a" },
        }));
        expect(result).toEqual({ ok: false, reason: "missing_token" });
    });

    test("accepts valid JWT and maps identity claim", async () => {
        const validateJwt: RoditJwtValidator = async (token, config) => {
            expect(token).toBe("valid.jwt.token");
            expect(config.audience).toBe("agent-a.diholai.io");
            return {
                valid: true,
                payload: { token_id: "peer-a", iss: config.issuer, aud: config.audience },
            };
        };

        const result = await validateRoditInbound(
            fakeReq("Bearer valid.jwt.token"),
            roditConfig,
            validateJwt,
        );
        expect(result).toEqual({ ok: true, label: "peer-a" });
    });

    test("rejects invalid JWT signature or validation failure", async () => {
        const validateJwt: RoditJwtValidator = async () => {
            throw new Error("invalid signature");
        };

        const result = await validateRoditInbound(
            fakeReq("Bearer bad.jwt.token"),
            roditConfig,
            validateJwt,
        );
        expect(result).toEqual({ ok: false, reason: "invalid_token" });
    });

    test("rejects JWT when identity claim is not a valid sender label", async () => {
        const validateJwt: RoditJwtValidator = async () => ({
            valid: true,
            payload: { token_id: "bad label with spaces" },
        });

        const result = await validateRoditInbound(
            fakeReq("Bearer valid.jwt.token"),
            roditConfig,
            validateJwt,
        );
        expect(result).toEqual({ ok: false, reason: "invalid_identity" });
    });

    test("uses custom identityClaim when configured", async () => {
        const validateJwt: RoditJwtValidator = async () => ({
            valid: true,
            payload: { account_id: "peer.account" },
        });

        const result = await validateRoditInbound(
            fakeReq("Bearer valid.jwt.token"),
            { ...roditConfig, identityClaim: "account_id" },
            validateJwt,
        );
        expect(result).toEqual({ ok: true, label: "peer.account" });
    });
});
