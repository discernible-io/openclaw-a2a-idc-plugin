// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import type { AgentSkill } from "@a2a-js/sdk";

import {
    assertUniqueA2AInboundKeyLabels,
    parseA2AInboundKeyLabel,
} from "./utils/inbound-key-label.js";

/**
 * Skill config accepted from users — same as AgentSkill but with `tags` optional
 * and without `security` (handled at the agent card level).
 */
export type A2ASkillConfig = Omit<AgentSkill, "tags" | "security"> & { tags?: string[] };

export type A2AAgentEntry = {
    url: string;
    custom_headers?: Record<string, string>;
};

export type A2AInboundKey = {
    label: string;
    key: string;
};

export type A2AInboundAuthProvider = "rodit" | "apiKey" | "none";

export type A2AInboundRoditAuthConfig = {
    issuer: string;
    audience: string;
    identityClaim?: string;
    allowApiKeyFallback?: boolean;
    /** Winston log level for `@rodit/rodit-auth-be` when loaded (default: error). */
    logLevel?: string;
};

export type A2AInboundAuthConfig = {
    provider?: A2AInboundAuthProvider;
    issuer?: string;
    audience?: string;
    identityClaim?: string;
    allowApiKeyFallback?: boolean;
    logLevel?: string;
};

export type A2AAgentCardConfig = {
    name?: string;
    description?: string;
    skills?: A2ASkillConfig[];
};

export type A2AInboundAgentConfig = {
    agentCard?: A2AAgentCardConfig;
};

export type A2AOutboundRoditCredentialsEnv = {
    accountId?: string;
    privateKey?: string;
    baseUrl?: string;
};

export type A2AOutboundRoditAuthConfig = {
    provider?: "rodit";
    credentialsEnv?: A2AOutboundRoditCredentialsEnv;
    jwtCacheTtlSeconds?: number;
    /** Winston log level for `@rodit/rodit-auth-be` when loaded (default: error). */
    logLevel?: string;
};

export type A2AOutboundAuthConfig = A2AOutboundRoditAuthConfig;

export type A2AOutboundConfig = {
    agents?: Record<string, A2AAgentEntry>;
    auth?: A2AOutboundAuthConfig;
    /** When true, skip TLS certificate verification for outbound HTTPS (peer agent cards + RPC). */
    tlsSkipVerify?: boolean;
    taskStore?: boolean;
    fileStore?: boolean;
    sendMessageCharacterLimit?: number;
    minimizedObjectStringLength?: number;
    viewArtifactCharacterLimit?: number;
    agentCardTimeout?: number;
    sendMessageTimeout?: number;
    getTaskTimeout?: number;
    getTaskPollInterval?: number;
};

export type A2AInboundConfig = {
    agentCard?: A2AAgentCardConfig;
    allowUnauthenticated?: boolean;
    auth?: A2AInboundAuthConfig;
    apiKeys?: A2AInboundKey[];
    agents?: Record<string, A2AInboundAgentConfig>;
    /** External base URL for Agent Card discovery (overrides request Host / proxy headers). */
    publicBaseUrl?: string;
};

export type A2APluginConfig = {
    outbound?: A2AOutboundConfig;
    inbound?: A2AInboundConfig;
};

type ConfigParseWarnings = string[];

function pushConfigWarning(warnings: ConfigParseWarnings | undefined, message: string): void {
    warnings?.push(message);
}

function parseStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }
    const result = value
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .map((v) => v.trim());
    return result.length > 0 ? result : undefined;
}

function parseSkills(
    value: unknown,
    warnings?: ConfigParseWarnings,
    path = "agentCard.skills",
): A2ASkillConfig[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }
    const result: A2ASkillConfig[] = [];
    for (const [index, entry] of value.entries()) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            pushConfigWarning(warnings, `${path}[${index}]: entry must be an object, skipped`);
            continue;
        }
        const raw = entry as Record<string, unknown>;
        const id = typeof raw.id === "string" ? raw.id.trim() : "";
        const name = typeof raw.name === "string" ? raw.name.trim() : "";
        const description = typeof raw.description === "string" ? raw.description.trim() : "";
        if (!id || !name || !description) {
            const missing = [
                !id ? "id" : null,
                !name ? "name" : null,
                !description ? "description" : null,
            ].filter((field): field is string => field !== null);
            pushConfigWarning(
                warnings,
                `${path}[${index}]: missing required field(s) (${missing.join(", ")}), skipped`,
            );
            continue;
        }
        const skill: A2ASkillConfig = { id, name, description };
        const tags = parseStringArray(raw.tags);
        if (tags) {
            skill.tags = tags;
        }
        const examples = parseStringArray(raw.examples);
        if (examples) {
            skill.examples = examples;
        }
        const inputModes = parseStringArray(raw.inputModes);
        if (inputModes) {
            skill.inputModes = inputModes;
        }
        const outputModes = parseStringArray(raw.outputModes);
        if (outputModes) {
            skill.outputModes = outputModes;
        }
        result.push(skill);
    }
    return result.length > 0 ? result : undefined;
}

function parseAgents(
    value: unknown,
    warnings?: ConfigParseWarnings,
): Record<string, A2AAgentEntry> | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        if (Array.isArray(value)) {
            pushConfigWarning(warnings, "outbound.agents must be an object, skipped");
        }
        return undefined;
    }
    const raw = value as Record<string, unknown>;
    const result: Record<string, A2AAgentEntry> = {};
    for (const [id, entry] of Object.entries(raw)) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            pushConfigWarning(warnings, `outbound.agents.${id}: entry must be an object, skipped`);
            continue;
        }
        const e = entry as Record<string, unknown>;
        const url = typeof e.url === "string" ? e.url.trim() : "";
        if (!url) {
            pushConfigWarning(warnings, `outbound.agents.${id}: missing or empty url, skipped`);
            continue;
        }
        let custom_headers: Record<string, string> | undefined;
        if (
            e.custom_headers &&
            typeof e.custom_headers === "object" &&
            !Array.isArray(e.custom_headers)
        ) {
            const filtered: Record<string, string> = {};
            for (const [hk, hv] of Object.entries(e.custom_headers as Record<string, unknown>)) {
                if (typeof hv === "string") {
                    filtered[hk] = hv;
                }
            }
            if (Object.keys(filtered).length > 0) {
                custom_headers = filtered;
            }
        }
        result[id] = { url, ...(custom_headers ? { custom_headers } : {}) };
    }
    return Object.keys(result).length > 0 ? result : undefined;
}

function parsePositiveNumber(value: unknown): number | undefined {
    return typeof value === "number" && value > 0 ? value : undefined;
}

function parseApiKeys(value: unknown, warnings?: ConfigParseWarnings): A2AInboundKey[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }
    const keys: A2AInboundKey[] = [];
    for (const [index, entry] of value.entries()) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            pushConfigWarning(
                warnings,
                `inbound.apiKeys[${index}]: entry must be an object, skipped`,
            );
            continue;
        }
        const e = entry as Record<string, unknown>;
        const label = parseA2AInboundKeyLabel(e.label);
        const key = typeof e.key === "string" ? e.key : "";
        if (!label && !key) {
            pushConfigWarning(
                warnings,
                `inbound.apiKeys[${index}]: missing label and key, skipped`,
            );
            continue;
        }
        if (!label) {
            pushConfigWarning(
                warnings,
                `inbound.apiKeys[${index}]: invalid or missing label, skipped`,
            );
            continue;
        }
        if (!key) {
            pushConfigWarning(
                warnings,
                `inbound.apiKeys[${index}] (${label}): missing key, skipped`,
            );
            continue;
        }
        keys.push({ label, key });
    }
    assertUniqueA2AInboundKeyLabels(keys);
    return keys.length > 0 ? keys : undefined;
}

function parseAgentCard(
    value: unknown,
    warnings?: ConfigParseWarnings,
    path = "inbound.agentCard",
): A2AAgentCardConfig | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }
    const raw = value as Record<string, unknown>;
    const name = typeof raw.name === "string" ? raw.name.trim() || undefined : undefined;
    const description =
        typeof raw.description === "string" ? raw.description.trim() || undefined : undefined;
    if (typeof raw.name === "string" && raw.name.trim().length === 0) {
        pushConfigWarning(warnings, `${path}.name: empty string ignored`);
    }
    if (typeof raw.description === "string" && raw.description.trim().length === 0) {
        pushConfigWarning(warnings, `${path}.description: empty string ignored`);
    }
    const skills = parseSkills(raw.skills, warnings, `${path}.skills`);
    if (name === undefined && description === undefined && skills === undefined) {
        return undefined;
    }
    return {
        ...(name ? { name } : {}),
        ...(description ? { description } : {}),
        ...(skills ? { skills } : {}),
    };
}

/**
 * Inbound agent IDs become URL path segments and filesystem path components, so
 * they must be slug-safe. The leading `(?!\.+$)` rejects dot-only IDs like `.`
 * and `..`, which would otherwise traverse paths.
 */
const INBOUND_AGENT_ID_PATTERN = /^(?!\.+$)[A-Za-z0-9._-]{1,64}$/;

function parseInboundAgents(
    value: unknown,
    warnings?: ConfigParseWarnings,
): Record<string, A2AInboundAgentConfig> | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        if (Array.isArray(value)) {
            pushConfigWarning(warnings, "inbound.agents must be an object, skipped");
        }
        return undefined;
    }
    const raw = value as Record<string, unknown>;
    const result: Record<string, A2AInboundAgentConfig> = {};
    for (const [id, entry] of Object.entries(raw)) {
        const agentId = id.trim();
        if (!INBOUND_AGENT_ID_PATTERN.test(agentId)) {
            pushConfigWarning(
                warnings,
                `inbound.agents.${id}: agent ID must match ^(?!\\.+$)[A-Za-z0-9._-]{1,64}$, skipped`,
            );
            continue;
        }
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            pushConfigWarning(warnings, `inbound.agents.${id}: entry must be an object, skipped`);
            continue;
        }
        const agentCard = parseAgentCard(
            (entry as Record<string, unknown>).agentCard,
            warnings,
            `inbound.agents.${agentId}.agentCard`,
        );
        result[agentId] = agentCard ? { agentCard } : {};
    }
    return Object.keys(result).length > 0 ? result : undefined;
}

function parseOutboundAuth(value: unknown): A2AOutboundAuthConfig | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }
    const raw = value as Record<string, unknown>;
    const provider = raw.provider === "rodit" ? "rodit" : undefined;
    const jwtCacheTtlSeconds = parsePositiveNumber(raw.jwtCacheTtlSeconds);
    const logLevel =
        typeof raw.logLevel === "string" ? raw.logLevel.trim() || undefined : undefined;

    let credentialsEnv: A2AOutboundRoditCredentialsEnv | undefined;
    if (
        raw.credentialsEnv &&
        typeof raw.credentialsEnv === "object" &&
        !Array.isArray(raw.credentialsEnv)
    ) {
        const creds = raw.credentialsEnv as Record<string, unknown>;
        const accountId =
            typeof creds.accountId === "string" ? creds.accountId.trim() || undefined : undefined;
        const privateKey =
            typeof creds.privateKey === "string" ? creds.privateKey.trim() || undefined : undefined;
        const baseUrl =
            typeof creds.baseUrl === "string" ? creds.baseUrl.trim() || undefined : undefined;
        if (accountId || privateKey || baseUrl) {
            credentialsEnv = {
                ...(accountId ? { accountId } : {}),
                ...(privateKey ? { privateKey } : {}),
                ...(baseUrl ? { baseUrl } : {}),
            };
        }
    }

    if (
        provider === undefined &&
        jwtCacheTtlSeconds === undefined &&
        credentialsEnv === undefined &&
        logLevel === undefined
    ) {
        return undefined;
    }

    return {
        ...(provider ? { provider } : {}),
        ...(credentialsEnv ? { credentialsEnv } : {}),
        ...(jwtCacheTtlSeconds !== undefined ? { jwtCacheTtlSeconds } : {}),
        ...(logLevel ? { logLevel } : {}),
    };
}

function parseOutbound(
    value: unknown,
    warnings?: ConfigParseWarnings,
): A2AOutboundConfig | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }
    const raw = value as Record<string, unknown>;
    const agents = parseAgents(raw.agents, warnings);
    const auth = parseOutboundAuth(raw.auth);
    const taskStore = typeof raw.taskStore === "boolean" ? raw.taskStore : undefined;
    const fileStore = typeof raw.fileStore === "boolean" ? raw.fileStore : undefined;
    const sendMessageCharacterLimit = parsePositiveNumber(raw.sendMessageCharacterLimit);
    const minimizedObjectStringLength = parsePositiveNumber(raw.minimizedObjectStringLength);
    const viewArtifactCharacterLimit = parsePositiveNumber(raw.viewArtifactCharacterLimit);
    const agentCardTimeout = parsePositiveNumber(raw.agentCardTimeout);
    const sendMessageTimeout = parsePositiveNumber(raw.sendMessageTimeout);
    const getTaskTimeout = parsePositiveNumber(raw.getTaskTimeout);
    const getTaskPollInterval = parsePositiveNumber(raw.getTaskPollInterval);
    const tlsSkipVerify = raw.tlsSkipVerify === true ? true : undefined;

    const result: A2AOutboundConfig = {};
    if (agents) result.agents = agents;
    if (auth) result.auth = auth;
    if (tlsSkipVerify !== undefined) result.tlsSkipVerify = tlsSkipVerify;
    if (taskStore !== undefined) result.taskStore = taskStore;
    if (fileStore !== undefined) result.fileStore = fileStore;
    if (sendMessageCharacterLimit !== undefined)
        result.sendMessageCharacterLimit = sendMessageCharacterLimit;
    if (minimizedObjectStringLength !== undefined)
        result.minimizedObjectStringLength = minimizedObjectStringLength;
    if (viewArtifactCharacterLimit !== undefined)
        result.viewArtifactCharacterLimit = viewArtifactCharacterLimit;
    if (agentCardTimeout !== undefined) result.agentCardTimeout = agentCardTimeout;
    if (sendMessageTimeout !== undefined) result.sendMessageTimeout = sendMessageTimeout;
    if (getTaskTimeout !== undefined) result.getTaskTimeout = getTaskTimeout;
    if (getTaskPollInterval !== undefined) result.getTaskPollInterval = getTaskPollInterval;

    return Object.keys(result).length > 0 ? result : undefined;
}

function parseInboundAuth(value: unknown): A2AInboundAuthConfig | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }
    const raw = value as Record<string, unknown>;
    const providerRaw = typeof raw.provider === "string" ? raw.provider.trim() : "";
    const provider =
        providerRaw === "rodit" || providerRaw === "apiKey" || providerRaw === "none"
            ? providerRaw
            : undefined;
    const issuer = typeof raw.issuer === "string" ? raw.issuer.trim() || undefined : undefined;
    const audience =
        typeof raw.audience === "string" ? raw.audience.trim() || undefined : undefined;
    const identityClaim =
        typeof raw.identityClaim === "string" ? raw.identityClaim.trim() || undefined : undefined;
    const allowApiKeyFallback =
        typeof raw.allowApiKeyFallback === "boolean" ? raw.allowApiKeyFallback : undefined;
    const logLevel =
        typeof raw.logLevel === "string" ? raw.logLevel.trim() || undefined : undefined;

    if (
        provider === undefined &&
        issuer === undefined &&
        audience === undefined &&
        identityClaim === undefined &&
        allowApiKeyFallback === undefined &&
        logLevel === undefined
    ) {
        return undefined;
    }

    return {
        ...(provider ? { provider } : {}),
        ...(issuer ? { issuer } : {}),
        ...(audience ? { audience } : {}),
        ...(identityClaim ? { identityClaim } : {}),
        ...(allowApiKeyFallback !== undefined ? { allowApiKeyFallback } : {}),
        ...(logLevel ? { logLevel } : {}),
    };
}

function parseInbound(
    value: unknown,
    warnings?: ConfigParseWarnings,
): A2AInboundConfig | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }
    const raw = value as Record<string, unknown>;
    const agentCard = parseAgentCard(raw.agentCard, warnings);
    const auth = parseInboundAuth(raw.auth);
    const allowUnauthenticated =
        typeof raw.allowUnauthenticated === "boolean" ? raw.allowUnauthenticated : undefined;
    const apiKeys = parseApiKeys(raw.apiKeys, warnings);
    const agents = parseInboundAgents(raw.agents, warnings);
    const publicBaseUrl =
        typeof raw.publicBaseUrl === "string" ? raw.publicBaseUrl.trim() || undefined : undefined;
    if (typeof raw.publicBaseUrl === "string" && raw.publicBaseUrl.trim().length === 0) {
        pushConfigWarning(warnings, "inbound.publicBaseUrl: empty string ignored");
    }

    if (
        agentCard === undefined &&
        auth === undefined &&
        allowUnauthenticated === undefined &&
        apiKeys === undefined &&
        agents === undefined &&
        publicBaseUrl === undefined
    ) {
        return undefined;
    }
    return {
        ...(agentCard ? { agentCard } : {}),
        ...(auth ? { auth } : {}),
        ...(allowUnauthenticated !== undefined ? { allowUnauthenticated } : {}),
        ...(apiKeys ? { apiKeys } : {}),
        ...(agents ? { agents } : {}),
        ...(publicBaseUrl ? { publicBaseUrl } : {}),
    };
}

export function parseA2APluginConfig(
    value: unknown,
    warnings?: ConfigParseWarnings,
): A2APluginConfig {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }
    const raw = value as Record<string, unknown>;
    const outbound = parseOutbound(raw.outbound, warnings);
    const inbound = parseInbound(raw.inbound, warnings);

    return {
        ...(outbound ? { outbound } : {}),
        ...(inbound ? { inbound } : {}),
    };
}

/**
 * Extract the A2A plugin config section from a full OpenClaw root config.
 */
export function extractA2AEntry(rootConfig: Record<string, unknown>): {
    pluginsEntries: Record<string, unknown>;
    a2aEntry: Record<string, unknown>;
    a2aConfig: Record<string, unknown>;
} {
    const pluginsEntries =
        ((rootConfig.plugins as Record<string, unknown> | undefined)?.entries as
            | Record<string, unknown>
            | undefined) ?? {};
    const a2aEntry = (pluginsEntries.a2a ?? {}) as Record<string, unknown>;
    const a2aConfig = (a2aEntry.config ?? {}) as Record<string, unknown>;
    return { pluginsEntries, a2aEntry, a2aConfig };
}

/** Merge a per-agent card update into the existing `inbound.agents` map. */
function mergeInboundAgents(
    existing: Record<string, unknown>,
    update: Record<string, unknown>,
): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...existing };
    for (const [id, entry] of Object.entries(update)) {
        const existingEntry = (existing[id] as Record<string, unknown> | undefined) ?? {};
        const nextEntry = entry as Record<string, unknown>;
        merged[id] = {
            ...existingEntry,
            ...nextEntry,
            ...(existingEntry.agentCard && nextEntry.agentCard
                ? {
                      agentCard: {
                          ...(existingEntry.agentCard as Record<string, unknown>),
                          ...(nextEntry.agentCard as Record<string, unknown>),
                      },
                  }
                : {}),
        };
    }
    return merged;
}

/**
 * Build a new root config with updated A2A plugin config merged in.
 * Performs a deep merge on the `inbound` key to preserve sibling fields
 * (e.g. updating `inbound.agentCard` without clobbering `inbound.apiKeys`).
 */
export function buildRootConfigWithA2A(
    rootConfig: Record<string, unknown>,
    a2aConfigUpdate: Record<string, unknown>,
): Record<string, unknown> {
    const { pluginsEntries, a2aEntry, a2aConfig } = extractA2AEntry(rootConfig);

    // Deep merge inbound so that updating agentCard doesn't clobber apiKeys,
    // and updating a single agentCard field doesn't clobber sibling card fields.
    let merged: Record<string, unknown>;
    if (a2aConfigUpdate.inbound && a2aConfig.inbound) {
        const { inbound: inboundUpdate, ...rest } = a2aConfigUpdate;
        const existingInbound = a2aConfig.inbound as Record<string, unknown>;
        const nextInbound = inboundUpdate as Record<string, unknown>;

        let mergedInbound: Record<string, unknown> = {
            ...existingInbound,
            ...nextInbound,
        };

        if (existingInbound.agentCard && nextInbound.agentCard) {
            mergedInbound = {
                ...mergedInbound,
                agentCard: {
                    ...(existingInbound.agentCard as Record<string, unknown>),
                    ...(nextInbound.agentCard as Record<string, unknown>),
                },
            };
        }

        // Per-agent edits target one agent's card, so merge by agent ID to keep
        // sibling agents and the target's other card fields intact.
        if (existingInbound.agents && nextInbound.agents) {
            mergedInbound = {
                ...mergedInbound,
                agents: mergeInboundAgents(
                    existingInbound.agents as Record<string, unknown>,
                    nextInbound.agents as Record<string, unknown>,
                ),
            };
        }

        merged = {
            ...a2aConfig,
            ...rest,
            inbound: mergedInbound,
        };
    } else {
        merged = { ...a2aConfig, ...a2aConfigUpdate };
    }

    return {
        ...rootConfig,
        plugins: {
            ...(rootConfig.plugins as Record<string, unknown>),
            entries: {
                ...pluginsEntries,
                a2a: { ...a2aEntry, config: merged },
            },
        },
    };
}
