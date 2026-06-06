// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import type { IncomingMessage } from "node:http";
import type { TLSSocket } from "node:tls";

/**
 * Derive the public base URL from proxy headers and the incoming request.
 * Used when `inbound.publicBaseUrl` is not configured.
 */
export function resolveRequestPublicUrl(req: IncomingMessage): string {
    const forwardedHost = req.headers["x-forwarded-host"];
    const host =
        typeof forwardedHost === "string"
            ? forwardedHost.split(",")[0].trim()
            : req.headers.host || "localhost";
    const rawProto = req.headers["x-forwarded-proto"];
    const protocol =
        typeof rawProto === "string"
            ? rawProto.split(",")[0].trim()
            : (req.socket as TLSSocket).encrypted
              ? "https"
              : "http";
    return `${protocol}://${host}`;
}

/**
 * Resolve the base URL for Agent Card `url` fields and inbound logging.
 * Prefers configured `publicBaseUrl` over request-derived values so discovery
 * matches what external peers call (especially behind reverse proxies).
 */
export function resolvePublicBaseUrl(
    req: IncomingMessage,
    configuredPublicBaseUrl?: string,
): string {
    const configured = configuredPublicBaseUrl?.trim();
    if (configured) {
        return configured.replace(/\/$/, "");
    }
    return resolveRequestPublicUrl(req);
}
