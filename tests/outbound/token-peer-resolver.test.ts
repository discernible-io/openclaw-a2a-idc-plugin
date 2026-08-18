// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { afterAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { TokenIdentityFullResponse } from "../../src/auth/identyclaw-api-client.js";
import { TokenPeerResolver } from "../../src/outbound/token-peer-resolver.js";

const tmpDirs: string[] = [];

function tmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a2a-peer-resolver-"));
    tmpDirs.push(dir);
    return dir;
}

afterAll(() => {
    for (const dir of tmpDirs) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

describe("TokenPeerResolver", () => {
    test("resolves token_id via API /full webhook_url and skips chain lookup", async () => {
        const tokenId = "apipeerabcde";
        let apiFetchCount = 0;
        let chainFetchCount = 0;

        const resolver = new TokenPeerResolver({
            stateDir: tmpDir(),
            fetchIdentityFullFn: async (id) => {
                apiFetchCount += 1;
                expect(id).toBe(tokenId);
                return {
                    tokenId: id,
                    metadata: { webhook_url: "https://api.peer.example.com:7443" },
                } satisfies TokenIdentityFullResponse;
            },
            fetchPeerRoditByTokenIdFn: async () => {
                chainFetchCount += 1;
                throw new Error("chain should not be called");
            },
        });

        const cardUrl = await resolver.resolveAgentCardUrl(tokenId);
        expect(cardUrl).toBe("https://api.peer.example.com:7443/.well-known/agent-card.json");
        expect(apiFetchCount).toBe(1);
        expect(chainFetchCount).toBe(0);

        await resolver.resolveAgentCardUrl(tokenId);
        expect(apiFetchCount).toBe(1);
    });

    test("falls back to chain when API has no metadata.webhook_url", async () => {
        const tokenId = "fallbackabcd";
        let chainFetchCount = 0;
        const warnings: string[] = [];

        const resolver = new TokenPeerResolver({
            stateDir: tmpDir(),
            onWarn: (message) => warnings.push(message),
            fetchIdentityFullFn: async () => ({ tokenId, metadata: {} }),
            fetchPeerRoditByTokenIdFn: async (id) => {
                chainFetchCount += 1;
                expect(id).toBe(tokenId);
                return {
                    token_id: id,
                    metadata: { webhook_url: "https://chain.peer.example.com" },
                };
            },
        });

        const cardUrl = await resolver.resolveAgentCardUrl(tokenId);
        expect(cardUrl).toBe("https://chain.peer.example.com/.well-known/agent-card.json");
        expect(chainFetchCount).toBe(1);
        expect(
            warnings.some((line) => line.includes("API GET /full had no metadata.webhook_url")),
        ).toBe(true);
        expect(warnings.some((line) => line.includes('"chosenSource":"chain"'))).toBe(true);
    });

    test("falls back to chain when API request fails", async () => {
        const tokenId = "apierrorabcd";
        const warnings: string[] = [];
        const resolver = new TokenPeerResolver({
            stateDir: tmpDir(),
            onWarn: (message) => warnings.push(message),
            fetchIdentityFullFn: async () => {
                throw new Error("GET /full failed: HTTP 503");
            },
            fetchPeerRoditByTokenIdFn: async (id) => ({
                token_id: id,
                metadata: { webhook_url: "https://chain.after-error.example.com" },
            }),
        });

        const cardUrl = await resolver.resolveAgentCardUrl(tokenId);
        expect(cardUrl).toBe("https://chain.after-error.example.com/.well-known/agent-card.json");
        expect(warnings.some((line) => line.includes('"failedSource":"api"'))).toBe(true);
        expect(warnings.some((line) => line.includes('"chosenSource":"chain"'))).toBe(true);
        expect(warnings.some((line) => line.includes("GET /full failed: HTTP 503"))).toBe(true);
    });

    test("resolves token_id via on-chain webhook_url when API is not injected", async () => {
        const tokenId = "lncqsncdshcj";
        let fetchCount = 0;
        const fetchPeerRoditByTokenIdFn = async (id: string) => {
            fetchCount += 1;
            expect(id).toBe(tokenId);
            return {
                token_id: id,
                metadata: { webhook_url: "https://webhook.discernible.io:7443" },
            };
        };

        const resolver = new TokenPeerResolver({
            stateDir: tmpDir(),
            fetchIdentityFullFn: async () => {
                throw new Error("API unavailable");
            },
            fetchPeerRoditByTokenIdFn,
        });

        const cardUrl = await resolver.resolveAgentCardUrl(tokenId);
        expect(cardUrl).toBe("https://webhook.discernible.io:7443/.well-known/agent-card.json");
        expect(resolver.getKnownAgentCardUrl(tokenId)).toBe(cardUrl);

        await resolver.resolveAgentCardUrl(tokenId);
        expect(fetchCount).toBe(1);
    });

    test("persists resolved peers with resolution source when enabled", async () => {
        const tokenId = "lmnopqrstuvw";
        const stateDir = tmpDir();

        const resolver = new TokenPeerResolver({
            stateDir,
            persist: true,
            fetchIdentityFullFn: async () => ({
                metadata: { webhook_url: "https://saved.example.com" },
            }),
            fetchPeerRoditByTokenIdFn: async () => {
                throw new Error("should not reach chain");
            },
        });

        await resolver.resolveAgentCardUrl(tokenId);

        const registryPath = path.join(stateDir, "a2a", "outbound", "peers.json");
        expect(fs.existsSync(registryPath)).toBe(true);
        const saved = JSON.parse(fs.readFileSync(registryPath, "utf8")) as Record<
            string,
            { url: string; source?: string }
        >;
        expect(saved[tokenId]?.url).toBe("https://saved.example.com/.well-known/agent-card.json");
        expect(saved[tokenId]?.source).toBe("api");

        const reloadedResolver = new TokenPeerResolver({
            stateDir,
            persist: true,
            fetchIdentityFullFn: async () => {
                throw new Error("should not refetch when hydrated from disk");
            },
            fetchPeerRoditByTokenIdFn: async () => {
                throw new Error("should not refetch when hydrated from disk");
            },
        });
        reloadedResolver.attachAgents({
            registerAgentIfAbsent: async () => {},
        } as never);

        const cardUrl = await reloadedResolver.resolveAgentCardUrl(tokenId);
        expect(cardUrl).toBe("https://saved.example.com/.well-known/agent-card.json");
    });

    test("rejects peer when API and chain both lack metadata.webhook_url", async () => {
        const resolver = new TokenPeerResolver({
            stateDir: tmpDir(),
            fetchIdentityFullFn: async () => ({ metadata: {} }),
            fetchPeerRoditByTokenIdFn: async (id) => ({
                token_id: id,
                metadata: {},
            }),
        });

        await expect(resolver.resolveAgentCardUrl("abcdefghijkl")).rejects.toThrow(
            /no usable metadata\.webhook_url/,
        );
    });

    test("does not use dn.contactUri when webhook_url is missing", async () => {
        const resolver = new TokenPeerResolver({
            stateDir: tmpDir(),
            fetchIdentityFullFn: async () => ({
                dn: { contactUri: "email:identyclaw.com:user@example.com" },
            }),
            fetchPeerRoditByTokenIdFn: async (id) => ({
                token_id: id,
                metadata: { userselected_dn: "ContactUri=email:identyclaw.com:user@example.com" },
            }),
        });

        await expect(resolver.resolveAgentCardUrl("abcdefghijkl")).rejects.toThrow(
            /no usable metadata\.webhook_url/,
        );
    });
});
