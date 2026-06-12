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
        if (value === "" || value === null) {
            delete out[key];
        }
    }

    return out;
}
