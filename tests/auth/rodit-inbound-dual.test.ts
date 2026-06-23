// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";

import {
    resolveInboundAudienceProfiles,
    type RoditJwtValidator,
    validateRoditInbound,
} from "../../src/auth/rodit-inbound.js";
import type { IncomingMessage } from "node:http";

function fakeReq(authorization?: string): IncomingMessage {
    return { headers: { authorization } } as unknown as IncomingMessage;
}

describe("resolveInboundAudienceProfiles", () => {
    test("uses configured issuer and audience", () => {
        expect(
            resolveInboundAudienceProfiles({
                issuer: "https://api.identyclaw.com",
                audience: "own-owner-id",
            }),
        ).toEqual([{ issuer: "https://api.identyclaw.com", audience: "own-owner-id" }]);
    });
});

describe("validateRoditInbound", () => {
    test("accepts token matching audience profile", async () => {
        const validateJwt: RoditJwtValidator = async (_token, config) => {
            if (config.audience === "own-owner-id") {
                return { valid: true, payload: { rodit_id: "peer-a" } };
            }
            return { valid: false };
        };

        const result = await validateRoditInbound(
            fakeReq("Bearer token"),
            {
                issuer: "https://api.identyclaw.com",
                audience: "own-owner-id",
                identityClaim: "rodit_id",
            },
            validateJwt,
        );

        expect(result).toEqual({ ok: true, label: "peer-a" });
    });

    test("retries after validator throws on mismatch", async () => {
        const attempts: string[] = [];
        const validateJwt: RoditJwtValidator = async (_token, config) => {
            attempts.push(config.audience);
            if (config.audience === "wrong-aud") {
                throw new Error("Error 004: Invalid audience");
            }
            return { valid: true, payload: { rodit_id: "peer-a" } };
        };

        const result = await validateRoditInbound(
            fakeReq("Bearer token"),
            {
                issuer: "https://api.identyclaw.com",
                audience: "own-owner-id",
                identityClaim: "rodit_id",
            },
            validateJwt,
        );

        expect(result).toEqual({ ok: true, label: "peer-a" });
        expect(attempts).toEqual(["own-owner-id"]);
    });
});
