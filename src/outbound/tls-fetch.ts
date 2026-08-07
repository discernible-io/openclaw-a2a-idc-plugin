// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Agent, setGlobalDispatcher } from "undici";

let tlsSkipConfigured = false;

/**
 * Disable TLS certificate verification for outbound fetch (agent cards + A2A RPC).
 * Uses a global undici dispatcher so @a2anet/a2a-utils fetch calls inherit the setting.
 *
 * Intended for IdentyClaw Passport peers that serve self-signed HTTPS. Keep disabled
 * unless you trust the peer network path; prefer proper CA-trusted certs in production.
 */
export function configureOutboundTlsSkipVerify(
    enabled: boolean,
    log?: (message: string) => void,
): void {
    if (!enabled || tlsSkipConfigured) {
        return;
    }
    setGlobalDispatcher(
        new Agent({
            connect: {
                rejectUnauthorized: false,
            },
        }),
    );
    tlsSkipConfigured = true;
    log?.("[a2a] Outbound TLS certificate verification disabled (tlsSkipVerify)");
}

/** Test helper — reset module state between tests. */
export function resetOutboundTlsSkipVerifyForTests(): void {
    tlsSkipConfigured = false;
}
