# Test install instructions (two separate machines)

Use this guide to install the IdentyClaw A2A plugin fork on **existing OpenClaw / identyclaw agents** and run pre-publication smoke tests when agents run on **two separate hosts**.

Same-host shortcuts (`identyclaw-net`, container DNS, `./identyclaw.sh test-a2a`) are for local dev only — they do not satisfy the publication gate for split-machine deploys. See [`a2afork.md`](a2afork.md) for the full work plan and tier definitions.

Related docs:

- [`README.md`](README.md) — plugin config reference
- [`docs/jwt-audience-alignment.md`](docs/jwt-audience-alignment.md) — `inbound.auth.audience` vs JWT `aud`
- [`a2afork.md`](a2afork.md) — Phase 5–7 multi-machine deploy and publication checklist

---

## Topology

Each machine runs one identyclaw instance with one agent. Peers reach each other over **public HTTPS**, not container DNS.

```text
Host A (agent-a)                    Host B (agent-b)
─────────────────                   ─────────────────
identyclaw + one agent              identyclaw + one agent
Passport credentials                Passport credentials
https://agent-a.example.com         https://agent-b.example.com
         │                                    │
         └──────── outbound HTTPS ────────────┘
```

| Concern | Host A | Host B |
| ------- | ------ | ------ |
| Plugin install | Local path or git URL | Same |
| Passport creds | This host only | This host only |
| `inbound.publicBaseUrl` | `https://agent-a.example.com` | `https://agent-b.example.com` |
| `inbound.auth.audience` | Own passport `owner_id` (JWT `aud`) | Own passport `owner_id` (JWT `aud`) |
| `outbound.agents` | Remote URL → agent-b | Remote URL → agent-a |

---

## Step 1 — Install the dev plugin on both hosts

Do **not** use the published npm package while iterating on the fork. Install from a local checkout or pinned git URL on **each** machine.

### From a local checkout

```bash
# In the plugin repo
make install
bun run build

# On each agent host (or inside the agent container)
openclaw plugins install /absolute/path/to/openclaw-a2a-plugin
openclaw gateway restart
```

After code changes: rebuild, reinstall (or restart the gateway if your OpenClaw setup reloads the plugin path).

### From git (pinned)

```bash
openclaw plugins install github:discernible-io/openclaw-identyclaw-a2a-plugin --pin
openclaw gateway restart
```

Identyclaw can install on bootstrap via `ensure_a2a_packages()` when `A2A_PLUGIN_SPEC` points at the git URL.

---

## Step 2 — Public URLs and TLS (each host)

Each agent needs a hostname that the **other** host can reach over HTTPS.

**Host A** (`env.local` or equivalent):

```bash
AGENT_A_A2A_PUBLIC_BASE_URL=https://agent-a.example.com
```

**Host B:**

```bash
AGENT_B_A2A_PUBLIC_BASE_URL=https://agent-b.example.com
```

Reverse proxy must pass through these paths unchanged:

| Path | Purpose |
| ---- | ------- |
| `/a2a` | A2A JSON-RPC |
| `/.well-known/agent-card.json` | Agent Card discovery |
| `/hooks/*` | Existing OpenClaw hooks |

The gateway Control UI can stay bound to `127.0.0.1` on the host. Only the public ingress (typically port 443) must be reachable for peer A2A traffic.

Verify discovery from either host:

```bash
curl -sf https://agent-a.example.com/.well-known/agent-card.json
curl -sf https://agent-b.example.com/.well-known/agent-card.json
```

---

## Step 3 — Configure each agent (cross-host peers)

`ensure_a2a_config()` in identyclaw auto-wires **container DNS** peer URLs only when multiple agents share **one** host. On split machines, set **remote HTTPS** Agent Card URLs in `outbound.agents` on each host.

### Host A — `openclaw.json`

```json
{
  "plugins": {
    "entries": {
      "identyclaw-a2a": {
        "enabled": true,
        "config": {
          "inbound": {
            "publicBaseUrl": "https://agent-a.example.com",
            "auth": {
              "provider": "rodit",
              "issuer": "https://api.identyclaw.com",
              "audience": "<own passport owner_id>",
              "identityClaim": "token_id"
            },
            "agentCard": {
              "name": "Agent A",
              "description": "IdentyClaw agent on host A"
            }
          },
          "outbound": {
            "auth": {
              "provider": "rodit",
              "jwtCacheTtlSeconds": 300
            },
            "agents": {
              "agent-b": {
                "url": "https://agent-b.example.com/.well-known/agent-card.json"
              }
            }
          }
        }
      }
    }
  }
}
```

### Host B — mirror with swapped URLs

```json
"inbound": {
  "publicBaseUrl": "https://agent-b.example.com",
  "auth": {
    "provider": "rodit",
    "issuer": "https://api.identyclaw.com",
    "audience": "<own passport owner_id>",
    "identityClaim": "token_id"
  },
  "agentCard": {
    "name": "Agent B",
    "description": "IdentyClaw agent on host B"
  }
},
"outbound": {
  "auth": {
    "provider": "rodit",
    "jwtCacheTtlSeconds": 300
  },
  "agents": {
    "agent-a": {
      "url": "https://agent-a.example.com/.well-known/agent-card.json"
    }
  }
}
```

### Alignment checklist

| Field | Must match |
| ----- | ---------- |
| `inbound.publicBaseUrl` | Public origin peers use to call this agent |
| `inbound.auth.audience` | Own passport `owner_id` — JWT `aud` from P2P `/api/login`. Set `AGENT_*_A2A_AUDIENCE` when bootstrap cannot probe it |
| `outbound.agents.<id>.url` | Remote peer's **public** Agent Card URL |

If `audience` does not match the live JWT `aud`, every inbound A2A request returns **401**. See [`docs/jwt-audience-alignment.md`](docs/jwt-audience-alignment.md).

Ensure the `a2a_*` tools are allowed (identyclaw bootstrap adds them when A2A is enabled; plain OpenClaw may need `tools.allow` or sandbox `alsoAllow` — see [`README.md`](README.md)).

---

## Step 4 — Credentials on each host

Each machine needs its **own** NEAR Passport credentials. Do not put secrets in `openclaw.json`.

| Variable | Purpose |
| -------- | ------- |
| `IDENTYCLAW_ACCOUNT_ID` | NEAR account id (Passport owner) |
| `IDENTYCLAW_NEAR_PRIVATE_KEY` | Ed25519 private key |
| `IDENTYCLAW_BASE_URL` | IdentyClaw API base URL (e.g. `https://api.identyclaw.com`) |

Identyclaw typically stores credentials in `secrets/near-credentials/*.json` per agent. The same gate applies as for other protected identyclaw tools.

Restart after config changes:

```bash
./identyclaw.sh restart agent-a   # on host A
./identyclaw.sh restart agent-b   # on host B
```

---

## Step 5 — Tier 1 unit tests (plugin repo)

Run in the fork before installing on agents:

```bash
make install
make test
```

Optional upstream-style e2e (API-key auth, requires OpenClaw CLI):

```bash
RUN_E2E=1 bun test tests/e2e
```

Tier 1 is the CI gate. It does not replace live RODiT smoke on real agents.

---

## Step 6 — Tier 2 RODiT smoke (each host independently)

Complete Tier 2 on **Host A**, then on **Host B**, before any cross-host integration.

### Discovery

```bash
curl -sf https://agent-a.example.com/.well-known/agent-card.json
```

### Auth negative (expect 401)

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://agent-a.example.com/a2a \
  -H "Content-Type: application/json" -d '{}'
```

### Inbound auth with a real JWT

1. Obtain a JWT via outbound `login_server` inside the agent container (or with env loaded from `near-credentials`).
2. POST to `/a2a` with that Bearer token:

```bash
curl -sf -X POST "https://agent-a.example.com/a2a" \
  -H "Authorization: Bearer <jwt-from-login>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"tasks/get","params":{"id":"x"}}'
```

A task-not-found or similar application error is acceptable — the check is **not 401** (auth succeeded).

Repeat the same checks on Host B for `agent-b.example.com`.

---

## Step 7 — Tier 3 cross-machine integration

From **Host A**:

```bash
curl -sf https://agent-b.example.com/.well-known/agent-card.json

./identyclaw.sh ask agent-a 'Use a2a_send_message to ping agent-b and report the task id'
```

From **Host B** (reverse direction):

```bash
./identyclaw.sh ask agent-b 'Use a2a_send_message to ping agent-a and report the task id'
```

### Manual checklist (before production / publish)

- [ ] Inbound threads show the peer `token_id` as sender
- [ ] Expired or revoked JWT is rejected
- [ ] Discord, email, and webhooks still work (A2A is additive)
- [ ] Control UI token is unrelated to A2A JWT
- [ ] No secrets in `openclaw.json` (env substitution only)
- [ ] Tier 2 passed on both hosts
- [ ] Tier 3 passed A → B and B → A over public HTTPS

---

## Dev fallback — API keys (optional)

If RODiT JWT paths are not ready, you can validate cross-host HTTP wiring with API keys. This does **not** replace Tier 3 RODiT testing before publish.

On the **inbound** host:

```json
"inbound": {
  "auth": { "provider": "apiKey" },
  "apiKeys": [{ "label": "host-b", "key": "<generated-key>" }]
}
```

On the **outbound** caller, add to the peer entry:

```json
"custom_headers": {
  "Authorization": "Bearer <same-key>"
}
```

Generate keys:

```bash
openclaw a2a generate-key host-b
```

Alternatively, RODiT with API key fallback:

```json
"inbound": {
  "auth": {
    "provider": "rodit",
    "issuer": "https://api.identyclaw.com",
    "audience": "<own passport owner_id>",
    "allowApiKeyFallback": true
  },
  "apiKeys": [{ "label": "dev-peer", "key": "…" }]
}
```

---

## Publication gate

Do **not** publish to npm or ClawHub until:

1. Tier 2 passes on **both** hosts independently
2. Tier 3 passes **A → B** and **B → A** over public HTTPS
3. `audience`, `publicBaseUrl`, and `outbound.agents` are correct without container DNS

Same-host `./identyclaw.sh test-a2a` does not satisfy this gate. See [Step 5 — Publication](a2afork.md#step-5--publication-phase-7-after-tier-3) in `a2afork.md`.

---

## Common pitfalls (split deploy)

| Symptom | Likely cause |
| ------- | ------------ |
| 401 on all inbound A2A | `auth.audience` ≠ JWT `aud` (own passport `owner_id`; not `publicBaseUrl`) |
| Agent Card shows wrong URL | Missing or wrong `inbound.publicBaseUrl` behind proxy |
| Outbound cannot reach peer | `outbound.agents` still uses `http://openclaw-agent-b:18789/...` (container DNS) |
| Outbound login fails | Wrong or missing Passport credentials on that host |
| Peer discovers wrong endpoint | `publicBaseUrl` and reverse proxy paths not aligned |

---

## Quick reference — test tiers

| Tier | What | Where |
| ---- | ---- | ----- |
| 1 — Unit | Config, auth routing, mocks | `make test` in plugin repo |
| 2 — RODiT smoke | `login_server` + inbound JWT verify | Each agent host with Passport creds |
| 3 — Integration | Cross-agent `a2a_send_message` | Host A ↔ Host B over HTTPS |
