// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

export type OutboundAuthContext = {
    agentId: string;
    agentCardUrl: string;
};

export type OutboundAuthProvider = {
    getAuthorizationHeader(context?: OutboundAuthContext): Promise<string | undefined>;
    invalidate(context?: OutboundAuthContext): void;
};
