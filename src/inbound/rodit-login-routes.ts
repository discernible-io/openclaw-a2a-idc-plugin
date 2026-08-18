// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import type { IncomingMessage, ServerResponse } from "node:http";

import type { A2AAuditLogger } from "../audit/logger.js";
import { extractSafeLoginPeer } from "../audit/redact.js";
import { applyRoditEmbedEnv } from "../auth/rodit-embed-env.js";
import { loadRoditAuthBe } from "../auth/rodit-runtime.js";
import type { A2AInboundRoditLoginConfig } from "../config.js";
import { type A2AHostLogger, createRequestId, toLogError } from "../log.js";

export const DEFAULT_RODIT_LOGIN_PATH = "/api/login";
export const DEFAULT_RODIT_LOGIN_TIMESTAMP_PATH = "/api/login/timestamp";

type RoditClientWithLogin = {
    login_client: (req: IncomingMessage, res: ServerResponse) => Promise<unknown>;
};

type RoditClientConstructor = {
    create: (options?: { role?: string }) => Promise<RoditClientWithLogin>;
};

let roditClientPromise: Promise<RoditClientWithLogin> | null = null;

function ensureRoditCredentialSource(): void {
    if (process.env.RODIT_NEAR_CREDENTIALS_SOURCE?.trim()) {
        return;
    }
    if (process.env.NEAR_CREDENTIALS_FILE_PATH?.trim()) {
        process.env.RODIT_NEAR_CREDENTIALS_SOURCE = "file";
        return;
    }
    throw new Error(
        "RODiT login routes require NEAR_CREDENTIALS_FILE_PATH (Passport credentials file)",
    );
}

function applyRoditLoginMode(config: A2AInboundRoditLoginConfig): void {
    const mode = config.loginMode ?? "promiscuous";
    process.env.SECURITY_OPTIONS_LOGIN_MODE = mode;
}

async function getRoditClient(logLevel?: string): Promise<RoditClientWithLogin> {
    ensureRoditCredentialSource();
    applyRoditEmbedEnv({ logLevel });
    if (!roditClientPromise) {
        const { RoditClient } = loadRoditAuthBe({ logLevel }) as unknown as {
            RoditClient: RoditClientConstructor;
        };
        roditClientPromise = RoditClient.create({ role: "server" });
    }
    return roditClientPromise;
}

async function readJsonBody(
    req: IncomingMessage,
    maxBytes = 64 * 1024,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; error: string }> {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of req) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buf.length;
        if (total > maxBytes) {
            return { ok: false, error: "Request body too large" };
        }
        chunks.push(buf);
    }
    if (chunks.length === 0) {
        return { ok: true, body: {} };
    }
    try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return { ok: false, error: "Invalid JSON body" };
        }
        return { ok: true, body: parsed as Record<string, unknown> };
    } catch {
        return { ok: false, error: "Invalid JSON body" };
    }
}

function attachParsedBody(
    req: IncomingMessage,
    body: Record<string, unknown>,
): IncomingMessage & { body: Record<string, unknown> } {
    return Object.assign(req, { body });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(payload));
}

function sendRestError(
    res: ServerResponse,
    status: number,
    params: { code: string; message: string; requestId: string },
): void {
    res.setHeader("X-Request-Id", params.requestId);
    sendJson(res, status, {
        error: { code: params.code, message: params.message },
        requestId: params.requestId,
        timestamp: new Date().toISOString(),
    });
}

/** rodit-auth-be `login_client` expects Express-style `res.status().json()` / `res.json()`. */
export function wrapExpressLikeResponse(res: ServerResponse): ServerResponse & {
    status: (code: number) => { json: (payload: unknown) => void };
    json: (payload: unknown) => void;
} {
    let statusCode = 200;
    const wrapped = res as ServerResponse & {
        status: (code: number) => { json: (payload: unknown) => void };
        json: (payload: unknown) => void;
    };
    wrapped.status = (code: number) => {
        statusCode = code;
        res.statusCode = code;
        return {
            json: (payload: unknown) => {
                if (!res.headersSent) {
                    sendJson(res, statusCode, payload);
                }
            },
        };
    };
    wrapped.json = (payload: unknown) => {
        if (!res.headersSent) {
            sendJson(res, statusCode, payload);
        }
    };
    return wrapped;
}

export type RoditLoginRouteHandlers = {
    handleLoginTimestamp: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
    handleLogin: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
};

export type CreateRoditLoginRouteHandlersOptions = {
    audit?: A2AAuditLogger;
    logger?: A2AHostLogger;
};

export function createRoditLoginRouteHandlers(
    config: A2AInboundRoditLoginConfig,
    options: CreateRoditLoginRouteHandlersOptions = {},
): RoditLoginRouteHandlers {
    applyRoditLoginMode(config);
    const audit = options.audit;
    const logger = options.logger;

    return {
        async handleLoginTimestamp(req, res) {
            const requestId = createRequestId();
            res.setHeader("X-Request-Id", requestId);
            if (req.method !== "GET") {
                res.setHeader("Allow", "GET");
                sendRestError(res, 405, {
                    code: "METHOD_NOT_ALLOWED",
                    message: "Method Not Allowed",
                    requestId,
                });
                return;
            }
            const timestamp = Math.floor(Date.now() / 1000);
            sendJson(res, 200, {
                timestamp,
                timestamp_iso: new Date(timestamp * 1000).toISOString(),
            });
        },

        async handleLogin(req, res) {
            const started = Date.now();
            const requestId = createRequestId();
            res.setHeader("X-Request-Id", requestId);
            if (req.method !== "POST") {
                res.setHeader("Allow", "POST");
                sendRestError(res, 405, {
                    code: "METHOD_NOT_ALLOWED",
                    message: "Method Not Allowed",
                    requestId,
                });
                return;
            }

            const bodyResult = await readJsonBody(req);
            if (!bodyResult.ok) {
                sendRestError(res, 400, {
                    code: "INVALID_JSON",
                    message: bodyResult.error,
                    requestId,
                });
                audit?.log({
                    eventType: "login_failure",
                    direction: "inbound",
                    status: "failure",
                    durationMs: Date.now() - started,
                    error: { code: "INVALID_JSON", message: bodyResult.error },
                    metadata: { request_id: requestId },
                });
                return;
            }

            const peer = extractSafeLoginPeer(bodyResult.body);
            try {
                const client = await getRoditClient();
                const expressReq = attachParsedBody(req, bodyResult.body);
                if (!expressReq.socket?.remoteAddress && !("ip" in expressReq)) {
                    Object.assign(expressReq, { ip: "" });
                }
                await client.login_client(expressReq, wrapExpressLikeResponse(res));
                const ok = res.statusCode < 400;
                audit?.log({
                    eventType: ok ? "login_success" : "login_failure",
                    direction: "inbound",
                    status: ok ? "success" : "failure",
                    sourceAgent: peer,
                    durationMs: Date.now() - started,
                    metadata: { http_status: res.statusCode, request_id: requestId },
                    ...(ok
                        ? {}
                        : {
                              error: {
                                  code: "RODIT_LOGIN_REJECTED",
                                  message: `login response status ${res.statusCode}`,
                              },
                          }),
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                logger?.error("RODiT login failed", {
                    requestId,
                    operation: "inbound.login",
                    error: toLogError(error),
                });
                if (!res.headersSent) {
                    sendRestError(res, 500, {
                        code: "RODIT_LOGIN_ERROR",
                        message,
                        requestId,
                    });
                }
                audit?.log({
                    eventType: "login_failure",
                    direction: "inbound",
                    status: "failure",
                    sourceAgent: peer,
                    durationMs: Date.now() - started,
                    error: { code: "RODIT_LOGIN_ERROR", message },
                    metadata: { request_id: requestId },
                });
            }
        },
    };
}

/** Reset cached client (tests only). */
export function resetRoditLoginRouteClientForTests(): void {
    roditClientPromise = null;
}
