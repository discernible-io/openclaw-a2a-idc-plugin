// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { normalizeGatewayBase } from "./contact-uri.js";
import type { TokenIdentityFullResponse } from "./identyclaw-api-client.js";

export function extractWebhookUrlFromIdentity(
    identity: Pick<TokenIdentityFullResponse, "metadata">,
): string | null {
    const raw = identity.metadata?.webhook_url ?? identity.metadata?.webhookUrl ?? "";
    const trimmed = String(raw ?? "").trim();
    return trimmed || null;
}

export function webhookUrlToGatewayBase(webhookUrl: string): string | null {
    const trimmed = String(webhookUrl ?? "").trim();
    if (!trimmed || /^mailto:/i.test(trimmed) || /^email:/i.test(trimmed)) {
        return null;
    }
    const base = normalizeGatewayBase(trimmed);
    if (!base || !/^https?:\/\//i.test(base)) {
        return null;
    }
    return base;
}

export function webhookUrlToAgentCardUrl(webhookUrl: string): string | null {
    const base = webhookUrlToGatewayBase(webhookUrl);
    return base ? `${base}/.well-known/agent-card.json` : null;
}
