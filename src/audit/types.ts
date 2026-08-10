// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

/** Structured A2A audit event types (NDJSON). */
export type A2AAuditEventType =
    | "message_received"
    | "message_sent"
    | "agent_discovered"
    | "task_get"
    | "auth_success"
    | "auth_failure"
    | "login_success"
    | "login_failure"
    | "error";

export type A2AAuditDirection = "inbound" | "outbound";

export type A2AAuditStatus = "success" | "failure";

export type A2AAuditError = {
    code?: string;
    message: string;
};

/** Fields accepted by {@link A2AAuditLogger.log}; secrets must never be passed here. */
export type A2AAuditLogInput = {
    eventType: A2AAuditEventType;
    direction: A2AAuditDirection;
    status?: A2AAuditStatus;
    sourceAgent?: string;
    targetAgent?: string;
    taskId?: string;
    contextId?: string;
    method?: string;
    tool?: string;
    contentSummary?: string;
    durationMs?: number;
    error?: A2AAuditError;
    metadata?: Record<string, unknown>;
};

/** One NDJSON audit line written to disk. */
export type A2AAuditEntry = {
    version: "1";
    timestamp: string;
    event_type: A2AAuditEventType;
    direction: A2AAuditDirection;
    status: A2AAuditStatus;
    source_agent?: string;
    target_agent?: string;
    task_id?: string;
    context_id?: string;
    method?: string;
    tool?: string;
    content_summary?: string;
    duration_ms?: number;
    error?: A2AAuditError;
    metadata?: Record<string, unknown>;
};

export type A2AAuditQueryOptions = {
    eventType?: A2AAuditEventType;
    peer?: string;
    taskId?: string;
    date?: string;
    since?: string;
    errorsOnly?: boolean;
    limit?: number;
};
