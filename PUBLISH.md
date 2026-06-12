# ClawHub publish checklist

Maintainer guide for publishing **@identyclaw/openclaw-a2a-plugin** to ClawHub.

| Artifact | Command | ClawHub install |
| --- | --- | --- |
| Code plugin | `npm run publish:clawhub` | `openclaw plugins install clawhub:@identyclaw/openclaw-a2a-plugin` |

This is **ClawHub registry login** — unrelated to IdentyClaw API login or RODiT Passport auth. See [README.md](./README.md) for A2A peer authentication.

## Pre-flight

From the repository root, Node **≥ 22.19** (`.nvmrc`):

```bash
npm install
npm run prepare:publish
bun test
```

## ClawHub credentials

```bash
npx clawhub whoami   # must show access to publisher @identyclaw
```

### ClawHub CLI login

**Device flow (remote / headless):**

```bash
npx clawhub login --device
```

**API token:**

```bash
npx clawhub login --no-browser --token clh_<your-token>
```

See [ClawHub troubleshooting](https://docs.openclaw.ai/clawhub/troubleshooting#clawhub-login-opens-a-browser-but-never-completes).

### Publisher org (once)

```bash
npx clawhub publisher create identyclaw --display-name "IdentyClaw"
```

## Dry run

```bash
npm run publish:clawhub:dry-run
```

Expected: family `code-plugin`, version from `package.json`, files `dist/index.js`, `openclaw.plugin.json`, `package.json`, `README.md`, `LICENSE`.

`prepare:publish` compiles TypeScript and runs `scripts/verify-pack.mjs` to ensure the npm pack tarball includes required plugin files and that `openclaw.plugin.json` version matches `package.json`.

## Publish

```bash
npm run publish:clawhub
```

Install after registry review:

```bash
openclaw plugins install clawhub:@identyclaw/openclaw-a2a-plugin
```

## Post-publish

1. `npx clawhub package inspect @identyclaw/openclaw-a2a-plugin`
2. `git tag openclaw-a2a-plugin-v<version>`
3. Runtime test on a Gateway: outbound RODiT JWT login, inbound JWT verification, `a2a_send_message` round-trip
4. Security scan may show **pending** until review completes

## License

[Apache-2.0](./LICENSE). `package.json` must declare `"license": "Apache-2.0"`.
