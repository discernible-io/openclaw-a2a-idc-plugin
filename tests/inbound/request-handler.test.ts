// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, mock, test } from "bun:test";
import type { Task, TaskQueryParams } from "@a2a-js/sdk";
import type { DefaultRequestHandler, ServerCallContext } from "@a2a-js/sdk/server";

import { OpenClawA2ARequestHandler } from "../../src/inbound/request-handler.js";

function makeDelegate() {
    return {
        getAgentCard: mock(async () => ({})),
        getAuthenticatedExtendedAgentCard: mock(async () => ({})),
        sendMessage: mock(async () => ({})),
        sendMessageStream: mock(async function* () {}),
        getTask: mock(async (_params: TaskQueryParams) => ({ id: "task-1", history: [] }) as Task),
        cancelTask: mock(async () => ({})),
        setTaskPushNotificationConfig: mock(async () => ({})),
        getTaskPushNotificationConfig: mock(async () => ({})),
        listTaskPushNotificationConfigs: mock(async () => []),
        deleteTaskPushNotificationConfig: mock(async () => undefined),
        resubscribe: mock(async function* () {}),
    } as unknown as DefaultRequestHandler;
}

describe("OpenClawA2ARequestHandler", () => {
    test("getTask requests full history when historyLength is omitted", async () => {
        const delegate = makeDelegate();
        const handler = new OpenClawA2ARequestHandler(delegate);

        await handler.getTask({ id: "task-1" });

        expect(delegate.getTask).toHaveBeenCalledTimes(1);
        const params = (delegate.getTask as ReturnType<typeof mock>).mock.calls[0]?.[0] as
            | TaskQueryParams
            | undefined;
        expect(params?.id).toBe("task-1");
        expect(params?.historyLength).toBe(Number.MAX_SAFE_INTEGER);
    });

    test("getTask preserves an explicit historyLength", async () => {
        const delegate = makeDelegate();
        const handler = new OpenClawA2ARequestHandler(delegate);

        await handler.getTask({ id: "task-1", historyLength: 3 });

        const params = (delegate.getTask as ReturnType<typeof mock>).mock.calls[0]?.[0] as
            | TaskQueryParams
            | undefined;
        expect(params?.historyLength).toBe(3);
    });

    test("getTask forwards server call context", async () => {
        const delegate = makeDelegate();
        const handler = new OpenClawA2ARequestHandler(delegate);
        const context = {} as ServerCallContext;

        await handler.getTask({ id: "task-1" }, context);

        expect((delegate.getTask as ReturnType<typeof mock>).mock.calls[0]?.[1]).toBe(context);
    });
});
