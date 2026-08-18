// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentCard } from "@a2a-js/sdk";
import type { A2ARequestHandler, User } from "@a2a-js/sdk/server";
import { JsonRpcTransportHandler, ServerCallContext } from "@a2a-js/sdk/server";

import type { A2AAuditLogger } from "../audit/logger.js";
import {
    extractJsonRpcMethod,
    extractTaskContextIds,
    summarizeMessageContent,
} from "../audit/redact.js";
import { type A2AAuthConfig, authenticateInboundRequest } from "../auth/authenticate-inbound.js";
import { type A2AHostLogger, createRequestId, toLogError } from "../log.js";
import { sendAuthError } from "./auth.js";

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB
const ANONYMOUS_SENDER_LABEL = "anonymous";

class A2ARequestUser implements User {
    constructor(
        private readonly label: string,
        private readonly authenticated: boolean,
    ) {}

    get isAuthenticated(): boolean {
        return this.authenticated;
    }

    get userName(): string {
        return this.label;
    }
}

export type { A2AAuthConfig } from "../auth/authenticate-inbound.js";

export type A2AHttpHandlerParams = {
    agentCard: AgentCard;
    getAgentCard?: (req: IncomingMessage) => AgentCard;
    requestHandler: A2ARequestHandler;
    auth?: A2AAuthConfig;
    audit?: A2AAuditLogger;
    logger?: A2AHostLogger;
    /** Local inbound agent id (multi-agent mode) for audit metadata. */
    agentId?: string;
};

export class A2AHttpHandlers {
    private readonly transportHandler: JsonRpcTransportHandler;

    constructor(private readonly params: A2AHttpHandlerParams) {
        this.transportHandler = new JsonRpcTransportHandler(params.requestHandler);
    }

    async handleAgentCard(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const started = Date.now();
        try {
            this.sendJson(res, 200, this.params.getAgentCard?.(req) ?? this.params.agentCard);
            this.params.audit?.log({
                eventType: "agent_discovered",
                direction: "inbound",
                status: "success",
                durationMs: Date.now() - started,
                metadata: {
                    ...(this.params.agentId ? { agent_id: this.params.agentId } : {}),
                    path: "agent-card",
                },
            });
        } catch (err) {
            this.params.audit?.log({
                eventType: "error",
                direction: "inbound",
                status: "failure",
                durationMs: Date.now() - started,
                error: {
                    message: err instanceof Error ? err.message : String(err),
                },
                metadata: {
                    ...(this.params.agentId ? { agent_id: this.params.agentId } : {}),
                    path: "agent-card",
                },
            });
            throw err;
        }
    }

    async handleJsonRpc(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const started = Date.now();
        const requestId = createRequestId();
        res.setHeader("X-Request-Id", requestId);
        if (req.method !== "POST") {
            res.setHeader("Allow", "POST");
            res.statusCode = 405;
            res.end("Method Not Allowed");
            return;
        }

        const bodyResult = await this.readJsonBody(req);
        if (!bodyResult.ok) {
            this.sendJson(res, 400, {
                jsonrpc: "2.0",
                id: null,
                error: {
                    code: -32700,
                    message: bodyResult.error,
                    data: { requestId },
                },
            });
            this.params.audit?.log({
                eventType: "error",
                direction: "inbound",
                status: "failure",
                durationMs: Date.now() - started,
                error: { code: "INVALID_JSON", message: bodyResult.error },
                metadata: {
                    ...(this.params.agentId ? { agent_id: this.params.agentId } : {}),
                    request_id: requestId,
                },
            });
            return;
        }

        const method = extractJsonRpcMethod(bodyResult.value);
        const senderLabel = await this.resolveSenderLabel(req, res, method, requestId);
        if (!senderLabel) {
            return;
        }

        try {
            const serverCallContext = new ServerCallContext(
                undefined,
                new A2ARequestUser(senderLabel, this.params.auth?.required === true),
            );
            const rpcResponseOrStream = await this.transportHandler.handle(
                bodyResult.value,
                serverCallContext,
            );

            if (
                typeof (rpcResponseOrStream as AsyncGenerator)?.[Symbol.asyncIterator] ===
                "function"
            ) {
                const stream = rpcResponseOrStream as AsyncGenerator<unknown, void, undefined>;
                this.setSseHeaders(res);
                try {
                    for await (const event of stream) {
                        res.write(`data: ${JSON.stringify(event)}\n\n`);
                    }
                    this.logInboundMessage({
                        senderLabel,
                        method,
                        body: bodyResult.value,
                        response: undefined,
                        durationMs: Date.now() - started,
                        streaming: true,
                        requestId,
                    });
                } catch (err) {
                    this.params.logger?.error("SSE streaming failed", {
                        requestId,
                        operation: "inbound.jsonrpc.stream",
                        error: toLogError(err),
                    });
                    this.params.audit?.log({
                        eventType: "error",
                        direction: "inbound",
                        status: "failure",
                        sourceAgent: senderLabel,
                        method,
                        durationMs: Date.now() - started,
                        error: {
                            message: err instanceof Error ? err.message : String(err),
                        },
                        metadata: {
                            ...(this.params.agentId ? { agent_id: this.params.agentId } : {}),
                            request_id: requestId,
                            streaming: true,
                        },
                    });
                } finally {
                    if (!res.writableEnded) {
                        res.end();
                    }
                }
                return;
            }

            this.sendJson(res, 200, rpcResponseOrStream);
            this.logInboundMessage({
                senderLabel,
                method,
                body: bodyResult.value,
                response: rpcResponseOrStream,
                durationMs: Date.now() - started,
                streaming: false,
                requestId,
            });
        } catch (err) {
            this.params.logger?.error("JSON-RPC handler failed", {
                requestId,
                operation: "inbound.jsonrpc",
                error: toLogError(err),
            });
            this.params.audit?.log({
                eventType: "error",
                direction: "inbound",
                status: "failure",
                sourceAgent: senderLabel,
                method,
                durationMs: Date.now() - started,
                error: {
                    message: err instanceof Error ? err.message : String(err),
                },
                metadata: {
                    ...(this.params.agentId ? { agent_id: this.params.agentId } : {}),
                    request_id: requestId,
                },
            });
            throw err;
        }
    }

    private logInboundMessage(params: {
        senderLabel: string;
        method?: string;
        body: unknown;
        response: unknown;
        durationMs: number;
        streaming: boolean;
        requestId: string;
    }): void {
        const ids = {
            ...extractTaskContextIds(params.body),
            ...extractTaskContextIds(params.response),
        };
        this.params.audit?.log({
            eventType: "message_received",
            direction: "inbound",
            status: "success",
            sourceAgent: params.senderLabel,
            method: params.method,
            taskId: ids.taskId,
            contextId: ids.contextId,
            contentSummary: summarizeMessageContent(params.body),
            durationMs: params.durationMs,
            metadata: {
                ...(this.params.agentId ? { agent_id: this.params.agentId } : {}),
                request_id: params.requestId,
                streaming: params.streaming,
            },
        });
    }

    private async resolveSenderLabel(
        req: IncomingMessage,
        res: ServerResponse,
        method: string | undefined,
        requestId: string,
    ): Promise<string | null> {
        if (!this.params.auth?.required) {
            return ANONYMOUS_SENDER_LABEL;
        }

        const result = await authenticateInboundRequest(req, this.params.auth);
        if (!result.ok) {
            sendAuthError(res, result.error, { reason: result.reason, requestId });
            this.params.audit?.log({
                eventType: "auth_failure",
                direction: "inbound",
                status: "failure",
                method,
                error: {
                    code: result.reason,
                    message: result.error,
                },
                metadata: {
                    ...(this.params.agentId ? { agent_id: this.params.agentId } : {}),
                    request_id: requestId,
                    auth_reason: result.reason,
                },
            });
            return null;
        }

        this.params.audit?.log({
            eventType: "auth_success",
            direction: "inbound",
            status: "success",
            sourceAgent: result.identity,
            method,
            metadata: {
                ...(this.params.agentId ? { agent_id: this.params.agentId } : {}),
                request_id: requestId,
                auth_mode: result.authMode,
            },
        });

        return result.identity;
    }

    private async readJsonBody(
        req: IncomingMessage,
    ): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
        return new Promise((resolve) => {
            const chunks: Buffer[] = [];
            let size = 0;
            let settled = false;

            const done = (result: { ok: true; value: unknown } | { ok: false; error: string }) => {
                if (settled) {
                    return;
                }
                settled = true;
                resolve(result);
            };

            req.on("data", (chunk: Buffer) => {
                if (settled) {
                    return;
                }
                size += chunk.length;
                if (size > MAX_BODY_BYTES) {
                    req.destroy();
                    done({ ok: false, error: "Request body too large" });
                    return;
                }
                chunks.push(chunk);
            });

            req.on("end", () => {
                try {
                    const body = Buffer.concat(chunks).toString("utf8");
                    if (!body.trim()) {
                        done({ ok: false, error: "Empty request body" });
                        return;
                    }
                    done({ ok: true, value: JSON.parse(body) });
                } catch {
                    done({ ok: false, error: "Invalid JSON body" });
                }
            });

            req.on("error", (err) => {
                done({ ok: false, error: err.message });
            });
        });
    }

    private sendJson(res: ServerResponse, status: number, body: unknown): void {
        res.statusCode = status;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(body));
    }

    private setSseHeaders(res: ServerResponse): void {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders?.();
    }
}
