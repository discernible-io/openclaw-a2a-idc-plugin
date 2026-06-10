// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";

import { createRoditOutboundAuthProvider } from "../../src/auth/create-rodit-outbound-auth.js";
import { RoditAutoOutboundAuthProvider } from "../../src/auth/rodit-auto-outbound.js";

describe("RoditAutoOutboundAuthProvider", () => {
    test("factory selects auto provider", () => {
        const provider = createRoditOutboundAuthProvider(
            { provider: "rodit", mode: "auto" },
            { peer: { url: "https://peer.example/.well-known/agent-card.json" } },
        );
        expect(provider).toBeInstanceOf(RoditAutoOutboundAuthProvider);
    });
});
