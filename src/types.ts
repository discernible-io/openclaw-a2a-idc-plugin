// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import type { AnyAgentTool } from "openclaw/plugin-sdk";

export type AgentToolResult = {
    content: Array<{ type: "text"; text: string }>;
    details: unknown;
};

export type AgentTool = AnyAgentTool;

export function jsonResult(payload: unknown): AgentToolResult {
    return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        details: payload,
    };
}
