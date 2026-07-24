# Security

## Reporting a vulnerability

Email **security@2hands.ai** with a description, reproduction steps, and
impact assessment. Do not open public issues for security reports. We aim to
acknowledge within 72 hours.

## Security model (v3)

The v3 architecture treats every model as untrusted with respect to secrets
and every external content source as untrusted with respect to instructions.

### No model-visible secrets

Passwords, OTPs, API keys, OAuth tokens, cookies, browser contexts, payment
data, and recovery material never enter LLM messages, tool arguments, task
events, receipts, logs, traces, analytics, or memory. Enforcement layers:

1. **Transport sealing** — protected inputs are encrypted client-side
   (x25519 + XChaCha20-Poly1305 sealed to a short-lived server challenge
   key) before leaving the trusted card; the conversation pipeline never
   sees them (`packages/secret-broker`).
2. **Envelope storage** — secrets are envelope-encrypted with associated
   data binding user, workspace, auth run, request, field kind, key id, and
   expiry; ciphertext lives in a Postgres schema that is not exposed through
   the API layer at all (`private.*`).
3. **One-time signed leases** — a deterministic injector redeems a secret
   exactly once, bound to an exact origin allowlist, semantic field,
   browser session, and short expiry. Origin, field, session, provider,
   expiry, or replay mismatch fails closed.
4. **Append-only safe events** — event payloads are validated against a
   secret-shaped-key denylist; `auth.secure_input.supplied` carries field
   IDs only (no values, lengths, or hashes).
5. **Canary gate** — CI drives a unique canary credential through the full
   flow and asserts the canary (plus base64/hex/url/stripped encodings)
   appears in zero rows of any client- or model-visible store
   (`apps/web/tests/integration/v3-secret-canary.test.ts`).

### Exact approvals

External communication, publication, purchases, subscriptions, account
changes, and destructive actions require a challenge-bound approval whose
SHA-256 hash covers the canonical action payload. Any material change
invalidates the approval; consumption is atomic and single-use; denial
provably results in zero side effects (tested).

### Computer isolation

Runner operations require signed job leases (HMAC) binding workspace,
session, allowed paths (lexical + realpath jail), operations, runtime and
credit ceilings, and publish flags. One writer lease per worktree; reviewer
worktrees are read-only at the type level and the lease level. Local Docker
sessions run with deny-by-default networking and resource limits.

### Prompt injection

Web pages, emails, repository content, and tool output are data, not
instructions. The deterministic browser provider observes pages as typed
semantic fields (never raw DOM into model context), refuses ambiguous or
unknown page kinds (user takeover instead of guessing), and locks
navigation to reviewed origin allowlists. Memory storage strips invisible
Unicode and rejects instruction-shaped and secret-shaped content.

### Never automated

CAPTCHA, passkeys, MFA challenges, identity verification, unusual-login
confirmation, and provider-hosted payment entry always hand control to the
user (protected takeover surface); 2Hands observes only safe completion
state.
