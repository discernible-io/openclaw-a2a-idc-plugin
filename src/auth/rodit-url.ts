// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

/** Derive RODiT login base URL from an Agent Card discovery URL. */
export function agentCardUrlToLoginBase(agentCardUrl: string): string {
    const parsed = new URL(agentCardUrl);
    parsed.pathname = parsed.pathname.replace(/\/\.well-known\/agent-card\.json\/?$/i, "") || "/";
    parsed.hash = "";
    parsed.search = "";
    const normalized = parsed.toString();
    return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}
