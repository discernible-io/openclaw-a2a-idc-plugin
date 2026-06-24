// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { getRoditOwnConfig } from "./rodit-own-config.js";
import { defaultRoditPeerLogin } from "./rodit-peer-login.js";

const DEFAULT_IDENTITY_API_BASE_URL = "https://api.identyclaw.com";
const DEFAULT_JWT_CACHE_TTL_SECONDS = 300;
const JWT_REFRESH_SKEW_MS = 60_000;

type CachedJwt = {
    token: string;
    expiresAtMs: number;
};

export type TokenIdentityFullResponse = {
    tokenId?: string;
    metadata?: {
        webhook_url?: string | null;
        webhookUrl?: string | null;
    } | null;
    dn?: {
        contactUri?: string | null;
    } | null;
};

export type IdentyclawApiClientOptions = {
    identityApiBaseUrl?: string;
    jwtCacheTtlSeconds?: number;
    logLevel?: string;
};

let cachedApiBaseUrl: string | null = null;
let jwtCache: CachedJwt | null = null;

function parseJwtExpiryMs(jwt: string): number | null {
    const parts = jwt.split(".");
    if (parts.length !== 3) {
        return null;
    }
    try {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
            exp?: unknown;
        };
        if (typeof payload.exp === "number" && Number.isFinite(payload.exp)) {
            return payload.exp * 1000;
        }
    } catch {
        return null;
    }
    return null;
}

/** Reset cached API session state (tests only). */
export function resetIdentyclawApiClientCacheForTests(): void {
    cachedApiBaseUrl = null;
    jwtCache = null;
}

export async function resolveIdentityApiBaseUrl(override?: string): Promise<string> {
    const configured = override?.trim() || process.env.IDENTYCLAW_BASE_URL?.trim();
    if (configured) {
        return normalizeIdentityApiBaseUrl(configured);
    }

    if (cachedApiBaseUrl) {
        return cachedApiBaseUrl;
    }

    const ownConfig = await getRoditOwnConfig();
    const fromMetadata = ownConfig.own_rodit.metadata.subjectuniqueidentifier_url?.trim();
    cachedApiBaseUrl = normalizeIdentityApiBaseUrl(fromMetadata || DEFAULT_IDENTITY_API_BASE_URL);
    return cachedApiBaseUrl;
}

function normalizeIdentityApiBaseUrl(raw: string): string {
    return raw.trim().replace(/\/+$/, "");
}

async function getApiJwt(options: IdentyclawApiClientOptions): Promise<string> {
    const now = Date.now();
    if (jwtCache && now + JWT_REFRESH_SKEW_MS < jwtCache.expiresAtMs) {
        return jwtCache.token;
    }

    const baseUrl = await resolveIdentityApiBaseUrl(options.identityApiBaseUrl);
    const token = await defaultRoditPeerLogin(baseUrl, {
        logLevel: options.logLevel,
        loginPath: "/api/login",
        timestampPath: "/api/login/timestamp",
    });

    const ttlSeconds = options.jwtCacheTtlSeconds ?? DEFAULT_JWT_CACHE_TTL_SECONDS;
    const expiresAtMs = parseJwtExpiryMs(token) ?? now + Math.max(1, ttlSeconds) * 1000;
    jwtCache = { token, expiresAtMs };
    return token;
}

export async function fetchTokenIdentityFull(
    tokenId: string,
    options: IdentyclawApiClientOptions = {},
): Promise<TokenIdentityFullResponse> {
    const baseUrl = await resolveIdentityApiBaseUrl(options.identityApiBaseUrl);
    const jwt = await getApiJwt(options);
    const response = await fetch(
        `${baseUrl}/api/identity/token/${encodeURIComponent(tokenId)}/full`,
        {
            headers: {
                Authorization: `Bearer ${jwt}`,
            },
        },
    );

    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
            `GET /api/identity/token/${tokenId}/full failed: HTTP ${response.status}${body ? ` — ${body.trim()}` : ""}`,
        );
    }

    return (await response.json()) as TokenIdentityFullResponse;
}
