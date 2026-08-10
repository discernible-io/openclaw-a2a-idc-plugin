// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import * as fs from "node:fs";
import * as path from "node:path";

import { sanitizeMetadata, summarizeContent } from "./redact.js";
import type { A2AAuditEntry, A2AAuditLogInput } from "./types.js";

export type A2AAuditLoggerOptions = {
    /** When true, write NDJSON. Default false for {@link createA2AAuditLogger}. */
    enabled?: boolean;
    /** Directory for daily `a2a-audit-YYYY-MM-DD.jsonl` files. */
    logDir: string;
    /** Delete rotated files older than this many days. Default 30. */
    retentionDays?: number;
    /** Include truncated content_summary when provided. Default true. */
    includeContentSummary?: boolean;
    /** Max content_summary length. Default 200. */
    contentSummaryMaxLength?: number;
    /** Optional sink for write failures (never throws from log()). */
    onWarn?: (message: string) => void;
};

export interface A2AAuditLogger {
    readonly enabled: boolean;
    readonly logDir: string;
    log(input: A2AAuditLogInput): void;
}

const AUDIT_FILE_RE = /^a2a-audit-(\d{4}-\d{2}-\d{2})\.jsonl$/;
const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_SUMMARY_MAX = 200;
/** Prune at most once per process every N writes. */
const PRUNE_EVERY_N_WRITES = 50;

/**
 * Thread-safe-enough NDJSON audit writer (sync append under a lock).
 * Never throws from {@link log}; never writes secrets (callers must not pass them).
 */
export class FileA2AAuditLogger implements A2AAuditLogger {
    readonly enabled: boolean;
    readonly logDir: string;
    private readonly retentionDays: number;
    private readonly includeContentSummary: boolean;
    private readonly contentSummaryMaxLength: number;
    private readonly onWarn?: (message: string) => void;
    private writeCount = 0;
    private pruneScheduled = false;

    constructor(options: A2AAuditLoggerOptions) {
        this.enabled = options.enabled === true;
        this.logDir = options.logDir;
        this.retentionDays =
            typeof options.retentionDays === "number" && options.retentionDays > 0
                ? Math.floor(options.retentionDays)
                : DEFAULT_RETENTION_DAYS;
        this.includeContentSummary = options.includeContentSummary !== false;
        this.contentSummaryMaxLength =
            typeof options.contentSummaryMaxLength === "number" &&
            options.contentSummaryMaxLength > 0
                ? Math.floor(options.contentSummaryMaxLength)
                : DEFAULT_SUMMARY_MAX;
        this.onWarn = options.onWarn;
    }

    log(input: A2AAuditLogInput): void {
        if (!this.enabled) {
            return;
        }
        try {
            const entry = this.buildEntry(input);
            const line = `${JSON.stringify(entry)}\n`;
            fs.mkdirSync(this.logDir, { recursive: true });
            const filePath = path.join(this.logDir, auditFileNameForDate(new Date()));
            fs.appendFileSync(filePath, line, { encoding: "utf8" });
            this.writeCount += 1;
            if (this.writeCount === 1 || this.writeCount % PRUNE_EVERY_N_WRITES === 0) {
                this.schedulePrune();
            }
        } catch (err) {
            this.onWarn?.(
                `[a2a] audit log write failed: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    private buildEntry(input: A2AAuditLogInput): A2AAuditEntry {
        const status = input.status ?? (input.error ? "failure" : "success");
        const contentSummary =
            this.includeContentSummary && input.contentSummary
                ? summarizeContent(input.contentSummary, this.contentSummaryMaxLength)
                : undefined;
        const metadata = sanitizeMetadata(input.metadata);
        const entry: A2AAuditEntry = {
            version: "1",
            timestamp: new Date().toISOString(),
            event_type: input.eventType,
            direction: input.direction,
            status,
        };
        if (input.sourceAgent) entry.source_agent = input.sourceAgent;
        if (input.targetAgent) entry.target_agent = input.targetAgent;
        if (input.taskId) entry.task_id = input.taskId;
        if (input.contextId) entry.context_id = input.contextId;
        if (input.method) entry.method = input.method;
        if (input.tool) entry.tool = input.tool;
        if (contentSummary) entry.content_summary = contentSummary;
        if (typeof input.durationMs === "number" && Number.isFinite(input.durationMs)) {
            entry.duration_ms = Math.max(0, Math.round(input.durationMs));
        }
        if (input.error?.message) {
            entry.error = {
                message: summarizeContent(input.error.message, 500) ?? "error",
                ...(input.error.code ? { code: input.error.code } : {}),
            };
        }
        if (metadata) entry.metadata = metadata;
        return entry;
    }

    private schedulePrune(): void {
        if (this.pruneScheduled) {
            return;
        }
        this.pruneScheduled = true;
        queueMicrotask(() => {
            this.pruneScheduled = false;
            try {
                pruneAuditFiles(this.logDir, this.retentionDays);
            } catch (err) {
                this.onWarn?.(
                    `[a2a] audit log prune failed: ${err instanceof Error ? err.message : String(err)}`,
                );
            }
        });
    }
}

/** No-op logger used when audit is disabled. */
export class NoopA2AAuditLogger implements A2AAuditLogger {
    readonly enabled = false;
    readonly logDir: string;

    constructor(logDir = "") {
        this.logDir = logDir;
    }

    log(_input: A2AAuditLogInput): void {}
}

export function createA2AAuditLogger(options: A2AAuditLoggerOptions): A2AAuditLogger {
    if (options.enabled !== true) {
        return new NoopA2AAuditLogger(options.logDir);
    }
    return new FileA2AAuditLogger({ ...options, enabled: true });
}

export function auditFileNameForDate(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `a2a-audit-${y}-${m}-${d}.jsonl`;
}

export function pruneAuditFiles(logDir: string, retentionDays: number): number {
    if (!fs.existsSync(logDir)) {
        return 0;
    }
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let removed = 0;
    for (const name of fs.readdirSync(logDir)) {
        const match = AUDIT_FILE_RE.exec(name);
        if (!match) {
            continue;
        }
        const dayStart = Date.parse(`${match[1]}T00:00:00.000Z`);
        if (!Number.isFinite(dayStart) || dayStart >= cutoff) {
            continue;
        }
        fs.unlinkSync(path.join(logDir, name));
        removed += 1;
    }
    return removed;
}
