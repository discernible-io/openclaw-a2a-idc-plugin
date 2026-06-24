// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";

import {
    extractWebhookUrlFromIdentity,
    webhookUrlToAgentCardUrl,
    webhookUrlToGatewayBase,
} from "../../src/auth/gateway-url.js";
import type { TokenIdentityFullResponse } from "../../src/auth/identyclaw-api-client.js";

describe("extractWebhookUrlFromIdentity", () => {
    test("reads metadata.webhook_url", () => {
        const identity: TokenIdentityFullResponse = {
            metadata: { webhook_url: "https://agent.example.com:9443" },
        };
        expect(extractWebhookUrlFromIdentity(identity)).toBe("https://agent.example.com:9443");
    });

    test("reads metadata.webhookUrl alias", () => {
        const identity: TokenIdentityFullResponse = {
            metadata: { webhookUrl: "https://alias.example.com" },
        };
        expect(extractWebhookUrlFromIdentity(identity)).toBe("https://alias.example.com");
    });

    test("returns null when metadata or webhook is missing", () => {
        expect(extractWebhookUrlFromIdentity({})).toBeNull();
        expect(extractWebhookUrlFromIdentity({ metadata: {} })).toBeNull();
        expect(extractWebhookUrlFromIdentity({ metadata: { webhook_url: null } })).toBeNull();
    });
});

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
