// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { getRoditClient } from "./rodit-own-config.js";
import { normalizePassportTokenId } from "./passport-token-id.js";

export type PeerRodit = {
    token_id: string;
    metadata?: {
        webhook_url?: string;
    };
};

export async function fetchPeerRoditByTokenId(
    tokenId: string,
    options?: { logLevel?: string },
): Promise<PeerRodit> {
    const normalized = normalizePassportTokenId(tokenId);
    const client = await getRoditClient(options?.logLevel);
    const peer = await client.getBlockchainService().nearorg_rpc_tokenfromroditid(normalized);
    if (!peer?.token_id) {
        throw new Error(`No RODiT on chain for token_id ${normalized}`);
    }
    return peer as PeerRodit;
}
