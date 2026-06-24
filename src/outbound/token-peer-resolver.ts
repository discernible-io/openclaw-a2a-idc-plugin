// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import * as fs from "node:fs";
import * as path from "node:path";

import { extractWebhookUrlFromIdentity, webhookUrlToAgentCardUrl } from "../auth/gateway-url.js";
import {
    type TokenIdentityFullResponse,
    fetchTokenIdentityFull,
} from "../auth/identyclaw-api-client.js";
import { isPassportTokenId, normalizePassportTokenId } from "../auth/passport-token-id.js";
import { type PeerRodit, fetchPeerRoditByTokenId } from "../auth/rodit-peer-by-token-id.js";
import type { AuthenticatedA2AAgents } from "./authenticated-agents.js";

type PeerResolutionSource = "api" | "chain";

type PersistedPeerRegistry = Record<
    string,
    {
        url: string;
        resolvedAt: string;
        source?: PeerResolutionSource;
    }
>;

export type TokenPeerResolverOptions = {
    stateDir: string;
    persist?: boolean;
    logLevel?: string;
    onInfo?: (message: string) => void;
    onWarn?: (message: string) => void;
    fetchIdentityFullFn?: typeof fetchTokenIdentityFull;
    fetchPeerRoditByTokenIdFn?: typeof fetchPeerRoditByTokenId;
};

/**
 * Resolves Passport token_id values to A2A Agent Card URLs via IdentyClaw API
 * GET /full (metadata.webhook_url), with on-chain RODiT fallback, then registers
 * them on the outbound agent registry.
 */
export class TokenPeerResolver {
    private readonly memory = new Map<string, string>();
    private readonly inFlight = new Map<string, Promise<string | null>>();
    private readonly registryPath: string;
    private readonly fetchIdentityFull: typeof fetchTokenIdentityFull;
    private readonly fetchPeerRodit: typeof fetchPeerRoditByTokenId;
    private agents: AuthenticatedA2AAgents | undefined;
    private hydratePromise: Promise<void> | null = null;

    constructor(private readonly options: TokenPeerResolverOptions) {
        this.registryPath = path.join(options.stateDir, "a2a", "outbound", "peers.json");
        this.fetchIdentityFull = options.fetchIdentityFullFn ?? fetchTokenIdentityFull;
        this.fetchPeerRodit = options.fetchPeerRoditByTokenIdFn ?? fetchPeerRoditByTokenId;
    }

    attachAgents(agents: AuthenticatedA2AAgents): void {
        this.agents = agents;
        this.hydratePromise = this.hydratePersistedPeers();
    }

    private async ensureHydrated(): Promise<void> {
        if (this.hydratePromise) {
            await this.hydratePromise;
        }
    }

    hasKnownPeer(tokenId: string): boolean {
        return this.memory.has(normalizePassportTokenId(tokenId));
    }

    getKnownAgentCardUrl(tokenId: string): string | undefined {
        return this.memory.get(normalizePassportTokenId(tokenId));
    }

    private async hydratePersistedPeers(): Promise<void> {
        if (!this.options.persist || !this.agents) {
            return;
        }

        let registry: PersistedPeerRegistry = {};
        try {
            if (fs.existsSync(this.registryPath)) {
                registry = JSON.parse(
                    fs.readFileSync(this.registryPath, "utf8"),
                ) as PersistedPeerRegistry;
            }
        } catch (err) {
            this.options.onWarn?.(`[a2a] Failed to load persisted peer registry: ${String(err)}`);
            return;
        }

        for (const [tokenId, entry] of Object.entries(registry)) {
            if (!entry?.url || !isPassportTokenId(tokenId)) {
                continue;
            }
            try {
                await this.registerPeer(tokenId, entry.url, { persist: false, log: false });
            } catch (err) {
                this.options.onWarn?.(`[a2a] Skipped persisted peer ${tokenId}: ${String(err)}`);
            }
        }
    }

    async resolveAgentCardUrl(tokenId: string): Promise<string | null> {
        await this.ensureHydrated();

        const normalized = normalizePassportTokenId(tokenId);
        if (!isPassportTokenId(normalized)) {
            return null;
        }

        const cached = this.memory.get(normalized);
        if (cached) {
            return cached;
        }

        const pending = this.inFlight.get(normalized);
        if (pending) {
            return pending;
        }

        const task = this.resolveAndRegister(normalized);
        this.inFlight.set(normalized, task);
        try {
            return await task;
        } finally {
            this.inFlight.delete(normalized);
        }
    }

    private async resolveAndRegister(tokenId: string): Promise<string | null> {
        let cardUrl: string | null = null;
        let source: PeerResolutionSource = "api";

        try {
            const identity = await this.fetchIdentityFull(tokenId, {
                logLevel: this.options.logLevel,
            });
            cardUrl = this.agentCardUrlFromIdentity(identity);
        } catch {
            // API errors fall through to on-chain lookup.
        }

        if (!cardUrl) {
            source = "chain";
            const peerRodit = await this.fetchPeerRodit(tokenId, {
                logLevel: this.options.logLevel,
            });
            cardUrl = this.agentCardUrlFromPeerRodit(tokenId, peerRodit);
        }

        await this.registerPeer(tokenId, cardUrl, {
            persist: this.options.persist === true,
            source,
        });
        return cardUrl;
    }

    private agentCardUrlFromIdentity(identity: TokenIdentityFullResponse): string | null {
        const webhookUrl = extractWebhookUrlFromIdentity(identity);
        if (!webhookUrl) {
            return null;
        }
        return webhookUrlToAgentCardUrl(webhookUrl);
    }

    private agentCardUrlFromPeerRodit(tokenId: string, peerRodit: PeerRodit): string {
        const cardUrl = webhookUrlToAgentCardUrl(peerRodit.metadata?.webhook_url ?? "");
        if (!cardUrl) {
            throw new Error(`RODiT ${tokenId} has no usable metadata.webhook_url for A2A ingress`);
        }
        return cardUrl;
    }

    private async registerPeer(
        tokenId: string,
        cardUrl: string,
        opts: { persist: boolean; log?: boolean; source?: PeerResolutionSource },
    ): Promise<void> {
        const normalized = normalizePassportTokenId(tokenId);
        this.memory.set(normalized, cardUrl);

        if (this.agents) {
            await this.agents.registerAgentIfAbsent(normalized, cardUrl);
        }

        if (opts.persist) {
            this.persistPeer(normalized, cardUrl, opts.source);
        }

        if (opts.log !== false) {
            const sourceLabel =
                opts.source === "chain"
                    ? "on-chain RODiT metadata.webhook_url"
                    : "IdentyClaw API /full metadata.webhook_url";
            this.options.onInfo?.(
                `[a2a] Registered outbound peer ${normalized} from ${sourceLabel} (${cardUrl})`,
            );
        }
    }

    private persistPeer(tokenId: string, cardUrl: string, source?: PeerResolutionSource): void {
        let registry: PersistedPeerRegistry = {};
        try {
            if (fs.existsSync(this.registryPath)) {
                registry = JSON.parse(
                    fs.readFileSync(this.registryPath, "utf8"),
                ) as PersistedPeerRegistry;
            }
        } catch {
            registry = {};
        }

        registry[tokenId] = {
            url: cardUrl,
            resolvedAt: new Date().toISOString(),
            ...(source ? { source } : {}),
        };

        fs.mkdirSync(path.dirname(this.registryPath), { recursive: true });
        fs.writeFileSync(this.registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    }
}
