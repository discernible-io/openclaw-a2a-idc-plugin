// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import type { A2AOutboundRoditAuthConfig } from "../config.js";

export type RoditOutboundCredentials = {
    accountId: string;
    privateKey: string;
    baseUrl: string;
};

const DEFAULT_CREDENTIALS_ENV = {
    accountId: "IDENTYCLAW_ACCOUNT_ID",
    privateKey: "IDENTYCLAW_NEAR_PRIVATE_KEY",
    baseUrl: "IDENTYCLAW_BASE_URL",
} as const;

export function resolveRoditOutboundCredentials(
    config: A2AOutboundRoditAuthConfig,
): RoditOutboundCredentials {
    const envNames = {
        ...DEFAULT_CREDENTIALS_ENV,
        ...config.credentialsEnv,
    };

    const accountId = process.env[envNames.accountId]?.trim();
    const privateKey = process.env[envNames.privateKey]?.trim();
    const baseUrl = process.env[envNames.baseUrl]?.trim();

    if (!accountId || !privateKey || !baseUrl) {
        throw new Error("RODiT outbound auth requires accountId, privateKey, and baseUrl env vars");
    }

    return { accountId, privateKey, baseUrl };
}
