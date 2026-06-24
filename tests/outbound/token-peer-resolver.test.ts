// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { afterAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

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
    test("resolves token_id via on-chain webhook_url and caches agent card URL", async () => {
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
            fetchPeerRoditByTokenIdFn,
        });

        const cardUrl = await resolver.resolveAgentCardUrl(tokenId);
        expect(cardUrl).toBe(
            "https://webhook.discernible.io:7443/.well-known/agent-card.json",
        );
        expect(resolver.getKnownAgentCardUrl(tokenId)).toBe(cardUrl);

        await resolver.resolveAgentCardUrl(tokenId);
        expect(fetchCount).toBe(1);
    });

    test("persists resolved peers when enabled", async () => {
        const tokenId = "lmnopqrstuvw";
        const stateDir = tmpDir();
        const fetchPeerRoditByTokenIdFn = async () => ({
            token_id: tokenId,
            metadata: { webhook_url: "https://saved.example.com" },
        });

        const resolver = new TokenPeerResolver({
            stateDir,
            persist: true,
            fetchPeerRoditByTokenIdFn,
        });

        await resolver.resolveAgentCardUrl(tokenId);

        const registryPath = path.join(stateDir, "a2a", "outbound", "peers.json");
        expect(fs.existsSync(registryPath)).toBe(true);
        const saved = JSON.parse(fs.readFileSync(registryPath, "utf8")) as Record<
            string,
            { url: string }
        >;
        expect(saved[tokenId]?.url).toBe(
            "https://saved.example.com/.well-known/agent-card.json",
        );

        const reloadedResolver = new TokenPeerResolver({
            stateDir,
            persist: true,
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

    test("rejects peer without metadata.webhook_url", async () => {
        const resolver = new TokenPeerResolver({
            stateDir: tmpDir(),
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
