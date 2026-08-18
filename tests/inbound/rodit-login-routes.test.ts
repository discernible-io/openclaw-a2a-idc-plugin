// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

import { createRoditLoginRouteHandlers } from "../../src/inbound/rodit-login-routes.js";

function makeReq(method: string, body?: string): IncomingMessage {
    const req = Readable.from([body ?? ""]) as IncomingMessage;
    req.method = method;
    req.headers = {};
    return req;
}

function makeRes() {
    let statusCode = 200;
    const headers: Record<string, string> = {};
    const chunks: string[] = [];
    const res = {
        get statusCode() {
            return statusCode;
        },
        set statusCode(code: number) {
            statusCode = code;
        },
        setHeader(name: string, value: string) {
            headers[name] = value;
        },
        end(data?: string) {
            if (data) {
                chunks.push(data);
            }
        },
        getHeaders: () => headers,
        getJson: () => JSON.parse(chunks.join("")),
    } as unknown as ServerResponse & {
        getHeaders: () => Record<string, string>;
        getJson: () => {
            error?: { code?: string; message?: string };
            requestId?: string;
            timestamp?: string;
        };
    };
    return res;
}

describe("RODiT login routes", () => {
    test("POST /api/login invalid JSON includes requestId and timestamp", async () => {
        const handlers = createRoditLoginRouteHandlers({});
        const res = makeRes();
        await handlers.handleLogin(makeReq("POST", "{not-json"), res);
        expect(res.statusCode).toBe(400);
        const body = res.getJson();
        expect(body.error?.code).toBe("INVALID_JSON");
        expect(typeof body.requestId).toBe("string");
        expect(body.requestId?.length).toBeGreaterThan(0);
        expect(typeof body.timestamp).toBe("string");
        expect(Number.isNaN(Date.parse(body.timestamp ?? ""))).toBe(false);
        expect(res.getHeaders()["X-Request-Id"]).toBe(body.requestId);
    });

    test("non-POST login returns JSON 405 with requestId and timestamp", async () => {
        const handlers = createRoditLoginRouteHandlers({});
        const res = makeRes();
        await handlers.handleLogin(makeReq("GET"), res);
        expect(res.statusCode).toBe(405);
        const body = res.getJson();
        expect(body.error?.code).toBe("METHOD_NOT_ALLOWED");
        expect(body.requestId).toBeTruthy();
        expect(body.timestamp).toBeTruthy();
    });
});
