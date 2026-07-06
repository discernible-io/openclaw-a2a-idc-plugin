// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import type {
    DeleteTaskPushNotificationConfigParams,
    GetTaskPushNotificationConfigParams,
    ListTaskPushNotificationConfigParams,
    Message,
    MessageSendParams,
    Task,
    TaskArtifactUpdateEvent,
    TaskIdParams,
    TaskPushNotificationConfig,
    TaskQueryParams,
    TaskStatusUpdateEvent,
} from "@a2a-js/sdk";
import type {
    A2ARequestHandler,
    DefaultRequestHandler,
    ServerCallContext,
} from "@a2a-js/sdk/server";

/**
 * Work around `@a2a-js/sdk` clearing `task.history` when `historyLength` is omitted.
 * Clients such as IdentyClaw's messaging E2E call `tasks/get` with only `{ id }` and
 * expect the sent user message to appear in history.
 */
export class OpenClawA2ARequestHandler implements A2ARequestHandler {
    constructor(private readonly delegate: DefaultRequestHandler) {}

    getAgentCard(): Promise<import("@a2a-js/sdk").AgentCard> {
        return this.delegate.getAgentCard();
    }

    getAuthenticatedExtendedAgentCard(
        context?: ServerCallContext,
    ): Promise<import("@a2a-js/sdk").AgentCard> {
        return this.delegate.getAuthenticatedExtendedAgentCard(context);
    }

    sendMessage(params: MessageSendParams, context?: ServerCallContext): Promise<Message | Task> {
        return this.delegate.sendMessage(params, context);
    }

    sendMessageStream(
        params: MessageSendParams,
        context?: ServerCallContext,
    ): AsyncGenerator<
        Message | Task | TaskStatusUpdateEvent | TaskArtifactUpdateEvent,
        void,
        undefined
    > {
        return this.delegate.sendMessageStream(params, context);
    }

    async getTask(params: TaskQueryParams, context?: ServerCallContext): Promise<Task> {
        const historyLength =
            params.historyLength !== undefined ? params.historyLength : Number.MAX_SAFE_INTEGER;
        return this.delegate.getTask({ ...params, historyLength }, context);
    }

    cancelTask(params: TaskIdParams, context?: ServerCallContext): Promise<Task> {
        return this.delegate.cancelTask(params, context);
    }

    setTaskPushNotificationConfig(
        params: TaskPushNotificationConfig,
        context?: ServerCallContext,
    ): Promise<TaskPushNotificationConfig> {
        return this.delegate.setTaskPushNotificationConfig(params, context);
    }

    getTaskPushNotificationConfig(
        params: TaskIdParams | GetTaskPushNotificationConfigParams,
        context?: ServerCallContext,
    ): Promise<TaskPushNotificationConfig> {
        return this.delegate.getTaskPushNotificationConfig(params, context);
    }

    listTaskPushNotificationConfigs(
        params: ListTaskPushNotificationConfigParams,
        context?: ServerCallContext,
    ): Promise<TaskPushNotificationConfig[]> {
        return this.delegate.listTaskPushNotificationConfigs(params, context);
    }

    deleteTaskPushNotificationConfig(
        params: DeleteTaskPushNotificationConfigParams,
        context?: ServerCallContext,
    ): Promise<void> {
        return this.delegate.deleteTaskPushNotificationConfig(params, context);
    }

    resubscribe(
        params: TaskIdParams,
        context?: ServerCallContext,
    ): AsyncGenerator<Task | TaskStatusUpdateEvent | TaskArtifactUpdateEvent, void, undefined> {
        return this.delegate.resubscribe(params, context);
    }
}
