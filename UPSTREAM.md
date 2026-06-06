# Upstream tracking

This repository is a fork of [`@a2anet/openclaw-a2a-plugin`](https://github.com/a2anet/openclaw-a2a-plugin).

## Pinned upstream commit

| Field | Value |
|-------|-------|
| Repository | https://github.com/a2anet/openclaw-a2a-plugin |
| Fork | https://github.com/discernible-io/openclaw-a2a-idc-plugin |
| Branch | `main` |
| Commit | `e7e1d8a45fa696e977ab78aee7c133dcd54c7657` |
| Upstream release | `0.2.0` |
| Fork date | 2026-06-06 |

## Modifications

IdentyClaw maintains this fork to add RODiT / Passport JWT authentication for A2A peer agents. See [`a2afork.md`](a2afork.md) for the work plan.

Until Phase 1 lands, runtime behavior matches upstream (API key auth only). `@rodit/rodit-auth-be` is present as a dependency for upcoming auth work.

## Merge policy

1. **Prefer upstream for bug fixes** that do not conflict with RODiT auth changes.
2. **Cherry-pick or merge upstream `main`** periodically; update the pinned commit table above after each sync.
3. **Keep fork-only code isolated** under `src/auth/` and config extensions where possible.
4. **Run the full test suite** (`bun run check`, `bun run typecheck`, `bun test`, `bun run build`) before and after upstream merges.
5. **Document upstream syncs** in commit messages (include upstream SHA) and bump the pin in this file.
6. **Long-term goal:** upstream a pluggable `inbound.auth.provider` interface to reduce drift (see Phase 7 in `a2afork.md`).

## License

Apache 2.0 — retain upstream [`LICENSE`](LICENSE) and document modifications here and in release notes.
