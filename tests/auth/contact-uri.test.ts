// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";

import {
    contactUriToAgentCardUrl,
    contactUriToGatewayBase,
    normalizeGatewayBase,
} from "../../src/auth/contact-uri.js";

describe("contactUriToGatewayBase", () => {
    test("parses https URL contactUri", () => {
        expect(contactUriToGatewayBase("https://agent.example.com:9443/hooks")).toBe(
            "https://agent.example.com:9443",
        );
    });

    test("parses DN-style https scheme contactUri", () => {
        expect(contactUriToGatewayBase("https:agent.example.com:9443")).toBe(
            "https://agent.example.com:9443",
        );
    });

    test("parses DN-style https without port", () => {
        expect(contactUriToGatewayBase("https:agent.example.com:")).toBe(
            "https://agent.example.com",
        );
    });

    test("rejects email contactUri", () => {
        expect(contactUriToGatewayBase("email:example.com:alice@example.com")).toBeNull();
        expect(contactUriToGatewayBase("mailto:alice@example.com")).toBeNull();
    });
});

describe("contactUriToAgentCardUrl", () => {
    test("appends agent-card path", () => {
        expect(contactUriToAgentCardUrl("https://agent.example.com")).toBe(
            "https://agent.example.com/.well-known/agent-card.json",
        );
    });
});

describe("normalizeGatewayBase", () => {
    test("strips trailing slash and path", () => {
        expect(normalizeGatewayBase("https://agent.example.com:9443/")).toBe(
            "https://agent.example.com:9443",
        );
    });
});
