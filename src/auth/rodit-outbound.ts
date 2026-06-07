// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { createRequire } from "node:module";

import type { A2AOutboundRoditAuthConfig } from "../config.js";
import type { OutboundAuthProvider } from "./outbound-auth.js";
import { loadRoditAuthBe } from "./rodit-runtime.js";

const require = createRequire(import.meta.url);
const bs58 = require("bs58") as { decode: (input: string) => Uint8Array };

type RoditLoginConfig = {
    own_rodit: {
        token_id: string;
        owner_id: string;
        metadata: {
            subjectuniqueidentifier_url: string;
        };
    };
    own_rodit_bytes_private_key: Uint8Array;
};

type RoditLoginOptions = {
    accountId?: string;
    loginPath?: string;
};

type RoditLoginResult = {
    jwt_token?: string;
    error?: string;
};

export type RoditOutboundCredentials = {
    accountId: string;
    privateKey: string;
    baseUrl: string;
};

export type RoditLoginFn = (
    credentials: RoditOutboundCredentials,
    options?: { logLevel?: string },
) => Promise<string>;

const DEFAULT_CREDENTIALS_ENV = {
    accountId: "IDENTYCLAW_ACCOUNT_ID",
    privateKey: "IDENTYCLAW_NEAR_PRIVATE_KEY",
    baseUrl: "IDENTYCLAW_BASE_URL",
} as const;

const DEFAULT_JWT_CACHE_TTL_SECONDS = 300;

function stripEd25519Prefix(key: string): string {
    return key.startsWith("ed25519:") ? key.slice("ed25519:".length) : key;
}

function decodePrivateKeyBytes(privateKey: string): Uint8Array {
    return new Uint8Array(bs58.decode(stripEd25519Prefix(privateKey.trim())));
}

function buildLoginConfig(credentials: RoditOutboundCredentials): RoditLoginConfig {
    return {
        own_rodit: {
            token_id: "",
            owner_id: credentials.accountId,
            metadata: {
                subjectuniqueidentifier_url: credentials.baseUrl.replace(/\/$/, ""),
            },
        },
        own_rodit_bytes_private_key: decodePrivateKeyBytes(credentials.privateKey),
    };
}

export const defaultRoditLogin: RoditLoginFn = async (credentials, options) => {
    const { login_server } = loadRoditAuthBe({ logLevel: options?.logLevel });
    const result = await login_server(buildLoginConfig(credentials), {
        accountId: credentials.accountId,
    });
    if (result.error || !result.jwt_token) {
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
        const envNames = {
            ...DEFAULT_CREDENTIALS_ENV,
            ...this.config.credentialsEnv,
        };

        const accountId = process.env[envNames.accountId]?.trim();
        const privateKey = process.env[envNames.privateKey]?.trim();
        const baseUrl = process.env[envNames.baseUrl]?.trim();

        if (!accountId || !privateKey || !baseUrl) {
            throw new Error(
                "RODiT outbound auth requires accountId, privateKey, and baseUrl env vars",
            );
        }

        return { accountId, privateKey, baseUrl };
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

    async getAuthorizationHeader(): Promise<string> {
        return `Bearer ${await this.getBearerToken()}`;
    }

    invalidate(): void {
        this.cachedToken = null;
        this.expiresAtMs = 0;
    }
}

export function createRoditOutboundAuthProvider(
    config: A2AOutboundRoditAuthConfig | undefined,
    loginFn?: RoditLoginFn,
): RoditOutboundAuthProvider | undefined {
    if (config?.provider !== "rodit") {
        return undefined;
    }
    return new RoditOutboundAuthProvider(config, loginFn);
}
