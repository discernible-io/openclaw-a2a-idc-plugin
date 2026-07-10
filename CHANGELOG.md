# Changelog

## Unreleased

## 0.4.7 — 2026-07-10

- Resolve inbound Agent Card fields dynamically from `RoditClient.getConfigOwnRodit()` and IdentyClaw `GET /api/identity/token/{tokenId}/full` (name, `extensions.identyclaw`, contact URIs).
- Treat Passport metadata as authoritative over `inbound.agentCard` and `a2a_update_agent_card` for overlapping fields via `mergeA2AAgentCardConfig`.
- Use Passport `metadata.webhook_url` as the canonical public ingress base for A2A discovery (`/a2a`, `/.well-known/agent-card.json`); warn when it differs from `inbound.publicBaseUrl`.


- Simplify outbound peer identity for LLM tools: Passport peers expose and accept `token_id` only (no redundant `agent_id`); legacy config aliases without a Passport token keep `agent_id`.
- Rename peer-targeting outbound tool schemas from `agentId` to `token_id`; map `token_id` / `tokenId` inputs to the internal registry key before calling a2a-utils.
- Enrich `a2a_get_agents` / `a2a_get_agent` responses with explicit peer identifiers so Agent Card `name` is not mistaken for an addressable ID.
- Resolve unknown Passport `token_id` peers on `a2a_get_agent` (same as the send path).

## 0.4.5 — 2026-07-09

- Support richer inbound Agent Cards: configurable `version`, `defaultInputModes`, `defaultOutputModes`, and `extensions.identyclaw` (registry, passport, verify URLs, channels, contact URIs).
- Default card MIME modes are now `text/plain`; per-skill `inputModes` / `outputModes` are emitted only when set in config.
- Extend `a2a_update_agent_card` to persist the new card fields at runtime.

## 0.4.4 — 2026-07-06

- Emit a default `skills[]` entry (`id` + `name`) on Agent Card discovery when inbound `agentCard.skills` is unset, per A2A v0.3.
- Persist the inbound user message to task storage as soon as `message/send` execution starts so `tasks/get` can return sent text in `history`.
- Return full task history from `tasks/get` when `historyLength` is omitted (work around `@a2a-js/sdk` stripping history).

## 0.4.3 — 2026-07-03

- Bump `@rodit/rodit-auth-be` to `9.12.0`.

## 0.4.2 — 2026-06-24

- Wire `TokenPeerResolver` to try IdentyClaw `GET /api/identity/token/{id}/full` first (`metadata.webhook_url`), then fall back to on-chain `nearorg_rpc_tokenfromroditid` when the API is unavailable or has no webhook.
- Add `extractWebhookUrlFromIdentity()` in `gateway-url.ts`; optional `fetchIdentityFullFn` for tests; record `source: "api" | "chain"` in persisted `peers.json`.

## 0.4.1 — 2026-06-23

- Fix `TokenPeerResolver` peer discovery: resolve unknown `token_id` values via on-chain `metadata.webhook_url` (`nearorg_rpc_tokenfromroditid`) instead of IdentyClaw `dn.contactUri` (which is identity contact metadata, not the A2A ingress URL).
- Add `src/auth/rodit-peer-by-token-id.ts` and `src/auth/gateway-url.ts`; update `README.md` and `a2afork.md` for `webhook_url` as the discovery field.

## 0.4.0 — 2026-06-23

- Resolve unknown outbound peers by Passport `token_id` on the send path: fetch `GET /api/identity/token/{tokenId}/full` with an IdentyClaw API JWT (NEAR creds), parse `dn.contactUri` into an Agent Card URL, register in memory (optional persist to `stateDir/a2a/outbound/peers.json`), then proceed with normal P2P JWT login and A2A messaging.
- Add `outbound.resolvePeersByTokenId`, `outbound.persistResolvedPeers`, and `outbound.identityApiBaseUrl` config options; enable send-by-`token_id` with RODiT outbound auth even when `outbound.agents` is empty.

## 0.3.0 — 2026-06-23

### Breaking

- **Remove mediated and dual RODiT auth modes.** Outbound auth always uses P2P peer-issued JWTs (per-peer cache, audience-bound to the receiver). Inbound auth accepts only P2P-issued tokens (`aud` = own passport `owner_id`). `outbound.auth.mode`, `inbound.auth.mode`, `credentialsEnv`, `p2pAudience`, and `p2pIssuer` are removed; legacy values log config warnings. `roditLogin` routes auto-enable when `inbound.auth.provider` is `rodit` (set `roditLogin.enabled: false` to disable).
- Update `README.md`, `docs/jwt-audience-alignment.md`, and `a2afork.md` for P2P-only auth and `owner_id` audience probing.

## 0.2.6 — 2026-06-13

- Fix `a2a_send_message` failing after peer task creation: avoid SSE `tasks/resubscribe` followed by immediate `tasks/get` (HTTP 400 on OpenClaw/nginx ingress). Outbound monitoring now polls `tasks/get` instead.
- Retry transient `tasks/get` HTTP 400 responses with short backoff.
- Return `task_id` / `context_id` aliases in tool results (alongside `id` / `contextId`).
- Strip whitespace-only optional tool params (`taskId`, `contextId`, etc.).
- Read JSON-RPC request body before inbound auth to avoid request stream races.

## 0.2.5 — 2026-06-12

- Republish to ClawHub (same `a2a_send_message` empty `taskId` fix as 0.2.4, aligned with git release commit).

## 0.2.4 — 2026-06-12

- Fix `a2a_send_message` failing with `Invalid task id: ''` when models pass empty strings for optional `taskId` / `contextId` fields.
- Sanitize OpenAI-target tool schemas so nullable optional fields are not marked required.
- Normalize tool params: strip empty strings/null and map snake_case keys to camelCase before calling a2a-utils.

## 0.2.3 — 2026-06-12

- ClawHub publish: `prepare:publish`, `publish:clawhub`, pack verification, and `PUBLISH.md` (pattern from `openclaw-identyclaw-plugin`).
- Package rename to `@identyclaw/openclaw-a2a-plugin` for npm and ClawHub (`clawhub:@identyclaw/openclaw-a2a-plugin`).
- ClawHub plugin id `identyclaw-a2a` (upstream `@a2anet/openclaw-a2a-plugin` claims runtime id `a2a` on the registry).
- RODiT / Passport JWT authentication for A2A peers (mediated, P2P, and dual inbound modes).

## [0.2.0](https://github.com/a2anet/openclaw-a2a-plugin/compare/openclaw-a2a-plugin-v0.1.4...openclaw-a2a-plugin-v0.2.0) (2026-05-25)


### Features

* host multi-agent inbound endpoints and add nightly e2e suite ([c534e3d](https://github.com/a2anet/openclaw-a2a-plugin/commit/c534e3d09b2c89f0c66cba336c2a59e24ee80e7f))

## [0.1.4](https://github.com/a2anet/openclaw-a2a-plugin/compare/openclaw-a2a-plugin-v0.1.3...openclaw-a2a-plugin-v0.1.4) (2026-05-20)


### Bug Fixes

* expose A2A tools to Codex via `contracts.tools` and `tool-discovery` registration ([7f9db67](https://github.com/a2anet/openclaw-a2a-plugin/commit/7f9db670acf00fe05d8780dd518c052b2e7e54a2))

## [0.1.3](https://github.com/a2anet/openclaw-a2a-plugin/compare/openclaw-a2a-plugin-v0.1.2...openclaw-a2a-plugin-v0.1.3) (2026-05-08)


### Bug Fixes

* add "📺 Demo" section to `README.md` with YouTube video ([0a36400](https://github.com/a2anet/openclaw-a2a-plugin/commit/0a36400a098676c38318ce0df373a181bb2db033))
* guard `register()` against non-full OpenClaw registration modes ([e0fcf87](https://github.com/a2anet/openclaw-a2a-plugin/commit/e0fcf878351b190a12e29c8ac1621087ece1e0c2))

## [0.1.2](https://github.com/a2anet/openclaw-a2a-plugin/compare/openclaw-a2a-plugin-v0.1.1...openclaw-a2a-plugin-v0.1.2) (2026-04-27)


### Bug Fixes

* update `README.md` introduction ([d9daad5](https://github.com/a2anet/openclaw-a2a-plugin/commit/d9daad52c86640bab38ec5be1e3272c94bd1d809))
* update `README.md` introduction ([8e0a7a4](https://github.com/a2anet/openclaw-a2a-plugin/commit/8e0a7a4f0a5a07b2d70ee83b2cb21090d701fd9d))

## [0.1.1](https://github.com/a2anet/openclaw-a2a-plugin/compare/openclaw-a2a-plugin-v0.1.0...openclaw-a2a-plugin-v0.1.1) (2026-04-16)


### Bug Fixes

* update to latest version of `@a2anet/a2a-utils` ([2a3a706](https://github.com/a2anet/openclaw-a2a-plugin/commit/2a3a7068dfe8b93864e739ca2d0577807cd0c7cb))
