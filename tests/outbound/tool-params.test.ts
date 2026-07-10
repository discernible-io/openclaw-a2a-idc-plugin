// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import {
    normalizeA2AToolParams,
    normalizeA2AToolResult,
    preferTokenIdInToolSchema,
    sanitizeOpenAiToolSchema,
} from "../../src/outbound/tool-params.js";

describe("sanitizeOpenAiToolSchema", () => {
    test("removes nullable type-array fields from required", () => {
        const schema: Record<string, unknown> = {
            properties: {
                agentId: { type: "string" },
                taskId: { type: ["string", "null"] },
            },
            required: ["agentId", "taskId"],
        };
        sanitizeOpenAiToolSchema(schema);
        expect(schema.required).toEqual(["agentId"]);
    });

    test("removes nullable anyOf fields from required", () => {
        const schema: Record<string, unknown> = {
            properties: {
                message: { type: "string" },
                files: {
                    anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }],
                },
            },
            required: ["message", "files"],
        };
        sanitizeOpenAiToolSchema(schema);
        expect(schema.required).toEqual(["message"]);
    });
});

describe("normalizeA2AToolParams", () => {
    test("maps snake_case keys and strips empty optional values", () => {
        expect(
            normalizeA2AToolParams({
                agent_id: "agent-b",
                message: "hello",
                task_id: "",
                context_id: "",
            }),
        ).toEqual({
            agentId: "agent-b",
            message: "hello",
        });
    });

    test("prefers camelCase when both snake and camel are present", () => {
        expect(
            normalizeA2AToolParams({
                agent_id: "snake",
                agentId: "camel",
                task_id: "keep-me",
            }),
        ).toEqual({
            agentId: "camel",
            taskId: "keep-me",
        });
    });

    test("strips whitespace-only optional strings", () => {
        expect(
            normalizeA2AToolParams({
                agentId: "agent-b",
                message: "hello",
                taskId: "   ",
                contextId: "\t",
            }),
        ).toEqual({
            agentId: "agent-b",
            message: "hello",
        });
    });

    test("maps token_id to agentId for outbound peer tools", () => {
        expect(
            normalizeA2AToolParams({
                token_id: "lncqsncdshcj",
                message: "hello",
            }),
        ).toEqual({
            agentId: "lncqsncdshcj",
            message: "hello",
        });
    });

    test("prefers explicit agentId over token_id", () => {
        expect(
            normalizeA2AToolParams({
                token_id: "lncqsncdshcj",
                agentId: "self",
                message: "hello",
            }),
        ).toEqual({
            agentId: "self",
            message: "hello",
        });
    });
});

describe("preferTokenIdInToolSchema", () => {
    test("renames agentId to token_id for peer-targeting tools", () => {
        const schema: Record<string, unknown> = {
            properties: {
                agentId: { type: "string", description: "from get_agents" },
                message: { type: "string" },
            },
            required: ["agentId", "message"],
        };
        preferTokenIdInToolSchema(schema, "send_message");
        const props = schema.properties as Record<string, unknown>;
        expect(props.agentId).toBeUndefined();
        expect(props.token_id).toBeDefined();
        expect(schema.required).toEqual(["token_id", "message"]);
    });

    test("leaves get_agents schema unchanged", () => {
        const schema: Record<string, unknown> = {
            properties: {},
            required: [],
        };
        preferTokenIdInToolSchema(schema, "get_agents");
        expect(schema.properties).toEqual({});
    });
});

describe("normalizeA2AToolResult", () => {
    test("adds snake_case aliases for task responses", () => {
        expect(
            normalizeA2AToolResult({
                kind: "task",
                id: "task-123",
                contextId: "ctx-456",
                status: { state: "completed" },
            }),
        ).toEqual({
            kind: "task",
            id: "task-123",
            task_id: "task-123",
            contextId: "ctx-456",
            context_id: "ctx-456",
            status: { state: "completed" },
        });
    });
});
