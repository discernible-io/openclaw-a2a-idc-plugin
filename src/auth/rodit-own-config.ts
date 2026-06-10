// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { applyRoditEmbedEnv } from "./rodit-embed-env.js";
import { loadRoditAuthBe, type RoditLoginServerFn } from "./rodit-runtime.js";

type RoditClientInstance = {
    getConfigOwnRodit: () => Promise<RoditOwnConfig | null | undefined>;
};

type RoditClientConstructor = {
    create: (options?: { role?: string }) => Promise<RoditClientInstance>;
};

export type RoditOwnConfig = Parameters<RoditLoginServerFn>[0] & {
    own_rodit: {
        token_id: string;
        owner_id: string;
        metadata: { subjectuniqueidentifier_url: string; webhook_url?: string };
    };
    own_rodit_bytes_private_key: Uint8Array;
};

let roditClientPromise: Promise<RoditClientInstance> | null = null;

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
        roditClientPromise = RoditClient.create({ role: "client" });
    }
    return roditClientPromise;
}

export async function getRoditOwnConfig(logLevel?: string): Promise<RoditOwnConfig> {
    ensureRoditCredentialSource();
    const client = await getRoditClient(logLevel);
    const config = await client.getConfigOwnRodit();
    if (!config?.own_rodit || !config.own_rodit_bytes_private_key) {
        throw new Error("RODiT own passport configuration is not initialized");
    }
    return config as RoditOwnConfig;
}

/** Reset cached client (tests only). */
export function resetRoditOwnConfigCacheForTests(): void {
    roditClientPromise = null;
}
