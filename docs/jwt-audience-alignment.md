# JWT audience alignment for RODiT A2A

How inbound A2A authentication depends on a strict `aud` string match, why bootstrap can get it wrong, and how to fix it through **OpenClaw + A2A plugin configuration** — without changing `@rodit/rodit-auth-be`.

**Related:** [`a2afork.md`](../a2afork.md) (work plan), [`README.md`](../README.md) (config reference), identyclaw `scripts/lib.sh` (`ensure_a2a_config` / `agent_a2a_audience`).

---

## Executive summary

| Item | Detail |
|------|--------|
| **Problem** | Receiving agents reject otherwise-valid JWTs with **401** when JWT `aud` ≠ `inbound.auth.audience` (character-for-character). |
| **Root cause** | Bootstrap and docs *assume* IdentyClaw puts a specific string in `aud`; that assumption is often unverified. Convention mismatches (hostname vs full URL, port, scheme, trailing slash) are common. |
| **Recommended fix** | **Align OpenClaw / plugin / identyclaw bootstrap config** to whatever IdentyClaw actually emits. Do **not** add audience normalization or other workarounds in `rodit-auth-be`. |
| **Proof gate** | Tier 2 smoke: obtain a real JWT from `login_server`, decode `aud`, POST to `/a2a` — response must not be 401. |

---

## What “audience” means in this stack

In JWT terms, `aud` answers: *who is this token intended for?*

For A2A with RODiT, the **receiving agent** configures the expected value in `openclaw.json`:

```json
"plugins": {
  "entries": {
    "a2a": {
      "config": {
        "inbound": {
          "auth": {
            "provider": "rodit",
            "issuer": "https://api.identyclaw.com",
            "audience": "<must match JWT aud exactly>"
          }
        }
      }
    }
  }
}
```

The A2A plugin passes `audience` into `validate_jwt_token_be` as the expected `owner_id`:

```typescript
// src/auth/rodit-inbound.ts
function buildAudienceRodit(config) {
    return {
        token_id: "a2a-inbound",
        owner_id: config.audience,
        metadata: { subjectuniqueidentifier_url: config.issuer },
    };
}
```

`rodit-auth-be` then enforces **exact** string equality on `aud`. Unlike `iss`, there is **no** port stripping or URL normalization for audience today — and that is intentional contract behavior, not something callers should paper over in the SDK.

---

## Issuance vs validation (the contract)

### What IdentyClaw / `rodit-auth-be` puts in the token

On `POST /api/login`, the server issues a JWT via `generate_jwt_token`. The `aud` claim is set from the **issuer’s** RODiT record on NEAR:

```
aud = own_rodit.owner_id   // service provider RODiT, from blockchain
```

Depending on how IdentyClaw (`idclawserver-idc`) minted that RODiT, `owner_id` may be:

- A **hex-encoded Ed25519 public key** (typical RODiT default), or
- A **string identity** configured for that deployment (e.g. hostname or URL), if the IdentyClaw server was set up that way.

The A2A fork **expects** per-agent public identity in `aud` (hostname or URL peers use to call `POST /a2a`). Whether IdentyClaw actually issues tokens that way is an **operational fact** — it must be measured, not assumed.

### What the receiving agent checks

When a peer sends `Authorization: Bearer <jwt>` to `POST /a2a`:

1. Plugin extracts the Bearer token.
2. Plugin calls `validate_jwt_token_be(token, { owner_id: config.audience, ... })`.
3. SDK verifies signature (using `rodit_id` from the JWT → blockchain lookup) and compares `payload.aud === config.audience`.
4. Mismatch → `Error 004: Invalid audience` → plugin returns **401**.

A 401 **without** a token only proves the auth gate is on. It does **not** prove a correctly issued JWT would be accepted.

---

## Why bootstrap is a common source of mismatch

On identyclaw hosts (e.g. dedalo43), `ensure_a2a_config` writes both `inbound.auth.audience` and `inbound.publicBaseUrl` from the same helper:

```bash
# scripts/lib.sh
agent_a2a_audience() {
  public_url="$(agent_a2a_public_base_url "$id")"
  if [[ -n "$public_url" ]]; then
    echo "$public_url"    # e.g. https://agent-a.identyclaw.com:9443
  else
    echo "http://$(agent_container "$id"):$(agent_internal_gateway_port "$id")"
  fi
}
```

That produces a **full origin with scheme and port** in pod mode.

The fork README examples use **hostname only**:

```json
"audience": "agent-a.diholai.io",
"publicBaseUrl": "https://agent-a.diholai.io"
```

If IdentyClaw’s live JWT uses one convention and bootstrap writes another, every authenticated A2A call fails with 401.

### Typical mismatch matrix

| Configured `audience` | Token `aud` might be |
|-----------------------|----------------------|
| `https://agent-a.identyclaw.com:9443` | `https://agent-a.identyclaw.com` |
| `https://agent-a.identyclaw.com:9443` | `agent-a.identyclaw.com` |
| `https://host:9443` | `http://host:9443` |
| `https://host:9443` | `https://host:9443/` |
| URL-shaped string | 64-char hex `owner_id` |

---

## Recommended solution: configuration, not SDK changes

**Principle:** `rodit-auth-be` defines the auth contract. Integrators (OpenClaw plugin, identyclaw bootstrap, operator `openclaw.json`) must match that contract — not weaken validation in the SDK.

### 1. Discover the live `aud` (Tier 2 — required)

On a **sending** agent with Passport credentials loaded:

```bash
# Obtain JWT the same way outbound A2A does (login_server against IDENTYCLAW_BASE_URL)
# Then decode:
JWT='<token-from-login>'
echo "$JWT" | cut -d. -f2 | base64 -d 2>/dev/null | jq '{aud, iss, rodit_id, exp}'
```

On the **receiving** agent:

```bash
jq '.plugins.entries.a2a.config.inbound.auth' \
  ~/identyclaw-agents-app/agents/agent-a/openclaw.json
```

**Rule:** `inbound.auth.audience` must equal JWT `aud` exactly.

### 2. Fix `openclaw.json` on the receiving agent

Set `inbound.auth.audience` to the decoded JWT value. Also confirm `inbound.auth.issuer` matches JWT `iss` (issuer comparison is slightly more forgiving on ports, but still align explicitly).

Example after discovery (hostname convention):

```json
{
  "plugins": {
    "entries": {
      "a2a": {
        "config": {
          "inbound": {
            "publicBaseUrl": "https://agent-a.identyclaw.com:9443",
            "auth": {
              "provider": "rodit",
              "issuer": "https://api.identyclaw.com",
              "audience": "agent-a.identyclaw.com",
              "identityClaim": "token_id"
            }
          }
        }
      }
    }
  }
}
```

Note: `publicBaseUrl` (discovery / Agent Card URLs) and `audience` (JWT validation) serve different roles. They are often related but **need not be identical strings** — what matters is that `audience` matches the token.

### 3. Fix identyclaw bootstrap (so new agents start correct)

Preferred approaches (pick one after Tier 2 proves the convention):

| Approach | Description |
|----------|-------------|
| **Separate env var** | Add `AGENT_A_A2A_AUDIENCE` distinct from `AGENT_A_A2A_PUBLIC_BASE_URL`. Bootstrap writes `audience` from the audience var and `publicBaseUrl` from the public URL var. |
| **Derive audience from public URL** | If live JWT uses hostname only, change `agent_a2a_audience()` to strip scheme/port (e.g. emit host from `public_base_url`). |
| **Manual override until proven** | Document that operators must set audience by hand after first Tier 2 run on each host. |

Change `ensure_a2a_config` in `scripts/lib.sh` so it no longer blindly copies `publicBaseUrl` into `audience` unless Tier 2 confirms they are the same string.

### 4. Per-host env checklist (production)

On each agent host:

```bash
# Discovery / Agent Card (what peers see)
AGENT_A_A2A_PUBLIC_BASE_URL=https://agent-a.example.io

# JWT validation (must match live token aud — set after Tier 2)
AGENT_A_A2A_AUDIENCE=agent-a.example.io   # example; use exact JWT value

# Outbound login (sender)
IDENTYCLAW_ACCOUNT_ID=...
IDENTYCLAW_NEAR_PRIVATE_KEY=...
IDENTYCLAW_BASE_URL=https://api.identyclaw.com
```

Restart gateway after config changes:

```bash
openclaw gateway restart
```

### 5. Tier 2 acceptance test

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  'https://agent-a.identyclaw.com:9443/a2a' \
  -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":"1","method":"tasks/get","params":{"id":"x"}}'
```

| HTTP code | Meaning |
|-----------|---------|
| **401** | Auth failed — almost always `aud` or `iss` mismatch (fix config, not credentials) |
| **4xx other than 401** | Auth likely passed; RPC/task error is acceptable for this test |
| **2xx** | Auth passed |

---

## What we are explicitly not doing in `rodit-auth-be`

Do **not** solve audience mismatches by:

- Adding port/scheme/trailing-slash normalization for `aud` in `validate_jwt_token_be`
- Accepting “close enough” hostname matches
- Forking the SDK to weaken `Error 004: Invalid audience`

Those changes hide configuration errors, break the RODiT contract for other consumers, and make failures harder to diagnose. If the JWT `aud` does not match what the receiving agent expects, the fix belongs in **configuration or IdentyClaw issuance policy** — not in SDK hoops.

`iss` already has URL normalization in the SDK; `aud` does not. Treat that asymmetry as a signal: **configure `audience` precisely**, don’t rely on fuzzy matching.

---

## If Tier 2 shows `aud` is not URL-shaped

If the decoded JWT `aud` is a **64-character hex** RODiT `owner_id` (not a hostname/URL), then per-agent URL audiences cannot work with the current “one `login_server` JWT for all peers” outbound model unless:

1. **IdentyClaw server** (`idclawserver-idc`) is configured to issue tokens with the intended `aud` per deployment, or
2. **Operators** set `inbound.auth.audience` on each receiver to that shared hex value (only viable if all agents under the same IdentyClaw issuer share one audience), or
3. **Future plugin work** adds per-peer login with an audience parameter (plugin + server contract change — still not an SDK validation workaround).

In all cases, the first step remains: **read the live JWT** and set config to match.

---

## Operational status matrix (dedalo43-style deployments)

| Test | Proves |
|------|--------|
| `POST /a2a` without Bearer | Auth gate is enabled |
| `POST /a2a` with fresh Passport JWT | Audience (+ issuer) alignment |
| Cross-agent `a2a_send_message` (Tier 3) | End-to-end peer messaging |

Until Tier 2 passes on each host, treat production A2A as **configured but unproven** on the auth path that matters for peer messaging.

---

## Quick reference: config fields

| Field | Location | Purpose |
|-------|----------|---------|
| `inbound.auth.audience` | `openclaw.json` | Must equal JWT `aud` exactly |
| `inbound.auth.issuer` | `openclaw.json` | Must equal JWT `iss` (IdentyClaw API URL) |
| `inbound.publicBaseUrl` | `openclaw.json` | External URL for Agent Card / discovery |
| `outbound.auth.provider` | `openclaw.json` | `"rodit"` for dynamic JWT via `login_server` |
| `IDENTYCLAW_*` env | agent secrets / `.env` | Outbound login credentials (not in `openclaw.json`) |
| `AGENT_*_A2A_PUBLIC_BASE_URL` | identyclaw `env.local` | Bootstrap input for `publicBaseUrl` |
| `AGENT_*_A2A_AUDIENCE` | identyclaw `env.local` (proposed) | Bootstrap input for `audience` — separate from public URL |

---

## Bottom line

Audience is the **contract between IdentyClaw token issuance and the receiving agent’s OpenClaw config**. Bootstrap picks a value from public URL settings; the plugin enforces it strictly via `rodit-auth-be`. The solution is to **align that config with a live JWT** — through `openclaw.json`, identyclaw bootstrap env vars, and operator discipline — not to make `rodit-auth-be` jump through normalization hoops.

*Created from audience investigation on dedalo43 / identyclaw A2A RODiT integration.*
