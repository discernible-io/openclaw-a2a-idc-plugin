// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import * as fs from "node:fs";
import * as path from "node:path";

import { contactUriToAgentCardUrl } from "../auth/contact-uri.js";
import {
    fetchTokenIdentityFull,
    type IdentyclawApiClientOptions,
} from "../auth/identyclaw-api-client.js";
import { isPassportTokenId, normalizePassportTokenId } from "../auth/passport-token-id.js";
import type { AuthenticatedA2AAgents } from "./authenticated-agents.js";

type PersistedPeerRegistry = Record<
    string,
    {
        url: string;
        resolvedAt: string;
    }
>;

export type TokenPeerResolverOptions = IdentyclawApiClientOptions & {
    stateDir: string;
    persist?: boolean;
    onInfo?: (message: string) => void;
    onWarn?: (message: string) => void;
    fetchTokenIdentityFullFn?: typeof fetchTokenIdentityFull;
};

/**
 * Resolves Passport token_id values to A2A Agent Card URLs via IdentyClaw identity API,
 * then registers them on the outbound agent registry.
 */
export class TokenPeerResolver {
    private readonly memory = new Map<string, string>();
    private readonly inFlight = new Map<string, Promise<string | null>>();
    private readonly registryPath: string;
    private readonly fetchIdentity: typeof fetchTokenIdentityFull;
    private agents: AuthenticatedA2AAgents | undefined;
    private hydratePromise: Promise<void> | null = null;

    constructor(private readonly options: TokenPeerResolverOptions) {
        this.registryPath = path.join(options.stateDir, "a2a", "outbound", "peers.json");
        this.fetchIdentity = options.fetchTokenIdentityFullFn ?? fetchTokenIdentityFull;
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
                registry = JSON.parse(fs.readFileSync(this.registryPath, "utf8")) as PersistedPeerRegistry;
            }
        } catch (err) {
            this.options.onWarn?.(
                `[a2a] Failed to load persisted peer registry: ${String(err)}`,
            );
            return;
        }

        for (const [tokenId, entry] of Object.entries(registry)) {
            if (!entry?.url || !isPassportTokenId(tokenId)) {
                continue;
            }
            try {
                await this.registerPeer(tokenId, entry.url, { persist: false, log: false });
            } catch (err) {
                this.options.onWarn?.(
                    `[a2a] Skipped persisted peer ${tokenId}: ${String(err)}`,
                );
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
        const identity = await this.fetchIdentity(tokenId, this.options);
        const contactUri = identity.dn?.contactUri;
        if (!contactUri) {
            throw new Error(`Identity for ${tokenId} has no dn.contactUri`);
        }

        const cardUrl = contactUriToAgentCardUrl(contactUri);
        if (!cardUrl) {
            throw new Error(
                `Identity for ${tokenId} has unsupported contactUri for A2A: ${contactUri}`,
            );
        }

        await this.registerPeer(tokenId, cardUrl, { persist: this.options.persist === true });
        return cardUrl;
    }

    private async registerPeer(
        tokenId: string,
        cardUrl: string,
        opts: { persist: boolean; log?: boolean },
    ): Promise<void> {
        const normalized = normalizePassportTokenId(tokenId);
        this.memory.set(normalized, cardUrl);

        if (this.agents) {
            await this.agents.registerAgentIfAbsent(normalized, cardUrl);
        }

        if (opts.persist) {
            this.persistPeer(normalized, cardUrl);
        }

        if (opts.log !== false) {
            this.options.onInfo?.(
                `[a2a] Registered outbound peer ${normalized} from identity contactUri (${cardUrl})`,
            );
        }
    }

    private persistPeer(tokenId: string, cardUrl: string): void {
        let registry: PersistedPeerRegistry = {};
        try {
            if (fs.existsSync(this.registryPath)) {
                registry = JSON.parse(fs.readFileSync(this.registryPath, "utf8")) as PersistedPeerRegistry;
            }
        } catch {
            registry = {};
        }

        registry[tokenId] = {
            url: cardUrl,
            resolvedAt: new Date().toISOString(),
        };

        fs.mkdirSync(path.dirname(this.registryPath), { recursive: true });
        fs.writeFileSync(this.registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    }
}
