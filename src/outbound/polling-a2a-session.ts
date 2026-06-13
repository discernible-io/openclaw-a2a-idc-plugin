// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import type { AgentCard, Task } from "@a2a-js/sdk";
import type { A2AClient } from "@a2a-js/sdk/client";
import { A2ASession } from "@a2anet/a2a-utils";

/** Delays (ms) before retrying tasks/get after a transient HTTP 400. */
const FETCH_TASK_RETRY_DELAYS_MS = [250, 500, 1000];

function isTransientTasksGetHttp400(err: unknown): boolean {
    if (!(err instanceof Error)) {
        return false;
    }
    const message = err.message.toLowerCase();
    return message.includes("tasks/get") && message.includes("400");
}

/**
 * Patch an A2ASession to poll tasks/get instead of SSE tasks/resubscribe.
 *
 * a2a-utils prefers SSE when the peer Agent Card advertises streaming. On
 * OpenClaw/nginx ingress, tasks/get immediately after tasks/resubscribe returns
 * HTTP 400 (empty body), so send_message fails with no task_id even though
 * message/send created the task.
 */
export function patchSessionForPollingMonitor(session: A2ASession): A2ASession {
    const internal = session as unknown as {
        getTaskStreaming: (
            agentCard: AgentCard,
            headers: Record<string, string>,
            taskId: string,
            timeout: number,
        ) => Promise<Task>;
        getTaskPolling: (
            agentCard: AgentCard,
            headers: Record<string, string>,
            taskId: string,
            timeout: number,
            pollInterval: number,
        ) => Promise<Task>;
        fetchTask: (client: A2AClient, taskId: string, timeout?: number) => Promise<Task>;
        getTaskPollInterval: number;
    };
    const pollInterval = internal.getTaskPollInterval;

    internal.getTaskStreaming = (agentCard, headers, taskId, timeout) =>
        internal.getTaskPolling(agentCard, headers, taskId, timeout, pollInterval);

    const fetchTask = internal.fetchTask.bind(internal);
    internal.fetchTask = async (client, taskId, timeout) => {
        let lastError: unknown;
        for (let attempt = 0; attempt <= FETCH_TASK_RETRY_DELAYS_MS.length; attempt++) {
            if (attempt > 0) {
                await new Promise((resolve) =>
                    setTimeout(resolve, FETCH_TASK_RETRY_DELAYS_MS[attempt - 1]),
                );
            }
            try {
                return await fetchTask(client, taskId, timeout);
            } catch (err) {
                lastError = err;
                if (!isTransientTasksGetHttp400(err)) {
                    throw err;
                }
            }
        }
        throw lastError;
    };

    return session;
}

/**
 * Create an A2ASession with polling-based task monitoring (no SSE resubscribe).
 */
export function createPollingA2ASession(
    ...args: ConstructorParameters<typeof A2ASession>
): A2ASession {
    return patchSessionForPollingMonitor(new A2ASession(...args));
}
