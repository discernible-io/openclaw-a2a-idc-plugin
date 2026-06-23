// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

/** Normalize a gateway / webhook base URL to `scheme://host` (no trailing slash). */
export function normalizeGatewayBase(raw: string): string {
    const trimmed = String(raw ?? "").trim().replace(/\/+$/, "");
    if (!trimmed) {
        return "";
    }
    try {
        const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
        return `${url.protocol}//${url.host}`;
    } catch {
        return trimmed;
    }
}

/**
 * Parse a DN `contactUri` into an OpenClaw / A2A gateway base URL.
 *
 * Supports standard URLs (`https://…`) and DN `scheme:authority:identifier` forms
 * such as `https:agent.example.com:9443`.
 */
export function contactUriToGatewayBase(contactUri: string): string | null {
    const trimmed = String(contactUri ?? "").trim();
    if (!trimmed) {
        return null;
    }

    if (/^https?:\/\//i.test(trimmed)) {
        const base = normalizeGatewayBase(trimmed);
        return base || null;
    }

    const firstColon = trimmed.indexOf(":");
    if (firstColon <= 0) {
        return null;
    }

    const scheme = trimmed.slice(0, firstColon).toLowerCase();
    const remainder = trimmed.slice(firstColon + 1);
    if (!remainder) {
        return null;
    }

    if (scheme === "mailto" || scheme === "email") {
        return null;
    }

    if (scheme !== "https" && scheme !== "http") {
        return null;
    }

    const secondColon = remainder.indexOf(":");
    const authority = secondColon >= 0 ? remainder.slice(0, secondColon) : remainder;
    const identifier = secondColon >= 0 ? remainder.slice(secondColon + 1) : "";
    if (!authority) {
        return null;
    }

    let url = `${scheme}://${authority}`;
    if (identifier) {
        if (/^\d+$/.test(identifier)) {
            url += `:${identifier}`;
        } else if (identifier.startsWith("/")) {
            url += identifier;
        } else if (/^https?:\/\//i.test(identifier)) {
            url = identifier;
        } else {
            url += `/${identifier.replace(/^\//, "")}`;
        }
    }

    const base = normalizeGatewayBase(url);
    return base || null;
}

export function contactUriToAgentCardUrl(contactUri: string): string | null {
    const base = contactUriToGatewayBase(contactUri);
    if (!base) {
        return null;
    }
    return `${base}/.well-known/agent-card.json`;
}
