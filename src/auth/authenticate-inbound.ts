// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import type { IncomingMessage } from "node:http";

import type { A2AInboundKey } from "../config.js";
import { validateApiKey } from "../inbound/auth.js";
import { type RoditJwtValidator, validateRoditInbound } from "./rodit-inbound.js";

export type InboundAuthMode = "apiKey" | "rodit";

export type A2AAuthConfig = {
    required: boolean;
    mode: InboundAuthMode;
    validKeys?: A2AInboundKey[];
    rodit?: import("../config.js").A2AInboundRoditAuthConfig;
    allowApiKeyFallback?: boolean;
};

export type InboundAuthResult = { ok: true; identity: string } | { ok: false; error: string };

export type AuthenticateInboundOptions = {
    roditJwtValidator?: RoditJwtValidator;
};

export async function authenticateInboundRequest(
    req: IncomingMessage,
    auth: A2AAuthConfig,
    options: AuthenticateInboundOptions = {},
): Promise<InboundAuthResult> {
    if (!auth.required) {
        return { ok: true, identity: "anonymous" };
    }

    if (auth.mode === "rodit") {
        if (!auth.rodit) {
            return { ok: false, error: "Authentication required" };
        }

        const roditResult = await validateRoditInbound(req, auth.rodit, options.roditJwtValidator);
        if (roditResult.ok) {
            return { ok: true, identity: roditResult.label };
        }

        if (auth.allowApiKeyFallback && auth.validKeys && auth.validKeys.length > 0) {
            const apiKeyResult = validateApiKey(req, auth.validKeys);
            if (apiKeyResult.ok) {
                return { ok: true, identity: apiKeyResult.label };
            }
        }

        return { ok: false, error: "Authentication required" };
    }

    const apiKeyResult = validateApiKey(req, auth.validKeys ?? []);
    if (!apiKeyResult.ok) {
        return { ok: false, error: "Authentication required" };
    }

    return { ok: true, identity: apiKeyResult.label };
}
