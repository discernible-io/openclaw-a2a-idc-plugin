// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";

import { agentCardUrlToLoginBase } from "../../src/auth/rodit-url.js";

describe("agentCardUrlToLoginBase", () => {
    test("strips agent card path from HTTPS URL", () => {
        expect(
            agentCardUrlToLoginBase(
                "https://agent-a.dihola.io:9443/.well-known/agent-card.json",
            ),
        ).toBe("https://agent-a.dihola.io:9443");
    });

    test("preserves origin when path is only agent card", () => {
        expect(agentCardUrlToLoginBase("https://peer.example/a/.well-known/agent-card.json")).toBe(
            "https://peer.example/a",
        );
    });
});
