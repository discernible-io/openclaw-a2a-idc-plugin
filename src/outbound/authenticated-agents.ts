// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { A2AAgents } from "@a2anet/a2a-utils";
import type { AgentURLAndCustomHeaders } from "@a2anet/a2a-utils";

import { isPassportTokenId } from "../auth/passport-token-id.js";
import type { OutboundAuthProvider } from "../auth/outbound-auth.js";
import type { A2AAgentEntry } from "../config.js";
import type { TokenPeerResolver } from "./token-peer-resolver.js";

function stripAuthorizationHeader(headers: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === "authorization") {
            continue;
        }
        result[key] = value;
    }
    return result;
}

function prepareAgentConfig(
    agents: Record<string, A2AAgentEntry>,
    useRoditAuth: boolean,
): Record<string, A2AAgentEntry> {
    const prepared: Record<string, A2AAgentEntry> = {};
    for (const [agentId, entry] of Object.entries(agents)) {
        const custom_headers = entry.custom_headers
            ? useRoditAuth
                ? stripAuthorizationHeader(entry.custom_headers)
                : { ...entry.custom_headers }
            : undefined;
        prepared[agentId] = {
            url: entry.url,
            ...(custom_headers && Object.keys(custom_headers).length > 0 ? { custom_headers } : {}),
        };
    }
    return prepared;
}

/**
 * Wraps A2AAgents to inject dynamic Authorization headers from an outbound auth provider.
 */
export class AuthenticatedA2AAgents {
    private readonly inner: A2AAgents;

    constructor(
        agents: Record<string, A2AAgentEntry>,
        private readonly authProvider: OutboundAuthProvider | undefined,
        agentCardTimeout?: number,
        private readonly tokenPeerResolver?: TokenPeerResolver,
    ) {
        this.inner = new A2AAgents(prepareAgentConfig(agents, authProvider !== undefined), {
            timeout: agentCardTimeout,
        });
        this.tokenPeerResolver?.attachAgents(this);
    }

    get initializationErrors(): Record<string, string> {
        return this.inner.initializationErrors;
    }

    /** Prefetch remote agent cards (and outbound auth tokens when configured). */
    async warmUp(): Promise<void> {
        await this.getAgents();
    }

    private async mergeAuthHeaders(
        agentId: string,
        agent: AgentURLAndCustomHeaders,
    ): Promise<AgentURLAndCustomHeaders> {
        if (!this.authProvider) {
            return agent;
        }

        const authorization = await this.authProvider.getAuthorizationHeader({
            agentId,
            agentCardUrl: agent.agentCard.url,
        });
        if (!authorization) {
            return agent;
        }

        return {
            ...agent,
            customHeaders: {
                ...agent.customHeaders,
                Authorization: authorization,
            },
        };
    }

    async getAgent(agentId: string): Promise<AgentURLAndCustomHeaders | null> {
        let agent = await this.inner.getAgent(agentId);
        if (!agent && this.tokenPeerResolver && isPassportTokenId(agentId)) {
            await this.tokenPeerResolver.resolveAgentCardUrl(agentId);
            agent = await this.inner.getAgent(agentId);
        }
        if (!agent) {
            return null;
        }
        return this.mergeAuthHeaders(agentId, agent);
    }

    async getAgents(): Promise<Record<string, AgentURLAndCustomHeaders>> {
        const agents = await this.inner.getAgents();
        const merged: Record<string, AgentURLAndCustomHeaders> = {};
        for (const [agentId, agent] of Object.entries(agents)) {
            merged[agentId] = await this.mergeAuthHeaders(agentId, agent);
        }
        return merged;
    }

    async getAgentForLlm(
        agentId: string,
        detail?: "name" | "basic" | "skills" | "full",
    ): Promise<Record<string, unknown> | null> {
        return this.inner.getAgentForLlm(agentId, detail);
    }

    async getAgentsForLlm(
        detail?: "name" | "basic" | "skills" | "full",
    ): Promise<Record<string, Record<string, unknown>>> {
        return this.inner.getAgentsForLlm(detail);
    }

    async addAgent(
        agentId: string,
        url: string,
        customHeaders?: Record<string, string>,
    ): Promise<void> {
        const headers =
            this.authProvider && customHeaders
                ? stripAuthorizationHeader(customHeaders)
                : customHeaders;
        await this.inner.addAgent(agentId, url, headers);
    }

    /** Register a peer when absent; no-op if the id is already known. */
    async registerAgentIfAbsent(
        agentId: string,
        url: string,
        customHeaders?: Record<string, string>,
    ): Promise<void> {
        if (await this.inner.getAgent(agentId)) {
            return;
        }
        await this.addAgent(agentId, url, customHeaders);
    }
}
