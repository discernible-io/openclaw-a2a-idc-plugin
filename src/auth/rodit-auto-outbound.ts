// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import type { OutboundAuthContext, OutboundAuthProvider } from "./outbound-auth.js";
import type { A2AAgentEntry, A2AOutboundRoditAuthConfig } from "../config.js";
import { RoditOutboundAuthProvider } from "./rodit-outbound.js";
import { RoditP2pOutboundAuthProvider } from "./rodit-p2p-outbound.js";

/**
 * Phase 9C: try P2P peer login first; fall back to mediated IdentyClaw API login.
 */
export class RoditAutoOutboundAuthProvider implements OutboundAuthProvider {
    private readonly p2p: RoditP2pOutboundAuthProvider;
    private readonly mediated: RoditOutboundAuthProvider;

    constructor(config: A2AOutboundRoditAuthConfig, agents: Record<string, A2AAgentEntry>) {
        this.p2p = new RoditP2pOutboundAuthProvider(config, agents);
        this.mediated = new RoditOutboundAuthProvider(config);
    }

    async getAuthorizationHeader(context?: OutboundAuthContext): Promise<string | undefined> {
        if (!context?.agentId || !context.agentCardUrl) {
            return this.mediated.getAuthorizationHeader(context);
        }

        try {
            return await this.p2p.getAuthorizationHeader(context);
        } catch {
            return this.mediated.getAuthorizationHeader(context);
        }
    }

    invalidate(context?: OutboundAuthContext): void {
        this.p2p.invalidate(context);
        this.mediated.invalidate(context);
    }
}
