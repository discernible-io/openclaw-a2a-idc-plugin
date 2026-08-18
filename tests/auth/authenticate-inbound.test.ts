// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import type { IncomingMessage } from "node:http";

import { authenticateInboundRequest } from "../../src/auth/authenticate-inbound.js";
import type { RoditJwtValidator } from "../../src/auth/rodit-inbound.js";

function fakeReq(authorization?: string): IncomingMessage {
    return { headers: { authorization } } as unknown as IncomingMessage;
}

const roditConfig = {
    issuer: "https://api.identyclaw.com",
    audience: "agent-a.diholai.io",
    identityClaim: "token_id",
};

describe("authenticateInboundRequest", () => {
    test("returns anonymous identity when auth is not required", async () => {
        const result = await authenticateInboundRequest(fakeReq(), {
            required: false,
            mode: "apiKey",
        });
        expect(result).toEqual({ ok: true, identity: "anonymous", authMode: "anonymous" });
    });

    test("accepts valid API key", async () => {
        const result = await authenticateInboundRequest(fakeReq("Bearer abc123"), {
            required: true,
            mode: "apiKey",
            validKeys: [{ label: "peer-a", key: "abc123" }],
        });
        expect(result).toEqual({ ok: true, identity: "peer-a", authMode: "apiKey" });
    });

    test("rejects missing API key", async () => {
        const result = await authenticateInboundRequest(fakeReq(), {
            required: true,
            mode: "apiKey",
            validKeys: [{ label: "peer-a", key: "abc123" }],
        });
        expect(result).toEqual({
            ok: false,
            error: "Authentication required",
            reason: "missing_key",
        });
    });

    test("accepts valid RODiT JWT", async () => {
        const validateJwt: RoditJwtValidator = async () => ({
            valid: true,
            payload: { token_id: "peer-jwt" },
        });

        const result = await authenticateInboundRequest(
            fakeReq("Bearer eyJ.test.token"),
            {
                required: true,
                mode: "rodit",
                rodit: roditConfig,
            },
            { roditJwtValidator: validateJwt },
        );
        expect(result).toEqual({ ok: true, identity: "peer-jwt", authMode: "rodit" });
    });

    test("rejects expired or invalid RODiT JWT", async () => {
        const validateJwt: RoditJwtValidator = async () => null;

        const result = await authenticateInboundRequest(
            fakeReq("Bearer eyJ.test.token"),
            {
                required: true,
                mode: "rodit",
                rodit: roditConfig,
            },
            { roditJwtValidator: validateJwt },
        );
        expect(result).toEqual({
            ok: false,
            error: "Authentication required",
            reason: "invalid_token",
        });
    });

    test("falls back to API key when configured", async () => {
        const validateJwt: RoditJwtValidator = async () => null;

        const result = await authenticateInboundRequest(
            fakeReq("Bearer abc123"),
            {
                required: true,
                mode: "rodit",
                rodit: roditConfig,
                validKeys: [{ label: "dev-key", key: "abc123" }],
                allowApiKeyFallback: true,
            },
            { roditJwtValidator: validateJwt },
        );
        expect(result).toEqual({ ok: true, identity: "dev-key", authMode: "apiKey" });
    });
});
