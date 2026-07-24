# 2Hands v3 — Local quick start (demo mode)

Run the complete v3 product loop locally with **zero external credentials**:
voice-first shell, protected account connection (Demo Account Provider),
managed demo computer, Codex→Claude multi-agent fix, approval-gated demo
publication, receipts.

## Prerequisites

- Node.js 20+, pnpm 9+
- Docker (via Docker Desktop or colima) — needed for local Supabase;
  the demo computer itself runs on the `fixture` provider without Docker
- Supabase CLI 2.x

## 1. Install and configure

```bash
pnpm install --frozen-lockfile
cp env.example apps/web/.env.local
```

Fill the minimum set in `apps/web/.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from `supabase status`>
SUPABASE_SERVICE_ROLE_KEY=<from `supabase status`>
SECRET_BROKER_MASTER_KEY=$(openssl rand -hex 32)
SECRET_BROKER_KEY_ID=local-dev
SECRET_LEASE_SIGNING_KEY=$(openssl rand -hex 32)
RUNNER_LEASE_SIGNING_KEY=$(openssl rand -hex 32)
COMPUTER_PROVIDER=fixture
BROWSER_PROVIDER=local-playwright
```

## 2. Database

```bash
supabase start -x vector,logflare   # -x avoids a colima socket issue
supabase migration up
npx tsx apps/web/scripts/seed-demo-provider.ts   # seeds the Demo Account Provider manifest
```

## 3. Run

```bash
pnpm dev:web        # http://localhost:3000
```

Open **http://localhost:3000/app/v3** after signing up. You get the
voice-first surface: terracotta orb, "What should we do?", the top-left
marketplace (Demo rows clearly labeled), the glass composer.

- `http://localhost:3000/app/v3?demo=cards` previews the approval and
  protected-credential cards (dev only).
- `http://localhost:3000/demo-provider/login/password` is the first-party
  fake provider site used by the deterministic browser login
  (`demo-user@demo-provider.test` / `demo-password-fixture`).

## 4. Test suites

```bash
pnpm typecheck
cd apps/web
pnpm test:unit                      # unit chain incl. all v3 suites
pnpm test:integration               # cross-tenant + trust domain vs local DB
pnpm test:integration:canary        # secret canary gate (requires local DB)
pnpm test:integration:computer      # fixture computer lifecycle
pnpm test:integration:agents        # Codex→Claude multi-agent handoff
pnpm test:integration:publication   # deny-zero / approve-exactly-once
```

The canary gate is the security cornerstone: it drives a real protected
credential through the Secret Broker and asserts the plaintext (and its
base64/hex/url encodings) appears in **zero** rows of any model-visible or
log-visible store, and decrypts exactly once via a signed one-time lease.

## What is real vs demo here

| Surface | Local implementation | Production path |
|---|---|---|
| Account login | Demo Account Provider + local Playwright | Reviewed provider manifests + hosted browser |
| Email verification | `demo_inbox` table | Gmail connector (Google verification required for restricted scopes) |
| Computer | `fixture` / `local-docker` provider | Hosted sandbox adapter behind `FEATURE_HOSTED_SANDBOX` |
| Codex / Claude | Deterministic demo adapters | Official APIs/SDKs behind `FEATURE_REAL_AGENTS` |
| Publication | Demo GitHub records | GitHub App with short-lived post-approval credentials |
| Billing | Local plan config + ledgers | Stripe Checkout/Portal/webhooks (test keys work locally) |

Demo providers never silently substitute for failed real providers; a real
provider that is not configured shows a precise setup message instead.
