// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

export const A2A_LOG_COMPONENT = "A2A";

export type A2ALogError = {
    name?: string;
    message: string;
    code?: string;
};

export type A2ALogContext = {
    requestId?: string;
    operation?: string;
    error?: A2ALogError;
    [key: string]: unknown;
};

export type A2AHostLogger = {
    info: (message: string, context?: A2ALogContext) => void;
    warn: (message: string, context?: A2ALogContext) => void;
    error: (message: string, context?: A2ALogContext) => void;
};

export function createRequestId(): string {
    return crypto.randomUUID();
}

export function toLogError(err: unknown): A2ALogError {
    if (err instanceof Error) {
        return { name: err.name, message: err.message };
    }
    return { message: String(err) };
}

export function formatA2ALog(message: string, context: A2ALogContext = {}): string {
    return `${message} ${JSON.stringify({ component: A2A_LOG_COMPONENT, ...context })}`;
}

export function createA2AHostLogger(logger: {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
}): A2AHostLogger {
    return {
        info: (message, context) => logger.info(formatA2ALog(message, context)),
        warn: (message, context) => logger.warn(formatA2ALog(message, context)),
        error: (message, context) => logger.error(formatA2ALog(message, context)),
    };
}
