// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import type { OutboundAuthProvider } from "./outbound-auth.js";
import type { A2AAgentEntry, A2AOutboundRoditAuthConfig } from "../config.js";
import { RoditOutboundAuthProvider } from "./rodit-outbound.js";
import { RoditP2pOutboundAuthProvider } from "./rodit-p2p-outbound.js";
import { RoditAutoOutboundAuthProvider } from "./rodit-auto-outbound.js";

export function createRoditOutboundAuthProvider(
    config: A2AOutboundRoditAuthConfig | undefined,
    agents: Record<string, A2AAgentEntry> = {},
): OutboundAuthProvider | undefined {
    if (config?.provider !== "rodit") {
        return undefined;
    }

    const mode = config.mode ?? "mediated";
    if (mode === "p2p") {
        return new RoditP2pOutboundAuthProvider(config, agents);
    }
    if (mode === "auto") {
        return new RoditAutoOutboundAuthProvider(config, agents);
    }

    return new RoditOutboundAuthProvider(config);
}

export { RoditOutboundAuthProvider } from "./rodit-outbound.js";
export { RoditP2pOutboundAuthProvider } from "./rodit-p2p-outbound.js";
export { RoditAutoOutboundAuthProvider } from "./rodit-auto-outbound.js";
