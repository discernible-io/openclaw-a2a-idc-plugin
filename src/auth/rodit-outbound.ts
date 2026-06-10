// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import type { A2AOutboundRoditAuthConfig } from "../config.js";
import type { OutboundAuthContext, OutboundAuthProvider } from "./outbound-auth.js";
import {
    type RoditOutboundCredentials,
    resolveRoditOutboundCredentials,
} from "./rodit-outbound-credentials.js";
import { applyRoditEmbedEnv } from "./rodit-embed-env.js";
import { loadRoditAuthBe } from "./rodit-runtime.js";

type RoditLoginOptions = {
    accountId?: string;
    loginPath?: string;
};

type RoditLoginResult = {
    success?: boolean;
    jwt_token?: string;
    error?: string;
};

type RoditClientInstance = {
    login_server: (options?: RoditLoginOptions) => Promise<RoditLoginResult>;
};

type RoditClientConstructor = {
    create: (options?: { role?: string }) => Promise<RoditClientInstance>;
};

export type { RoditOutboundCredentials } from "./rodit-outbound-credentials.js";
export type RoditLoginFn = (
    credentials: RoditOutboundCredentials,
    options?: { logLevel?: string },
) => Promise<string>;

const DEFAULT_JWT_CACHE_TTL_SECONDS = 300;

let roditClientPromise: Promise<RoditClientInstance> | null = null;

/** Use file-based NEAR credentials (identyclaw-agents sets NEAR_CREDENTIALS_FILE_PATH). */
function ensureRoditCredentialSource(): void {
    if (process.env.RODIT_NEAR_CREDENTIALS_SOURCE?.trim()) {
        return;
    }
    if (process.env.NEAR_CREDENTIALS_FILE_PATH?.trim()) {
        process.env.RODIT_NEAR_CREDENTIALS_SOURCE = "file";
        return;
    }
    throw new Error(
        "RODiT credentials not configured: set NEAR_CREDENTIALS_FILE_PATH (from secrets/near-credentials/*.json)",
    );
}

async function getRoditClient(logLevel?: string): Promise<RoditClientInstance> {
    applyRoditEmbedEnv({ logLevel });
    if (!roditClientPromise) {
        const { RoditClient } = loadRoditAuthBe({ logLevel }) as unknown as {
            RoditClient: RoditClientConstructor;
        };
        // Singleton stateManager (not createTestInstance): post-login JWT validation
        // reads shared config — same as clienttest-idc production clients.
        roditClientPromise = RoditClient.create({ role: "client" });
    }
    return roditClientPromise;
}

/**
 * Outbound login via RoditClient.login_server — same path as clienttest-idc.
 * Loads own passport from NEAR (file creds), then validates API-issued JWT on chain.
 */
export const defaultRoditLogin: RoditLoginFn = async (_credentials, options) => {
    ensureRoditCredentialSource();
    const client = await getRoditClient(options?.logLevel);
    // When credentials file loads a passport (token_id), sign with roditid only — do not pass accountId.
    const result = await client.login_server();
    if (!result.jwt_token || result.success === false) {
        throw new Error(result.error ?? "RODiT login failed");
    }
    return result.jwt_token;
};

export class RoditOutboundAuthProvider implements OutboundAuthProvider {
    private cachedToken: string | null = null;
    private expiresAtMs = 0;

    constructor(
        private readonly config: A2AOutboundRoditAuthConfig,
        private readonly loginFn: RoditLoginFn = defaultRoditLogin,
    ) {}

    resolveCredentials(): RoditOutboundCredentials {
        return resolveRoditOutboundCredentials(this.config);
    }

    private cacheTtlMs(): number {
        const seconds = this.config.jwtCacheTtlSeconds ?? DEFAULT_JWT_CACHE_TTL_SECONDS;
        return Math.max(1, seconds) * 1000;
    }

    async getBearerToken(): Promise<string> {
        const now = Date.now();
        if (this.cachedToken && now < this.expiresAtMs) {
            return this.cachedToken;
        }

        const token = await this.loginFn(this.resolveCredentials(), {
            logLevel: this.config.logLevel,
        });
        this.cachedToken = token;
        this.expiresAtMs = now + this.cacheTtlMs();
        return token;
    }

    async getAuthorizationHeader(_context?: OutboundAuthContext): Promise<string> {
        return `Bearer ${await this.getBearerToken()}`;
    }

    invalidate(_context?: OutboundAuthContext): void {
        this.cachedToken = null;
        this.expiresAtMs = 0;
    }
}

export { createRoditOutboundAuthProvider } from "./create-rodit-outbound-auth.js";
