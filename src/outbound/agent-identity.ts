// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import type { AgentCard } from "@a2a-js/sdk";

import { isPassportTokenId, normalizePassportTokenId } from "../auth/passport-token-id.js";

function passportTokenIdFromAgentCard(agentCard?: AgentCard): string | undefined {
    const extension = (agentCard as { extensions?: { identyclaw?: { passportTokenId?: unknown } } })
        ?.extensions?.identyclaw;
    const fromCard = extension?.passportTokenId;
    if (typeof fromCard === "string" && isPassportTokenId(fromCard)) {
        return normalizePassportTokenId(fromCard);
    }
    return undefined;
}

/** Passport token_id for an outbound peer when known (registry key or Agent Card extension). */
export function resolveOutboundTokenId(agentId: string, agentCard?: AgentCard): string | undefined {
    if (isPassportTokenId(agentId)) {
        return normalizePassportTokenId(agentId);
    }
    return passportTokenIdFromAgentCard(agentCard);
}

/**
 * Add an explicit peer identifier so LLM tools do not confuse Agent Card `name`
 * with the value passed to `a2a_send_message` and related tools.
 *
 * Passport peers expose `token_id` only. Legacy config aliases (e.g. dev self-loop
 * `self`) expose `agent_id` when no Passport token is known.
 */
export function enrichAgentSummaryForLlm(
    agentId: string,
    summary: Record<string, unknown>,
    agentCard?: AgentCard,
): Record<string, unknown> {
    const normalizedAgentId = agentId.trim();
    const tokenId = resolveOutboundTokenId(normalizedAgentId, agentCard);
    if (tokenId) {
        return {
            token_id: tokenId,
            ...summary,
        };
    }
    return {
        agent_id: normalizedAgentId,
        ...summary,
    };
}
