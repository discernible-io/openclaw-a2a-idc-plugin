// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import type { IncomingMessage } from "node:http";

import {
    resolvePublicBaseUrl,
    resolveRequestPublicUrl,
    resolveStartupPublicBaseUrl,
} from "../../src/inbound/public-url.js";

function fakeReq(headers: Record<string, string | undefined>, encrypted = false): IncomingMessage {
    return {
        headers,
        socket: { encrypted },
    } as unknown as IncomingMessage;
}

describe("resolveRequestPublicUrl", () => {
    test("uses Host header for http requests", () => {
        expect(
            resolveRequestPublicUrl(
                fakeReq({ host: "openclaw-agent-b:18789", "x-forwarded-proto": "http" }),
            ),
        ).toBe("http://openclaw-agent-b:18789");
    });

    test("prefers x-forwarded-host and x-forwarded-proto", () => {
        expect(
            resolveRequestPublicUrl(
                fakeReq({
                    host: "127.0.0.1:18789",
                    "x-forwarded-host": "agent-a.diholai.io",
                    "x-forwarded-proto": "https",
                }),
            ),
        ).toBe("https://agent-a.diholai.io");
    });

    test("uses https when the socket is encrypted", () => {
        expect(resolveRequestPublicUrl(fakeReq({ host: "example.com" }, true))).toBe(
            "https://example.com",
        );
    });
});

describe("resolvePublicBaseUrl", () => {
    test("prefers configured publicBaseUrl over request headers", () => {
        expect(
            resolvePublicBaseUrl(
                fakeReq({ host: "openclaw-agent-a:18789" }),
                "https://agent-a.diholai.io",
            ),
        ).toBe("https://agent-a.diholai.io");
    });

    test("strips trailing slash from configured publicBaseUrl", () => {
        expect(
            resolvePublicBaseUrl(
                fakeReq({ host: "openclaw-agent-a:18789" }),
                "https://agent-a.diholai.io/",
            ),
        ).toBe("https://agent-a.diholai.io");
    });

    test("falls back to request-derived URL when publicBaseUrl is unset", () => {
        expect(resolvePublicBaseUrl(fakeReq({ host: "openclaw-agent-b:18789" }), undefined)).toBe(
            "http://openclaw-agent-b:18789",
        );
    });

    test("ignores blank configured publicBaseUrl", () => {
        expect(resolvePublicBaseUrl(fakeReq({ host: "openclaw-agent-b:18789" }), "   ")).toBe(
            "http://openclaw-agent-b:18789",
        );
    });
});

describe("resolveStartupPublicBaseUrl", () => {
    test("uses configured publicBaseUrl when set", () => {
        expect(resolveStartupPublicBaseUrl("https://agent-a.example.com/")).toBe(
            "https://agent-a.example.com",
        );
    });

    test("falls back to localhost when publicBaseUrl is unset", () => {
        expect(resolveStartupPublicBaseUrl(undefined)).toBe("http://localhost");
    });

    test("falls back to localhost for blank publicBaseUrl", () => {
        expect(resolveStartupPublicBaseUrl("   ")).toBe("http://localhost");
    });
});
