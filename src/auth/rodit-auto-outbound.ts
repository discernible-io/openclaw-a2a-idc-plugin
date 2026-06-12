// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import type { OutboundAuthContext, OutboundAuthProvider } from "./outbound-auth.js";
import type { A2AAgentEntry, A2AOutboundRoditAuthConfig } from "../config.js";
import { RoditOutboundAuthProvider, type RoditLoginFn } from "./rodit-outbound.js";
import { RoditP2pOutboundAuthProvider } from "./rodit-p2p-outbound.js";
import type { RoditPeerLoginFn } from "./rodit-peer-login.js";
import { agentCardUrlToLoginBase } from "./rodit-url.js";

export type OutboundAuthFallbackLogger = (message: string) => void;

export type RoditAutoOutboundAuthProviderOptions = {
    /** Required when P2P fails or context is incomplete (allowed-fallback-standard). */
    logWarn?: OutboundAuthFallbackLogger;
    peerLoginFn?: RoditPeerLoginFn;
    loginFn?: RoditLoginFn;
};

function resolvePeerLoginBase(
    agents: Record<string, A2AAgentEntry>,
    context: OutboundAuthContext,
): string {
    const entry = agents[context.agentId];
    if (entry?.loginBaseUrl?.trim()) {
        return entry.loginBaseUrl.trim().replace(/\/$/, "");
    }
    if (entry?.url?.trim()) {
        return agentCardUrlToLoginBase(entry.url.trim());
    }
    return agentCardUrlToLoginBase(context.agentCardUrl);
}

function formatP2pFailure(err: unknown): string {
    if (err instanceof Error) {
        return err.message;
    }
    return String(err);
}

/**
 * Phase 9C: try P2P peer login first; fall back to mediated IdentyClaw API login.
 * Fallbacks are logged when logWarn is provided (see allowed-fallback-standard).
 */
export class RoditAutoOutboundAuthProvider implements OutboundAuthProvider {
    private readonly p2p: RoditP2pOutboundAuthProvider;
    private readonly mediated: RoditOutboundAuthProvider;
    private readonly agents: Record<string, A2AAgentEntry>;
    private readonly logWarn?: OutboundAuthFallbackLogger;

    constructor(
        config: A2AOutboundRoditAuthConfig,
        agents: Record<string, A2AAgentEntry>,
        options?: RoditAutoOutboundAuthProviderOptions,
    ) {
        this.agents = agents;
        this.logWarn = options?.logWarn;
        this.p2p = new RoditP2pOutboundAuthProvider(config, agents, options?.peerLoginFn);
        this.mediated = new RoditOutboundAuthProvider(config, options?.loginFn);
    }

    private logMediatedFallback(reason: string, context?: OutboundAuthContext): void {
        const peerHint =
            context?.agentId && context.agentCardUrl
                ? ` for peer ${context.agentId} (${resolvePeerLoginBase(this.agents, context)})`
                : "";
        this.logWarn?.(
            `[a2a] Outbound auth fallback: ${reason}${peerHint}; using mediated login via IdentyClaw API`,
        );
    }

    async getAuthorizationHeader(context?: OutboundAuthContext): Promise<string | undefined> {
        if (!context?.agentId || !context.agentCardUrl) {
            this.logMediatedFallback("P2P login requires agentId and agentCardUrl");
            return this.mediated.getAuthorizationHeader(context);
        }

        try {
            return await this.p2p.getAuthorizationHeader(context);
        } catch (err) {
            this.logMediatedFallback(`P2P login failed (${formatP2pFailure(err)})`, context);
            return this.mediated.getAuthorizationHeader(context);
        }
    }

    invalidate(context?: OutboundAuthContext): void {
        this.p2p.invalidate(context);
        this.mediated.invalidate(context);
    }
}
