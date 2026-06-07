// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { createRequire } from "node:module";

import { applyRoditEmbedEnv } from "./rodit-embed-env.js";

const require = createRequire(import.meta.url);

type RoditJwtValidatorFn = (
    token: string,
    rodit: {
        token_id: string;
        owner_id: string;
        metadata: { subjectuniqueidentifier_url: string };
    },
    options?: { enforceSessionRegistration?: boolean; allowExpiredToken?: boolean },
) => Promise<{
    valid?: boolean;
    payload?: Record<string, unknown>;
    peer_rodit?: { token_id?: string };
}>;

type RoditLoginServerFn = (
    configOwnRodit: {
        own_rodit: {
            token_id: string;
            owner_id: string;
            metadata: { subjectuniqueidentifier_url: string };
        };
        own_rodit_bytes_private_key: Uint8Array;
    },
    options?: { accountId?: string; loginPath?: string },
) => Promise<{ jwt_token?: string; error?: string }>;

type RoditAuthBeModule = {
    validate_jwt_token_be: RoditJwtValidatorFn;
    login_server: RoditLoginServerFn;
};

let roditModule: RoditAuthBeModule | null = null;

export type LoadRoditAuthBeOptions = {
    logLevel?: string;
};

/**
 * Lazy-load `@rodit/rodit-auth-be` on first JWT validation or outbound login.
 * Applies quiet embed defaults before import so chat/gateway TTYs are not polluted.
 */
export function loadRoditAuthBe(options?: LoadRoditAuthBeOptions): RoditAuthBeModule {
    if (!roditModule) {
        applyRoditEmbedEnv(options);
        roditModule = require("@rodit/rodit-auth-be") as RoditAuthBeModule;
    }
    return roditModule;
}

export type { RoditJwtValidatorFn, RoditLoginServerFn };
