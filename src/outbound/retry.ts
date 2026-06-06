// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import type { OutboundAuthProvider } from "../auth/outbound-auth.js";

const AUTH_ERROR_PATTERNS = [
    /\b401\b/,
    /\bunauthorized\b/i,
    /authentication required/i,
    /invalid.?token/i,
    /json-rpc error:.*\(code:\s*-32001\)/i,
];

export function isLikelyAuthFailure(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return AUTH_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export async function withOutboundAuthRetry<T>(
    authProvider: OutboundAuthProvider | undefined,
    operation: () => Promise<T>,
): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (!authProvider || !isLikelyAuthFailure(error)) {
            throw error;
        }
        authProvider.invalidate();
        return operation();
    }
}
