// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { afterAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
    FileA2AAuditLogger,
    NoopA2AAuditLogger,
    auditFileNameForDate,
    createA2AAuditLogger,
    pruneAuditFiles,
} from "../../src/audit/logger.js";
import { queryA2AAuditLog } from "../../src/audit/query.js";
import {
    extractJsonRpcMethod,
    extractSafeLoginPeer,
    extractTaskContextIds,
    sanitizeMetadata,
    summarizeContent,
    summarizeMessageContent,
} from "../../src/audit/redact.js";

const tmpDirs: string[] = [];

function tmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a2a-audit-"));
    tmpDirs.push(dir);
    return dir;
}

afterAll(() => {
    for (const dir of tmpDirs) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

describe("audit redact helpers", () => {
    test("summarizeContent redacts bearer and JWT-like tokens", () => {
        const summary = summarizeContent(
            "hello Bearer eyJhbGciOiJIUzI1NiJ9.abc.def world eyJhbGciOiJIUzI1NiJ9.xxx.yyy",
        );
        expect(summary).toContain("hello");
        expect(summary).toContain("[REDACTED]");
        expect(summary).not.toContain("eyJ");
        expect(summary).not.toContain("Bearer eyJ");
    });

    test("summarizeMessageContent pulls text parts", () => {
        expect(
            summarizeMessageContent({
                params: {
                    message: {
                        parts: [{ text: "ping peer" }, { text: "please" }],
                    },
                },
            }),
        ).toBe("ping peer please");
    });

    test("sanitizeMetadata drops secret keys", () => {
        expect(
            sanitizeMetadata({
                authorization: "Bearer secret",
                retry_count: 2,
                peer: "token-1",
            }),
        ).toEqual({ retry_count: 2, peer: "token-1" });
    });

    test("extractSafeLoginPeer ignores signatures", () => {
        expect(
            extractSafeLoginPeer({
                token_id: "abc.near",
                signature: "deadbeef",
            }),
        ).toBe("abc.near");
        expect(extractJsonRpcMethod({ method: "message/send" })).toBe("message/send");
        expect(extractTaskContextIds({ result: { id: "t1", contextId: "c1" } })).toEqual({
            taskId: "t1",
            contextId: "c1",
        });
    });
});

describe("FileA2AAuditLogger", () => {
    test("writes NDJSON and can be queried", async () => {
        const logDir = tmpDir();
        const logger = new FileA2AAuditLogger({ logDir, enabled: true });
        logger.log({
            eventType: "message_sent",
            direction: "outbound",
            targetAgent: "peer-a",
            taskId: "task-1",
            contentSummary: "hello Bearer eyJhbGciOiJIUzI1NiJ9.abc.def",
            metadata: { authorization: "nope", attempt: 1 },
        });
        logger.log({
            eventType: "auth_failure",
            direction: "inbound",
            status: "failure",
            error: { message: "Authentication required" },
        });

        const file = path.join(logDir, auditFileNameForDate(new Date()));
        expect(fs.existsSync(file)).toBe(true);
        const lines = fs.readFileSync(file, "utf8").trim().split("\n");
        expect(lines).toHaveLength(2);
        const first = JSON.parse(lines[0]) as Record<string, unknown>;
        expect(first.version).toBe("1");
        expect(first.event_type).toBe("message_sent");
        expect(String(first.content_summary)).toContain("[REDACTED]");
        expect(first.metadata).toEqual({ attempt: 1 });

        const queried = await queryA2AAuditLog(logDir, { peer: "peer-a", limit: 10 });
        expect(queried).toHaveLength(1);
        expect(queried[0].task_id).toBe("task-1");

        const errors = await queryA2AAuditLog(logDir, { errorsOnly: true });
        expect(errors).toHaveLength(1);
        expect(errors[0].event_type).toBe("auth_failure");
    });

    test("noop logger writes nothing", () => {
        const logDir = tmpDir();
        const logger = createA2AAuditLogger({ enabled: false, logDir });
        expect(logger).toBeInstanceOf(NoopA2AAuditLogger);
        logger.log({
            eventType: "message_received",
            direction: "inbound",
        });
        expect(fs.readdirSync(logDir)).toEqual([]);
    });

    test("pruneAuditFiles removes old day files", () => {
        const logDir = tmpDir();
        fs.mkdirSync(logDir, { recursive: true });
        const oldName = "a2a-audit-2020-01-01.jsonl";
        fs.writeFileSync(path.join(logDir, oldName), "{}\n");
        const kept = auditFileNameForDate(new Date());
        fs.writeFileSync(path.join(logDir, kept), "{}\n");
        expect(pruneAuditFiles(logDir, 30)).toBe(1);
        expect(fs.existsSync(path.join(logDir, oldName))).toBe(false);
        expect(fs.existsSync(path.join(logDir, kept))).toBe(true);
    });
});
