// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, test } from "bun:test";

import {
    IDENTITY_API_BASE_URL_ERROR,
    resetIdentyclawApiClientCacheForTests,
    resolveIdentityApiBaseUrl,
} from "../../src/auth/identyclaw-api-client.js";
import type { RoditOwnConfig } from "../../src/auth/rodit-own-config.js";

const originalBaseUrl = process.env.IDENTYCLAW_BASE_URL;

function unsetIdentyclawBaseUrl(): void {
    Reflect.deleteProperty(process.env, "IDENTYCLAW_BASE_URL");
}

afterEach(() => {
    resetIdentyclawApiClientCacheForTests();
    if (originalBaseUrl === undefined) {
        unsetIdentyclawBaseUrl();
    } else {
        process.env.IDENTYCLAW_BASE_URL = originalBaseUrl;
    }
});

function makeOwnConfig(subjectUrl?: string): RoditOwnConfig {
    return {
        own_rodit: {
            token_id: "abcdefghijkl",
            owner_id: "owner",
            metadata: {
                subjectuniqueidentifier_url: subjectUrl ?? "",
            },
        },
        own_rodit_bytes_private_key: new Uint8Array([1]),
    };
}

describe("resolveIdentityApiBaseUrl", () => {
    test("uses explicit override over env", async () => {
        process.env.IDENTYCLAW_BASE_URL = "https://api.identyclaw.com";
        await expect(
            resolveIdentityApiBaseUrl("https://api.dihola.io/", {
                getRoditOwnConfig: async () => {
                    throw new Error("should not load passport");
                },
            }),
        ).resolves.toBe("https://api.dihola.io");
    });

    test("uses IDENTYCLAW_BASE_URL when override is unset", async () => {
        process.env.IDENTYCLAW_BASE_URL = "https://api.dihola.io";
        await expect(
            resolveIdentityApiBaseUrl(undefined, {
                getRoditOwnConfig: async () => {
                    throw new Error("should not load passport");
                },
            }),
        ).resolves.toBe("https://api.dihola.io");
    });

    test("uses Passport subjectuniqueidentifier_url when config and env are unset", async () => {
        unsetIdentyclawBaseUrl();
        await expect(
            resolveIdentityApiBaseUrl(undefined, {
                getRoditOwnConfig: async () => makeOwnConfig("https://api.dihola.io"),
            }),
        ).resolves.toBe("https://api.dihola.io");
    });

    test("fails closed when no explicit source is available", async () => {
        unsetIdentyclawBaseUrl();
        await expect(
            resolveIdentityApiBaseUrl(undefined, {
                getRoditOwnConfig: async () => makeOwnConfig(""),
            }),
        ).rejects.toThrow(IDENTITY_API_BASE_URL_ERROR);
    });
});
