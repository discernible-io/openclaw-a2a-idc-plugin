# Changelog

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
