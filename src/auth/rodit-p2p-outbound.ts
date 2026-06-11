// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import type { OutboundAuthContext } from "./outbound-auth.js";
import {
    type RoditOutboundCredentials,
    resolveRoditOutboundCredentials,
} from "./rodit-outbound-credentials.js";
import { type RoditPeerLoginFn, defaultRoditPeerLogin } from "./rodit-peer-login.js";
import { agentCardUrlToLoginBase } from "./rodit-url.js";
import type { A2AOutboundRoditAuthConfig, A2AAgentEntry } from "../config.js";

const DEFAULT_JWT_CACHE_TTL_SECONDS = 300;

type CachedPeerToken = {
    token: string;
    expiresAtMs: number;
};

export class RoditP2pOutboundAuthProvider {
    private readonly cache = new Map<string, CachedPeerToken>();
    private readonly agents: Record<string, A2AAgentEntry>;

    constructor(
        private readonly config: A2AOutboundRoditAuthConfig,
        agents: Record<string, A2AAgentEntry>,
        private readonly peerLoginFn: RoditPeerLoginFn = defaultRoditPeerLogin,
    ) {
        this.agents = agents;
    }

    resolveCredentials(): RoditOutboundCredentials {
        return resolveRoditOutboundCredentials(this.config);
    }

    private cacheTtlMs(): number {
        const seconds = this.config.jwtCacheTtlSeconds ?? DEFAULT_JWT_CACHE_TTL_SECONDS;
        return Math.max(1, seconds) * 1000;
    }

    private resolvePeerLoginBase(context: OutboundAuthContext): string {
        const entry = this.agents[context.agentId];
        if (entry?.loginBaseUrl?.trim()) {
            return entry.loginBaseUrl.trim().replace(/\/$/, "");
        }
        // Config discovery URL is stable; resolved Agent Card `url` is the /a2a RPC endpoint.
        if (entry?.url?.trim()) {
            return agentCardUrlToLoginBase(entry.url.trim());
        }
        return agentCardUrlToLoginBase(context.agentCardUrl);
    }

    async getBearerToken(context?: OutboundAuthContext): Promise<string> {
        if (!context?.agentId || !context.agentCardUrl) {
            throw new Error("P2P RODiT outbound auth requires agentId and agentCardUrl");
        }

        const now = Date.now();
        const cached = this.cache.get(context.agentId);
        if (cached && now < cached.expiresAtMs) {
            return cached.token;
        }

        const token = await this.peerLoginFn(this.resolvePeerLoginBase(context), {
            loginPath: this.config.peerLoginPath,
            timestampPath: this.config.peerTimestampPath,
            logLevel: this.config.logLevel,
        });
        this.cache.set(context.agentId, {
            token,
            expiresAtMs: now + this.cacheTtlMs(),
        });
        return token;
    }

    async getAuthorizationHeader(context?: OutboundAuthContext): Promise<string> {
        return `Bearer ${await this.getBearerToken(context)}`;
    }

    invalidate(context?: OutboundAuthContext): void {
        if (context?.agentId) {
            this.cache.delete(context.agentId);
            return;
        }
        this.cache.clear();
    }
}
