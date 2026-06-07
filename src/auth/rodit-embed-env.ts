// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Default env for embedding `@rodit/rodit-auth-be` inside OpenClaw chat/gateway.
 * Only sets values that are not already present so host overrides (e.g. IdentyClaw
 * `.env`) still win.
 */
export function applyRoditEmbedEnv(options?: { logLevel?: string }): void {
    if (!process.env.LOG_LEVEL) {
        process.env.LOG_LEVEL = options?.logLevel ?? "error";
    }
    if (process.env.SUPPRESS_NO_CONFIG_WARNING === undefined) {
        process.env.SUPPRESS_NO_CONFIG_WARNING = "true";
    }
    if (process.env.SUPPRESS_STRICTNESS_CHECK === undefined) {
        process.env.SUPPRESS_STRICTNESS_CHECK = "true";
    }
}
