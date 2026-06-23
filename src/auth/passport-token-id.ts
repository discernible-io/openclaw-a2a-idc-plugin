// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

/** Passport token_id: 12 alphanumeric chars starting with a letter. */
export function isPassportTokenId(value: string): boolean {
    return /^[A-Za-z][A-Za-z0-9]{11}$/.test(String(value ?? "").trim());
}

export function normalizePassportTokenId(value: string): string {
    return String(value ?? "").trim().toLowerCase();
}
