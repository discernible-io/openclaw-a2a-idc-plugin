// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import type { IncomingMessage, ServerResponse } from "node:http";

import type { A2AInboundRoditLoginConfig } from "../config.js";
import { applyRoditEmbedEnv } from "../auth/rodit-embed-env.js";
import { loadRoditAuthBe } from "../auth/rodit-runtime.js";

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

export function createRoditLoginRouteHandlers(
    config: A2AInboundRoditLoginConfig,
): RoditLoginRouteHandlers {
    applyRoditLoginMode(config);

    return {
        async handleLoginTimestamp(_req, res) {
            const timestamp = Math.floor(Date.now() / 1000);
            sendJson(res, 200, {
                timestamp,
                timestamp_iso: new Date(timestamp * 1000).toISOString(),
            });
        },

        async handleLogin(req, res) {
            if (req.method !== "POST") {
                res.setHeader("Allow", "POST");
                res.statusCode = 405;
                res.end("Method Not Allowed");
                return;
            }

            const bodyResult = await readJsonBody(req);
            if (!bodyResult.ok) {
                sendJson(res, 400, {
                    error: { code: "INVALID_JSON", message: bodyResult.error },
                });
                return;
            }

            try {
                const client = await getRoditClient();
                const expressReq = attachParsedBody(req, bodyResult.body);
                if (!expressReq.socket?.remoteAddress && !("ip" in expressReq)) {
                    Object.assign(expressReq, { ip: "" });
                }
                await client.login_client(expressReq, wrapExpressLikeResponse(res));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (!res.headersSent) {
                    sendJson(res, 500, {
                        error: { code: "RODIT_LOGIN_ERROR", message },
                    });
                }
            }
        },
    };
}

/** Reset cached client (tests only). */
export function resetRoditLoginRouteClientForTests(): void {
    roditClientPromise = null;
}
