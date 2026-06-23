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
    test("resolves token_id via identity API and caches agent card URL", async () => {
        const tokenId = "abcdefghijkl";
        let fetchCount = 0;
        const fetchTokenIdentityFullFn = async (id: string) => {
            fetchCount += 1;
            expect(id).toBe(tokenId);
            return {
                tokenId: id,
                dn: { contactUri: "https:peer.example.com:9443" },
            };
        };

        const resolver = new TokenPeerResolver({
            stateDir: tmpDir(),
            fetchTokenIdentityFullFn,
        });

        const cardUrl = await resolver.resolveAgentCardUrl(tokenId);
        expect(cardUrl).toBe("https://peer.example.com:9443/.well-known/agent-card.json");
        expect(resolver.getKnownAgentCardUrl(tokenId)).toBe(cardUrl);

        await resolver.resolveAgentCardUrl(tokenId);
        expect(fetchCount).toBe(1);
    });

    test("persists resolved peers when enabled", async () => {
        const tokenId = "lmnopqrstuvw";
        const stateDir = tmpDir();
        const fetchTokenIdentityFullFn = async () => ({
            tokenId,
            dn: { contactUri: "https://saved.example.com" },
        });

        const resolver = new TokenPeerResolver({
            stateDir,
            persist: true,
            fetchTokenIdentityFullFn,
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
            fetchTokenIdentityFullFn: async () => {
                throw new Error("should not refetch when hydrated from disk");
            },
        });
        reloadedResolver.attachAgents({
            registerAgentIfAbsent: async () => {},
        } as never);

        const cardUrl = await reloadedResolver.resolveAgentCardUrl(tokenId);
        expect(cardUrl).toBe("https://saved.example.com/.well-known/agent-card.json");
    });

    test("rejects identity without contactUri", async () => {
        const resolver = new TokenPeerResolver({
            stateDir: tmpDir(),
            fetchTokenIdentityFullFn: async () => ({ tokenId: "abcdefghijkl", dn: {} }),
        });

        await expect(resolver.resolveAgentCardUrl("abcdefghijkl")).rejects.toThrow(
            /no dn\.contactUri/,
        );
    });
});
