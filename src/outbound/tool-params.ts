// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

function isNullableJsonSchemaProperty(prop: { type?: unknown; anyOf?: unknown[] }): boolean {
    const t = prop?.type;
    if (Array.isArray(t) && t.includes("null")) {
        return true;
    }
    const anyOf = prop?.anyOf;
    return (
        Array.isArray(anyOf) &&
        anyOf.some(
            (item) =>
                typeof item === "object" &&
                item !== null &&
                (item as { type?: string }).type === "null",
        )
    );
}

/** OpenAI-target zodToJsonSchema marks optional fields as required + nullable. */
export function sanitizeOpenAiToolSchema(schema: Record<string, unknown>): void {
    const required = schema.required;
    if (!Array.isArray(required)) return;

    const props = (schema.properties ?? {}) as Record<
        string,
        { type?: unknown; anyOf?: unknown[] }
    >;
    schema.required = required.filter((key) => !isNullableJsonSchemaProperty(props[key] ?? {}));
}

const SNAKE_TO_CAMEL: Record<string, string> = {
    agent_id: "agentId",
    context_id: "contextId",
    task_id: "taskId",
    poll_interval: "pollInterval",
    line_start: "lineStart",
    line_end: "lineEnd",
    character_start: "characterStart",
    character_end: "characterEnd",
    artifact_id: "artifactId",
    json_path: "jsonPath",
};

/** Models pass "" for optional fields; a2a-utils rejects empty taskId. */
export function normalizeA2AToolParams(
    params: Record<string, unknown>,
): Record<string, unknown> {
    const out: Record<string, unknown> = { ...params };

    for (const [snake, camel] of Object.entries(SNAKE_TO_CAMEL)) {
        if (out[snake] !== undefined && out[camel] === undefined) {
            out[camel] = out[snake];
        }
        delete out[snake];
    }

    for (const [key, value] of Object.entries(out)) {
        if (value === null) {
            delete out[key];
            continue;
        }
        if (typeof value === "string") {
            const trimmed = value.trim();
            if (trimmed.length === 0) {
                delete out[key];
            } else if (trimmed !== value) {
                out[key] = trimmed;
            }
        }
    }

    return out;
}

/** LLM tools/docs refer to task_id / context_id; a2a-utils returns id / contextId. */
export function normalizeA2AToolResult(
    result: Record<string, unknown>,
): Record<string, unknown> {
    if (result.error === true) {
        return result;
    }

    const out: Record<string, unknown> = { ...result };
    if (out.kind === "task" && typeof out.id === "string") {
        out.task_id = out.id;
    }
    if (typeof out.contextId === "string") {
        out.context_id = out.contextId;
    }
    return out;
}
