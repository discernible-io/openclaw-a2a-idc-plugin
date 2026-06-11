// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

/** Derive RODiT login base URL from an Agent Card discovery URL or RPC URL. */
export function agentCardUrlToLoginBase(agentCardUrl: string): string {
    const parsed = new URL(agentCardUrl);
    let path = parsed.pathname;
    path = path.replace(/\/\.well-known\/agent-card\.json\/?$/i, "");
    path = path.replace(/\/a2a\/?$/i, "");
    parsed.pathname = path || "/";
    parsed.hash = "";
    parsed.search = "";
    const normalized = parsed.toString();
    return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}
