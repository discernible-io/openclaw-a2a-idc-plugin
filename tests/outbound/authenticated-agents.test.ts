// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { afterAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { AuthenticatedA2AAgents } from "../../src/outbound/authenticated-agents.js";
import { TokenPeerResolver } from "../../src/outbound/token-peer-resolver.js";

const tmpDirs: string[] = [];

function tmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a2a-auth-agents-"));
    tmpDirs.push(dir);
    return dir;
}

afterAll(() => {
    for (const dir of tmpDirs) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

const peerCard = {
    name: "Juanelo",
    description: "Resolved peer",
    protocolVersion: "0.3.0",
    version: "1.0.0",
    url: "https://peer.example.com/a2a",
    capabilities: { streaming: true },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills: [{ id: "general", name: "Juanelo", description: "Resolved peer", tags: [] }],
};

describe("AuthenticatedA2AAgents LLM summaries", () => {
    test("getAgentsForLlm exposes token_id for configured passport peers", async () => {
        const tokenId = "lncqsncdshcj";
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (input) => {
            const url = String(input);
            if (url.includes("agent-card.json")) {
                return new Response(JSON.stringify(peerCard), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                });
            }
            return originalFetch(input);
        };

        try {
            const agents = new AuthenticatedA2AAgents({
                [tokenId]: {
                    url: "https://peer.example.com/.well-known/agent-card.json",
                },
            });
            const listed = await agents.getAgentsForLlm("basic");
            expect(listed[tokenId]).toEqual({
                token_id: tokenId,
                name: "Juanelo",
                description: "Resolved peer",
            });
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test("getAgentForLlm resolves unknown passport token_id peers before lookup", async () => {
        const tokenId = "apipeerabcde";
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (input) => {
            const url = String(input);
            if (url.includes("agent-card.json")) {
                return new Response(JSON.stringify(peerCard), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                });
            }
            return originalFetch(input);
        };

        const resolver = new TokenPeerResolver({
            stateDir: tmpDir(),
            fetchIdentityFullFn: async (id) => ({
                tokenId: id,
                metadata: { webhook_url: "https://peer.example.com" },
            }),
            fetchPeerRoditByTokenIdFn: async () => {
                throw new Error("chain should not be called");
            },
        });
        const agents = new AuthenticatedA2AAgents({}, undefined, undefined, resolver);
        resolver.attachAgents(agents);

        try {
            const summary = await agents.getAgentForLlm(tokenId, "full");
            expect(summary).toMatchObject({
                token_id: tokenId,
                name: "Juanelo",
            });
            expect(summary?.skills).toEqual([
                { name: "Juanelo", description: "Resolved peer" },
            ]);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
