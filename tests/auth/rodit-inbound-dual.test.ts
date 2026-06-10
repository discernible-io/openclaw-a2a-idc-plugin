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
    test("mediated mode uses single profile", () => {
        expect(
            resolveInboundAudienceProfiles({
                mode: "mediated",
                issuer: "https://api.identyclaw.com",
                audience: "service-aud",
            }),
        ).toEqual([{ issuer: "https://api.identyclaw.com", audience: "service-aud" }]);
    });

    test("dual mode returns mediated then p2p profiles", () => {
        expect(
            resolveInboundAudienceProfiles({
                mode: "dual",
                issuer: "https://api.identyclaw.com",
                audience: "service-aud",
                p2pAudience: "own-aud",
                p2pIssuer: "https://agent-a.example:9443",
            }),
        ).toEqual([
            { issuer: "https://api.identyclaw.com", audience: "service-aud" },
            { issuer: "https://api.identyclaw.com", audience: "own-aud" },
        ]);
    });
});

describe("validateRoditInbound dual mode", () => {
    test("accepts token matching second profile when first fails", async () => {
        const attempts: string[] = [];
        const validateJwt: RoditJwtValidator = async (_token, config) => {
            attempts.push(config.audience);
            if (config.audience === "service-aud") {
                return { valid: false };
            }
            if (config.audience === "own-aud") {
                return { valid: true, payload: { rodit_id: "peer-a" } };
            }
            return { valid: false };
        };

        const result = await validateRoditInbound(
            fakeReq("Bearer token"),
            {
                mode: "dual",
                issuer: "https://api.identyclaw.com",
                audience: "service-aud",
                p2pAudience: "own-aud",
                p2pIssuer: "https://agent-b.example:4443",
                identityClaim: "rodit_id",
            },
            validateJwt,
        );

        expect(result).toEqual({ ok: true, label: "peer-a" });
        expect(attempts).toEqual(["service-aud", "own-aud"]);
    });
});
