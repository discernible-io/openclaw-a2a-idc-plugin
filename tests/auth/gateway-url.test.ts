// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";

import {
    webhookUrlToAgentCardUrl,
    webhookUrlToGatewayBase,
} from "../../src/auth/gateway-url.js";

describe("webhookUrlToGatewayBase", () => {
    test("accepts https webhook_url with port", () => {
        expect(webhookUrlToGatewayBase("https://webhook.discernible.io:7443")).toBe(
            "https://webhook.discernible.io:7443",
        );
    });

    test("strips trailing slash and path", () => {
        expect(webhookUrlToGatewayBase("https://agent.example.com/hooks/agent")).toBe(
            "https://agent.example.com",
        );
    });

    test("rejects non-http schemes", () => {
        expect(webhookUrlToGatewayBase("mailto:agent@example.com")).toBeNull();
    });
});

describe("webhookUrlToAgentCardUrl", () => {
    test("appends agent-card path", () => {
        expect(webhookUrlToAgentCardUrl("https://agent.example.com:9443")).toBe(
            "https://agent.example.com:9443/.well-known/agent-card.json",
        );
    });
});
