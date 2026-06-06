// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentCard } from "@a2a-js/sdk";
import type { A2ARequestHandler, User } from "@a2a-js/sdk/server";
import { JsonRpcTransportHandler, ServerCallContext } from "@a2a-js/sdk/server";

import { type A2AAuthConfig, authenticateInboundRequest } from "../auth/authenticate-inbound.js";
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
};

export class A2AHttpHandlers {
    private readonly transportHandler: JsonRpcTransportHandler;

    constructor(private readonly params: A2AHttpHandlerParams) {
        this.transportHandler = new JsonRpcTransportHandler(params.requestHandler);
    }

    async handleAgentCard(req: IncomingMessage, res: ServerResponse): Promise<void> {
        this.sendJson(res, 200, this.params.getAgentCard?.(req) ?? this.params.agentCard);
    }

    async handleJsonRpc(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (req.method !== "POST") {
            res.setHeader("Allow", "POST");
            res.statusCode = 405;
            res.end("Method Not Allowed");
            return;
        }

        const bodyResultPromise = this.readJsonBody(req);

        const senderLabel = await this.resolveSenderLabel(req, res);
        if (!senderLabel) {
            return;
        }

        const bodyResult = await bodyResultPromise;
        if (!bodyResult.ok) {
            this.sendJson(res, 400, {
                jsonrpc: "2.0",
                id: null,
                error: { code: -32700, message: bodyResult.error },
            });
            return;
        }

        const serverCallContext = new ServerCallContext(
            undefined,
            new A2ARequestUser(senderLabel, this.params.auth?.required === true),
        );
        const rpcResponseOrStream = await this.transportHandler.handle(
            bodyResult.value,
            serverCallContext,
        );

        if (typeof (rpcResponseOrStream as AsyncGenerator)?.[Symbol.asyncIterator] === "function") {
            const stream = rpcResponseOrStream as AsyncGenerator<unknown, void, undefined>;
            this.setSseHeaders(res);
            try {
                for await (const event of stream) {
                    res.write(`data: ${JSON.stringify(event)}\n\n`);
                }
            } catch (err) {
                console.error("Error during SSE streaming:", err);
            } finally {
                if (!res.writableEnded) {
                    res.end();
                }
            }
            return;
        }

        this.sendJson(res, 200, rpcResponseOrStream);
    }

    private async resolveSenderLabel(
        req: IncomingMessage,
        res: ServerResponse,
    ): Promise<string | null> {
        if (!this.params.auth?.required) {
            return ANONYMOUS_SENDER_LABEL;
        }

        const result = await authenticateInboundRequest(req, this.params.auth);
        if (!result.ok) {
            sendAuthError(res, result.error);
            return null;
        }

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
