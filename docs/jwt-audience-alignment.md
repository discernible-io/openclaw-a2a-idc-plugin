# JWT audience alignment for RODiT A2A

How inbound A2A authentication depends on a strict `aud` string match, why bootstrap can get it wrong, and how to fix it through **OpenClaw + A2A plugin configuration** — without changing `@rodit/rodit-auth-be`.

**Related:** [`a2afork.md`](../a2afork.md) (work plan), [`README.md`](../README.md) (config reference), identyclaw `scripts/lib.sh` (`ensure_a2a_config` / `agent_a2a_audience`).

---

## Executive summary

| Item | Detail |
|------|--------|
| **Problem** | Receiving agents reject otherwise-valid JWTs with **401** when JWT `aud` ≠ `inbound.auth.audience` (character-for-character). |
| **Root cause** | `inbound.auth.audience` must equal the receiving agent's passport `owner_id` — the `aud` P2P login mints. Copying `publicBaseUrl` into `audience` still fails. |
| **Recommended fix** | **Align bootstrap / `openclaw.json`** to probed `own_rodit.owner_id` (or live P2P JWT `aud`). Do **not** add audience normalization in `rodit-auth-be`. |
| **Proof gate** | Tier 2 smoke: P2P `login_server` → peer `/api/login`, decode JWT `aud`, `POST /a2a` — response must not be 401. |

---

## What “audience” means in this stack

In JWT terms, `aud` answers: *who is this token intended for?*

For A2A with RODiT, the **receiving agent** configures the expected value in `openclaw.json`:

```json
"plugins": {
  "entries": {
    "identyclaw-a2a": {
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

### What P2P login puts in the token

When a caller completes P2P login (`login_server` → peer `POST /api/login`), the **receiving agent** issues a JWT via `login_client` / `generate_jwt_token`. The `aud` claim is the **receiver's** passport `owner_id`:

```
aud = receiving_agent.own_rodit.owner_id   // hex Ed25519 public key (typical)
```

Each outbound call obtains a **separate** JWT per destination peer; tokens are not reusable across the mesh.

### What the receiving agent checks

When a peer sends `Authorization: Bearer <jwt>` to `POST /a2a`:

1. Plugin extracts the Bearer token.
2. Plugin calls `validate_jwt_token_be(token, { owner_id: config.audience, ... })`.
3. SDK verifies signature (using `rodit_id` from the JWT → blockchain lookup) and compares `payload.aud === config.audience`.
4. Mismatch → `Error 004: Invalid audience` → plugin returns **401**.

A 401 **without** a token only proves the auth gate is on. It does **not** prove a correctly issued JWT would be accepted.

---

## Why bootstrap is a common source of mismatch

On identyclaw hosts (e.g. dedalo43), `ensure_a2a_config` writes `inbound.auth.audience` from `agent_a2a_audience` (probes `own_rodit.owner_id` via `probe_rodit_own_owner_id`) and `inbound.publicBaseUrl` from `agent_a2a_public_base_url`:

```bash
# scripts/lib.sh
agent_a2a_audience() {
  # AGENT_*_A2A_AUDIENCE when set; else probe_rodit_own_owner_id
  ...
}
```

When `AGENT_*_A2A_AUDIENCE` is unset, audience comes from the agent's own passport `owner_id` — **not** from `publicBaseUrl`.

`publicBaseUrl` (Agent Card / discovery) and `audience` (JWT validation) serve different roles. Do not copy one into the other.

### Typical mismatch matrix

| Configured `audience` | Token `aud` (P2P) |
|-----------------------|-------------------|
| `https://agent-a.identyclaw.com:9443` (wrong — URL in audience field) | 64-char hex `owner_id` |
| Stale `owner_id` after passport rotation | New `owner_id` from live probe |
| Empty / missing (probe failed) | Valid hex from peer-issued JWT |

---

## Recommended solution: configuration, not SDK changes

**Principle:** `rodit-auth-be` defines the auth contract. Integrators (OpenClaw plugin, identyclaw bootstrap, operator `openclaw.json`) must match that contract — not weaken validation in the SDK.

### 1. Discover the live `aud` (Tier 2 — required)

On a **sending** agent, obtain a P2P JWT the same way outbound A2A does:

```bash
# Complete P2P login to the peer (or use ./identyclaw.sh test-a2a-auth p2p)
JWT='<token-from-peer-/api/login>'
echo "$JWT" | cut -d. -f2 | base64 -d 2>/dev/null | jq '{aud, iss, rodit_id, exp}'
```

On the **receiving** agent, confirm `inbound.auth.audience` matches that `aud` (own `owner_id`):

```bash
jq '.plugins.entries["identyclaw-a2a"].config.inbound.auth' \
  ~/identyclaw-agents-app/agents/agent-a/openclaw.json
```

**Rule:** `inbound.auth.audience` must equal JWT `aud` exactly.

### 2. Fix `openclaw.json` on the receiving agent

Set `inbound.auth.audience` to the decoded JWT value. Also confirm `inbound.auth.issuer` matches JWT `iss` (issuer comparison is slightly more forgiving on ports, but still align explicitly).

Example after discovery (hex `owner_id`):

```json
{
  "plugins": {
    "entries": {
      "identyclaw-a2a": {
        "config": {
          "inbound": {
            "publicBaseUrl": "https://agent-a.identyclaw.com:9443",
            "auth": {
              "provider": "rodit",
              "issuer": "https://api.identyclaw.com",
              "audience": "b1212dcd0d3042a5e767ad253fd179c7a111420d6ae903cd1e942d2a16ef8396",
              "identityClaim": "rodit_id"
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

Bootstrap in `identyclaw-agents/scripts/lib.sh` supports a **separate audience env var**:

| Approach | Status |
|----------|--------|
| **Separate env var** | **Implemented** — `AGENT_*_A2A_AUDIENCE` overrides `inbound.auth.audience`; `AGENT_*_A2A_PUBLIC_BASE_URL` still drives `publicBaseUrl` only |
| **Derive audience from public URL** | Fallback when `AGENT_*_A2A_AUDIENCE` is unset — copies public base URL (or container DNS in dev) |
| **Manual override** | Set `AGENT_*_A2A_AUDIENCE` in `env.local` after Tier 2 decodes live JWT `aud` |

Set `AGENT_*_A2A_AUDIENCE` when live JWT `aud` differs from `publicBaseUrl` (common: hostname-only `aud` vs full `https://…:9443` URL).

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

## If Tier 2 shows unexpected `aud`

P2P tokens should use the receiver's hex `owner_id`. If `aud` does not match `probe_rodit_own_owner_id` output:

1. Re-run bootstrap: `./identyclaw.sh restart agent-a`
2. Set `AGENT_*_A2A_AUDIENCE` explicitly from the live JWT
3. Verify the peer's `/api/login` is issuing tokens for the correct passport (not a stale plugin build)

Central-API mediated JWTs (shared `aud` across peers) are **no longer accepted** on `POST /a2a`.

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
| `outbound.auth.provider` | `openclaw.json` | `"rodit"` for P2P peer-issued JWT per outbound peer |
| `NEAR_CREDENTIALS_FILE_PATH` | agent secrets / `.env` | Passport file for P2P sign + login |
| `AGENT_*_A2A_PUBLIC_BASE_URL` | identyclaw `env.local` | Bootstrap input for `publicBaseUrl` |
| `AGENT_*_A2A_AUDIENCE` | identyclaw `env.local` | Bootstrap input for `audience` — overrides public URL when set |

---

## Bottom line

Audience is the **contract between P2P token issuance (`aud` = receiver `owner_id`) and the receiving agent's `inbound.auth.audience`**. Bootstrap probes `own_rodit.owner_id` via `probe_rodit_own_owner_id`. The solution is to **align config with a live P2P JWT** — through `openclaw.json`, `AGENT_*_A2A_AUDIENCE`, and operator discipline — not to weaken `rodit-auth-be` validation.

*Created from audience investigation on dedalo43 / identyclaw A2A RODiT integration.*
