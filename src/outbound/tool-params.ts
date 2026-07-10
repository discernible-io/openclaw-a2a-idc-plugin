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

/** Outbound tools that target a peer by Passport token_id (or legacy config alias). */
const PEER_TARGETING_TOOLS = new Set([
    "get_agent",
    "send_message",
    "get_task",
    "view_text_artifact",
    "view_data_artifact",
]);

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

    if (out.agentId === undefined) {
        if (out.token_id !== undefined) {
            out.agentId = out.token_id;
        } else if (out.tokenId !== undefined) {
            out.agentId = out.tokenId;
        }
    }
    delete out.token_id;
    delete out.tokenId;

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

/** Present peer-targeting tools as `token_id` instead of a2a-utils `agentId`. */
export function preferTokenIdInToolSchema(
    schema: Record<string, unknown>,
    toolName: string,
): void {
    if (!PEER_TARGETING_TOOLS.has(toolName)) {
        return;
    }

    const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
    const agentIdProp = props.agentId;
    if (!agentIdProp) {
        return;
    }

    props.token_id = {
        ...agentIdProp,
        description:
            "Passport token_id from a2a_get_agents. Legacy outbound config aliases without a token_id may also be passed here.",
    };
    delete props.agentId;

    if (Array.isArray(schema.required)) {
        schema.required = schema.required.map((key) => (key === "agentId" ? "token_id" : key));
    }
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
