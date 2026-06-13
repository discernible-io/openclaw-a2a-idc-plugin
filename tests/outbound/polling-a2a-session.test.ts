// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import type { AgentCard } from "@a2a-js/sdk";
import { A2AClient } from "@a2a-js/sdk/client";
import { A2ASession } from "@a2anet/a2a-utils";

import { patchSessionForPollingMonitor } from "../../src/outbound/polling-a2a-session.js";

describe("patchSessionForPollingMonitor", () => {
    test("getTaskStreaming delegates to getTaskPolling", async () => {
        const session = patchSessionForPollingMonitor(
            new A2ASession({ getAgent: async () => null } as never),
        );
        const internal = session as A2ASession & {
            getTaskPolling: (
                agentCard: AgentCard,
                headers: Record<string, string>,
                taskId: string,
                timeout: number,
                pollInterval: number,
            ) => Promise<{ id: string }>;
        };
        const polled = { id: "task-1" };
        internal.getTaskPolling = async () => polled;

        const card = {
            capabilities: { streaming: true },
        } as AgentCard;

        await expect(
            internal.getTaskStreaming(card, {}, "task-1", 30),
        ).resolves.toBe(polled);
    });

    test("fetchTask retries transient HTTP 400 from tasks/get", async () => {
        const session = patchSessionForPollingMonitor(
            new A2ASession({ getAgent: async () => null } as never),
        );
        const internal = session as A2ASession & {
            fetchTask: (
                client: A2AClient,
                taskId: string,
                timeout?: number,
            ) => Promise<{ id: string }>;
            getSessionClient: (client: A2AClient) => {
                getTask: () => Promise<{ result: { id: string; status: { state: string } } }>;
            };
        };
        const client = {} as A2AClient;
        let attempts = 0;

        internal.getSessionClient = (() => ({
            getTask: async () => {
                attempts += 1;
                if (attempts < 3) {
                    throw new Error(
                        "HTTP error for tasks/get! Status: 400 Bad Request. Response: ",
                    );
                }
                return {
                    result: { id: "task-1", status: { state: "completed" } },
                };
            },
        })) as typeof internal.getSessionClient;

        const task = await internal.fetchTask(client, "task-1", 30);
        expect(task.id).toBe("task-1");
        expect(attempts).toBe(3);
    });
});
