// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import type { IncomingMessage } from "node:http";

import type { A2AInboundRoditAuthConfig } from "../config.js";
import { extractBearerToken } from "../inbound/auth.js";
import { parseA2AInboundKeyLabel } from "../utils/inbound-key-label.js";
import { loadRoditAuthBe } from "./rodit-runtime.js";

type RoditAudienceRodit = {
    token_id: string;
    owner_id: string;
    metadata: {
        subjectuniqueidentifier_url: string;
    };
};

type RoditJwtValidateResult = {
    valid?: boolean;
    payload?: Record<string, unknown>;
    peer_rodit?: { token_id?: string };
};

export type RoditInboundValidateResult =
    | { ok: true; label: string }
    | { ok: false; reason: string };

export type RoditJwtValidator = (
    token: string,
    config: A2AInboundRoditAuthConfig,
) => Promise<RoditJwtValidateResult | null>;

function buildAudienceRodit(config: A2AInboundRoditAuthConfig): RoditAudienceRodit {
    return {
        token_id: "a2a-inbound",
        owner_id: config.audience,
        metadata: {
            subjectuniqueidentifier_url: config.issuer,
        },
    };
}

export const defaultRoditJwtValidator: RoditJwtValidator = async (token, config) => {
    const { validate_jwt_token_be } = loadRoditAuthBe({ logLevel: config.logLevel });
    return validate_jwt_token_be(token, buildAudienceRodit(config), {
        enforceSessionRegistration: false,
    });
};

function resolveIdentityLabel(
    payload: Record<string, unknown>,
    config: A2AInboundRoditAuthConfig,
    peerRodit?: { token_id?: string },
): string | undefined {
    const claim = config.identityClaim ?? "token_id";
    const candidates = [payload[claim], peerRodit?.token_id, payload.token_id, payload.rodit_id];

    for (const candidate of candidates) {
        const label = parseA2AInboundKeyLabel(candidate);
        if (label) {
            return label;
        }
    }

    return undefined;
}

export async function validateRoditInbound(
    req: IncomingMessage,
    config: A2AInboundRoditAuthConfig,
    validateJwt: RoditJwtValidator = defaultRoditJwtValidator,
): Promise<RoditInboundValidateResult> {
    const token = extractBearerToken(req);
    if (!token) {
        return { ok: false, reason: "missing_token" };
    }

    try {
        const result = await validateJwt(token, config);
        if (!result?.valid || !result.payload) {
            return { ok: false, reason: "invalid_token" };
        }

        const label = resolveIdentityLabel(result.payload, config, result.peer_rodit);
        if (!label) {
            return { ok: false, reason: "invalid_identity" };
        }

        return { ok: true, label };
    } catch {
        return { ok: false, reason: "invalid_token" };
    }
}
