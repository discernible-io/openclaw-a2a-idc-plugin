# Upstream tracking

This repository is a fork of [`@a2anet/openclaw-a2a-plugin`](https://github.com/a2anet/openclaw-a2a-plugin).

## Pinned upstream commit

| Field | Value |
|-------|-------|
| Repository | https://github.com/a2anet/openclaw-a2a-plugin |
| Fork | https://github.com/discernible-io/openclaw-identyclaw-a2a-plugin |
| Branch | `main` |
| Commit | `e7e1d8a45fa696e977ab78aee7c133dcd54c7657` |
| Upstream release | `0.2.0` |
| Fork date | 2026-06-06 |

## Modifications

IdentyClaw maintains this fork to add **RODiT / Passport JWT** authentication for A2A peer agents (`inbound.auth.provider: "rodit"`, outbound P2P `login_server`). Current fork-only behavior includes:

- Inbound JWT validation and `/api/login*` peer login routes
- Outbound per-peer JWT cache and 401 retry
- Passport `token_id` peer resolution (`GET /full`, then on-chain `metadata.webhook_url`)
- Structured A2A audit logs (`audit.enabled`)

See [`README.md`](README.md) for the current config surface and [`a2afork.md`](a2afork.md) for the remaining rollout plan.

## Merge policy

1. **Prefer upstream for bug fixes** that do not conflict with RODiT auth changes.
2. **Cherry-pick or merge upstream `main`** periodically; update the pinned commit table above after each sync.
3. **Keep fork-only code isolated** under `src/auth/` and config extensions where possible.
4. **Run the full test suite** (`bun run check`, `bun run typecheck`, `bun test`, `bun run build`) before and after upstream merges.
5. **Document upstream syncs** in commit messages (include upstream SHA) and bump the pin in this file.
6. **Long-term goal:** upstream a pluggable `inbound.auth.provider` interface to reduce drift (see Phase 7 in `a2afork.md`).

## License

Apache 2.0 — retain upstream [`LICENSE`](LICENSE) and document modifications here and in release notes.
