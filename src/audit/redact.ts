// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

const DEFAULT_SUMMARY_MAX = 200;

/** JWT-shaped or Bearer token substrings — never keep these in summaries. */
const SECRET_LIKE = /\b(Bearer\s+[A-Za-z0-9._~+/=-]+|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._~+/-]+)/gi;

const REDACTED_METADATA_KEYS = new Set([
    "authorization",
    "password",
    "secret",
    "token",
    "jwt",
    "apikey",
    "api_key",
    "privatekey",
    "private_key",
    "credentials",
    "signature",
    "near_private_key",
]);

function isRedactedKey(key: string): boolean {
    const normalized = key.trim().toLowerCase().replace(/[- ]/g, "_");
    if (REDACTED_METADATA_KEYS.has(normalized)) {
        return true;
    }
    return (
        normalized.includes("password") ||
        normalized.includes("secret") ||
        normalized.includes("private_key") ||
        normalized.endsWith("_token") ||
        normalized.endsWith("_jwt")
    );
}

/** Strip bearer/JWT-like substrings and truncate for audit content_summary. */
export function summarizeContent(
    text: string | undefined,
    maxLength = DEFAULT_SUMMARY_MAX,
): string | undefined {
    if (typeof text !== "string") {
        return undefined;
    }
    const cleaned = text.replace(SECRET_LIKE, "[REDACTED]").replace(/\s+/g, " ").trim();
    if (!cleaned) {
        return undefined;
    }
    if (cleaned.length <= maxLength) {
        return cleaned;
    }
    return `${cleaned.slice(0, maxLength)}…`;
}

/**
 * Extract a short text summary from A2A message parts / tool payloads.
 * Never returns Authorization headers or raw JWT strings.
 */
export function summarizeMessageContent(
    value: unknown,
    maxLength = DEFAULT_SUMMARY_MAX,
): string | undefined {
    const parts: string[] = [];
    collectTextParts(value, parts, 8);
    if (parts.length === 0) {
        return undefined;
    }
    return summarizeContent(parts.join(" "), maxLength);
}

function collectTextParts(value: unknown, out: string[], remaining: number): void {
    if (remaining <= 0 || value == null) {
        return;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed) {
            out.push(trimmed);
        }
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            if (out.length >= remaining) {
                return;
            }
            collectTextParts(item, out, remaining - out.length);
        }
        return;
    }
    if (typeof value !== "object") {
        return;
    }
    const obj = value as Record<string, unknown>;
    if (typeof obj.text === "string") {
        collectTextParts(obj.text, out, remaining);
        return;
    }
    if (Array.isArray(obj.parts)) {
        collectTextParts(obj.parts, out, remaining);
        return;
    }
    if (obj.message && typeof obj.message === "object") {
        collectTextParts(obj.message, out, remaining);
        return;
    }
    if (obj.params && typeof obj.params === "object") {
        collectTextParts(obj.params, out, remaining);
    }
}

/** Shallow-copy metadata with secret-looking keys removed. */
export function sanitizeMetadata(
    metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
    if (!metadata) {
        return undefined;
    }
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
        if (isRedactedKey(key)) {
            continue;
        }
        if (typeof value === "string") {
            const summarized = summarizeContent(value, 200);
            if (summarized !== undefined) {
                result[key] = summarized;
            }
            continue;
        }
        if (typeof value === "number" || typeof value === "boolean" || value === null) {
            result[key] = value;
            continue;
        }
        if (
            Array.isArray(value) &&
            value.every((v) => typeof v === "string" || typeof v === "number")
        ) {
            result[key] = value.slice(0, 20);
        }
    }
    return Object.keys(result).length > 0 ? result : undefined;
}

/** Safe peer label from a RODiT login body (never signatures or JWTs). */
export function extractSafeLoginPeer(
    body: Record<string, unknown> | undefined,
): string | undefined {
    if (!body) {
        return undefined;
    }
    for (const key of ["token_id", "tokenId", "rodit_id", "roditId", "account_id", "accountId"]) {
        const value = body[key];
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }
    return undefined;
}

export function extractJsonRpcMethod(body: unknown): string | undefined {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return undefined;
    }
    const method = (body as { method?: unknown }).method;
    return typeof method === "string" && method.trim() ? method.trim() : undefined;
}

export function extractTaskContextIds(value: unknown): { taskId?: string; contextId?: string } {
    if (!value || typeof value !== "object") {
        return {};
    }
    const obj = value as Record<string, unknown>;
    const fromResult =
        obj.result && typeof obj.result === "object" && !Array.isArray(obj.result)
            ? (obj.result as Record<string, unknown>)
            : obj;
    const nestedTask =
        fromResult.task && typeof fromResult.task === "object" && !Array.isArray(fromResult.task)
            ? (fromResult.task as Record<string, unknown>)
            : fromResult;

    const taskId = firstString(
        nestedTask.task_id,
        nestedTask.taskId,
        nestedTask.id,
        fromResult.task_id,
        fromResult.taskId,
        obj.task_id,
        obj.taskId,
    );
    const contextId = firstString(
        nestedTask.context_id,
        nestedTask.contextId,
        fromResult.context_id,
        fromResult.contextId,
        obj.context_id,
        obj.contextId,
    );
    return {
        ...(taskId ? { taskId } : {}),
        ...(contextId ? { contextId } : {}),
    };
}

function firstString(...values: unknown[]): string | undefined {
    for (const value of values) {
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }
    return undefined;
}
