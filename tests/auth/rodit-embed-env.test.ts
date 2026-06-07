// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, test } from "bun:test";

import { applyRoditEmbedEnv } from "../../src/auth/rodit-embed-env.js";

const originalEnv = {
    LOG_LEVEL: process.env.LOG_LEVEL,
    SUPPRESS_NO_CONFIG_WARNING: process.env.SUPPRESS_NO_CONFIG_WARNING,
    SUPPRESS_STRICTNESS_CHECK: process.env.SUPPRESS_STRICTNESS_CHECK,
};

afterEach(() => {
    process.env.LOG_LEVEL = originalEnv.LOG_LEVEL;
    process.env.SUPPRESS_NO_CONFIG_WARNING = originalEnv.SUPPRESS_NO_CONFIG_WARNING;
    process.env.SUPPRESS_STRICTNESS_CHECK = originalEnv.SUPPRESS_STRICTNESS_CHECK;
});

describe("applyRoditEmbedEnv", () => {
    test("sets quiet defaults when env vars are unset", () => {
        delete process.env.LOG_LEVEL;
        delete process.env.SUPPRESS_NO_CONFIG_WARNING;
        delete process.env.SUPPRESS_STRICTNESS_CHECK;

        applyRoditEmbedEnv();

        expect(process.env.LOG_LEVEL).toBe("error");
        expect(process.env.SUPPRESS_NO_CONFIG_WARNING).toBe("true");
        expect(process.env.SUPPRESS_STRICTNESS_CHECK).toBe("true");
    });

    test("does not override existing host env", () => {
        process.env.LOG_LEVEL = "warn";
        process.env.SUPPRESS_NO_CONFIG_WARNING = "false";
        process.env.SUPPRESS_STRICTNESS_CHECK = "false";

        applyRoditEmbedEnv({ logLevel: "debug" });

        expect(process.env.LOG_LEVEL).toBe("warn");
        expect(process.env.SUPPRESS_NO_CONFIG_WARNING).toBe("false");
        expect(process.env.SUPPRESS_STRICTNESS_CHECK).toBe("false");
    });

    test("uses configured log level when LOG_LEVEL is unset", () => {
        delete process.env.LOG_LEVEL;

        applyRoditEmbedEnv({ logLevel: "silent" });

        expect(process.env.LOG_LEVEL).toBe("silent");
    });
});
