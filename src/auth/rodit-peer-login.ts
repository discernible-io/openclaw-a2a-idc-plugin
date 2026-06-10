// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { getRoditOwnConfig, type RoditOwnConfig } from "./rodit-own-config.js";
import { loadRoditAuthBe } from "./rodit-runtime.js";

export type RoditPeerLoginOptions = {
    loginPath?: string;
    timestampPath?: string;
    logLevel?: string;
};

export type RoditPeerLoginFn = (
    peerLoginBaseUrl: string,
    options?: RoditPeerLoginOptions,
) => Promise<string>;

function withPeerLoginTarget(config: RoditOwnConfig, peerLoginBaseUrl: string): RoditOwnConfig {
    const base = peerLoginBaseUrl.trim().replace(/\/$/, "");
    return {
        ...config,
        own_rodit: {
            ...config.own_rodit,
            metadata: {
                ...config.own_rodit.metadata,
                subjectuniqueidentifier_url: base,
            },
        },
    };
}

/**
 * P2P outbound login: sign with own passport and POST to the peer's /api/login.
 * Uses exported `login_server(config, options)` with subjectuniqueidentifier_url
 * overridden to the peer gateway base (Phase 9A SDK workaround).
 */
export const defaultRoditPeerLogin: RoditPeerLoginFn = async (peerLoginBaseUrl, options) => {
    const ownConfig = await getRoditOwnConfig(options?.logLevel);
    const { login_server } = loadRoditAuthBe({ logLevel: options?.logLevel });
    const result = await login_server(withPeerLoginTarget(ownConfig, peerLoginBaseUrl), {
        loginPath: options?.loginPath,
        timestampPath: options?.timestampPath,
    });
    if (!result.jwt_token || result.error) {
        throw new Error(result.error ?? "RODiT peer login failed");
    }
    return result.jwt_token;
};
