// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import type { A2AAgentCardConfig, A2AIdentyclawExtensionConfig } from "../config.js";
import { webhookUrlToGatewayBase } from "./gateway-url.js";
import {
    fetchTokenIdentityFull,
    type TokenIdentityFullResponse,
} from "./identyclaw-api-client.js";
import { getRoditOwnConfig, type RoditOwnConfig } from "./rodit-own-config.js";

export type RoditAgentCardResolverDeps = {
    getRoditOwnConfig: (logLevel?: string) => Promise<RoditOwnConfig>;
    fetchTokenIdentityFull?: (
        tokenId: string,
        options?: { logLevel?: string },
    ) => Promise<TokenIdentityFullResponse>;
};

export type ResolveRoditAgentCardResult = {
    agentCard?: A2AAgentCardConfig;
    /**
     * Passport `own_rodit.metadata.webhook_url` normalized to `scheme://host[:port]`.
     * This is the shared public ingress for A2A JSON-RPC and IdentyClaw webhooks.
     */
    publicBaseUrl?: string;
};

function parseContactUriFromUserSelectedDn(userselectedDn: string): string | undefined {
    const match = userselectedDn.match(/(?:^|,)ContactUri=([^,]+)/i);
    return match?.[1]?.trim() || undefined;
}

/** Resolve a human-readable Agent Card name from Passport metadata and DN traits. */
export function passportDisplayName(
    metadata?: { userselected_dn?: string },
    dn?: TokenIdentityFullResponse["dn"],
): string | undefined {
    const creature = typeof dn?.creature === "string" ? dn.creature.trim() : "";
    const face = typeof dn?.face === "string" ? dn.face.trim() : "";
    if (creature && face) {
        return `${creature} ${face}`;
    }
    if (creature) {
        return creature;
    }
    if (face) {
        return face;
    }

    const raw = metadata?.userselected_dn?.trim();
    if (!raw || raw.includes("=")) {
        return undefined;
    }
    return raw;
}

export function buildAgentCardConfigFromPassport(
    ownConfig: RoditOwnConfig,
    identity?: TokenIdentityFullResponse,
): A2AAgentCardConfig {
    const tokenId = ownConfig.own_rodit.token_id.trim();
    const metadata = ownConfig.own_rodit.metadata;
    const dn = identity?.dn ?? undefined;

    const identyclaw: A2AIdentyclawExtensionConfig = {
        passportTokenId: tokenId,
        did: `did:rodit:${tokenId}`,
    };

    const contactUris: string[] = [];
    const dnContact = typeof dn?.contactUri === "string" ? dn.contactUri.trim() : "";
    if (dnContact) {
        contactUris.push(dnContact);
    }
    const fromDn = metadata.userselected_dn
        ? parseContactUriFromUserSelectedDn(metadata.userselected_dn)
        : undefined;
    if (fromDn && !contactUris.includes(fromDn)) {
        contactUris.push(fromDn);
    }
    if (contactUris.length > 0) {
        identyclaw.contactUris = contactUris;
    }

    const card: A2AAgentCardConfig = {
        extensions: { identyclaw },
    };

    const name = passportDisplayName(metadata, dn);
    if (name) {
        card.name = name;
    }

    return card;
}

function resolvePublicBaseUrlFromPassport(
    ownConfig: RoditOwnConfig,
    identity?: TokenIdentityFullResponse,
): string | undefined {
    const fromOwn = ownConfig.own_rodit.metadata.webhook_url?.trim();
    const fromIdentity =
        identity?.metadata?.webhook_url?.trim() || identity?.metadata?.webhookUrl?.trim();
    const webhookUrl = fromOwn || fromIdentity;
    if (!webhookUrl) {
        return undefined;
    }
    return webhookUrlToGatewayBase(webhookUrl) ?? undefined;
}

/**
 * Build inbound Agent Card defaults from the local Passport via `RoditClient.getConfigOwnRodit()`,
 * optionally enriched with IdentyClaw `GET /api/identity/token/{tokenId}/full`.
 */
export async function resolveRoditAgentCard(
    options?: { logLevel?: string },
    deps: RoditAgentCardResolverDeps = {
        getRoditOwnConfig,
        fetchTokenIdentityFull,
    },
): Promise<ResolveRoditAgentCardResult> {
    const ownConfig = await deps.getRoditOwnConfig(options?.logLevel);
    const tokenId = ownConfig.own_rodit.token_id.trim();

    let identity: TokenIdentityFullResponse | undefined;
    if (deps.fetchTokenIdentityFull) {
        try {
            identity = await deps.fetchTokenIdentityFull(tokenId, { logLevel: options?.logLevel });
        } catch {
            identity = undefined;
        }
    }

    return {
        agentCard: buildAgentCardConfigFromPassport(ownConfig, identity),
        publicBaseUrl: resolvePublicBaseUrlFromPassport(ownConfig, identity),
    };
}
