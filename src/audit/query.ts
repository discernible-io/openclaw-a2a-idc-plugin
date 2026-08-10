// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

import { auditFileNameForDate } from "./logger.js";
import type { A2AAuditEntry, A2AAuditQueryOptions } from "./types.js";

const AUDIT_FILE_RE = /^a2a-audit-(\d{4}-\d{2}-\d{2})\.jsonl$/;

/**
 * Query daily NDJSON audit files under `logDir`.
 * Newest matching entries first; `limit` defaults to 50.
 */
export async function queryA2AAuditLog(
    logDir: string,
    options: A2AAuditQueryOptions = {},
): Promise<A2AAuditEntry[]> {
    const limit = Math.max(1, Math.min(options.limit ?? 50, 1000));
    const files = listAuditFiles(logDir, options).reverse();
    const matches: A2AAuditEntry[] = [];

    for (const file of files) {
        const entries = await readAuditFileNewestFirst(path.join(logDir, file));
        for (const entry of entries) {
            if (!matchesFilters(entry, options)) {
                continue;
            }
            matches.push(entry);
            if (matches.length >= limit) {
                return matches;
            }
        }
    }
    return matches;
}

function listAuditFiles(logDir: string, options: A2AAuditQueryOptions): string[] {
    if (!fs.existsSync(logDir)) {
        return [];
    }
    if (options.date) {
        const name = `a2a-audit-${options.date}.jsonl`;
        return fs.existsSync(path.join(logDir, name)) ? [name] : [];
    }

    const sinceMs = options.since ? Date.parse(options.since) : Number.NaN;
    const names = fs
        .readdirSync(logDir)
        .filter((name) => AUDIT_FILE_RE.test(name))
        .sort();

    if (!Number.isFinite(sinceMs)) {
        return names;
    }

    const sinceDay = auditFileNameForDate(new Date(sinceMs));
    return names.filter((name) => name >= sinceDay);
}

async function readAuditFileNewestFirst(filePath: string): Promise<A2AAuditEntry[]> {
    const entries: A2AAuditEntry[] = [];
    const stream = fs.createReadStream(filePath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });
    for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }
        try {
            const parsed = JSON.parse(trimmed) as A2AAuditEntry;
            if (parsed && typeof parsed === "object" && parsed.version === "1") {
                entries.push(parsed);
            }
        } catch {
            // skip malformed lines
        }
    }
    entries.reverse();
    return entries;
}

function matchesFilters(entry: A2AAuditEntry, options: A2AAuditQueryOptions): boolean {
    if (options.eventType && entry.event_type !== options.eventType) {
        return false;
    }
    if (options.errorsOnly && entry.status !== "failure" && entry.event_type !== "error") {
        return false;
    }
    if (options.taskId) {
        if (entry.task_id !== options.taskId) {
            return false;
        }
    }
    if (options.peer) {
        const peer = options.peer.trim().toLowerCase();
        const source = entry.source_agent?.toLowerCase() ?? "";
        const target = entry.target_agent?.toLowerCase() ?? "";
        if (source !== peer && target !== peer) {
            return false;
        }
    }
    if (options.since) {
        const sinceMs = Date.parse(options.since);
        const entryMs = Date.parse(entry.timestamp);
        if (Number.isFinite(sinceMs) && Number.isFinite(entryMs) && entryMs < sinceMs) {
            return false;
        }
    }
    return true;
}
