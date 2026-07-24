# 2Hands ✋🤚

<p align="center"><b>Voice in. Work happens. Proof out.</b></p>

<p align="center">
  <a href="https://2hands.ai"><img src="https://img.shields.io/badge/Site-2hands.ai-D97757?style=for-the-badge" alt="2hands.ai"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License: MIT"></a>
  <a href="docs/v3/QUICKSTART.md"><img src="https://img.shields.io/badge/Demo%20mode-zero%20credentials-34322D?style=for-the-badge" alt="Demo mode"></a>
  <a href="SECURITY.md"><img src="https://img.shields.io/badge/Secrets-never%20model--visible-C86647?style=for-the-badge" alt="Security model"></a>
  <a href=".github/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/albin-holmgren/2Hands/ci.yml?branch=main&style=for-the-badge&label=CI" alt="CI"></a>
</p>

2Hands is a voice-first AI delegation operating system: one relationship,
one managed computer, one account broker, one approval system, one evidence
ledger. You speak or type the outcome you want; 2Hands selects direct APIs,
specialist agents (Codex implements, Claude reviews), a managed browser, or
an isolated cloud computer; obtains the minimum authority required; pauses
for identity, legal, or financial consent; verifies the result; and returns
evidence.

> "Open my repository. Use Codex to implement the onboarding flow, ask
> Claude to review it, fix the important findings, and prepare a pull
> request."

You never install Node, Git, Docker, an IDE, Codex, Claude Code, or a
remote-desktop client.

## Product surfaces

- **Main conversation** — one minimal screen: the terracotta orb, spoken
  and typed conversation, task progress, approval cards, protected
  credential cards, artifacts and receipts. No dashboard, no sidebar.
- **Marketplace** — the top-left control opens connected apps, specialist
  agents, managed computers, MCP connectors, and subscription/privacy
  controls.
- **2Hands Computer** — a persistent logical computer (files, repos,
  checkpoints, memory) whose compute wakes only when needed, behind a
  provider-neutral `ComputerProvider`.
- **Account Broker** — OAuth, assisted sign-in, account creation, email
  verification, and reauthentication where raw secrets are structurally
  invisible to the model: client-sealed transport, envelope-encrypted
  storage, one-time signed injection leases, and a CI canary gate proving
  no leak into any model- or log-visible store.

## Monorepo

```
apps/web                  Next.js 16 control plane + voice-first product surface
apps/mobile               Expo SDK 54 app
apps/integration-runtime  worker daemon
packages/*                trust domain, brokers, browser, computer, runner, agents
supabase/                 additive migrations (RLS-first, append-only evidence)
docs/v3/                  implementation map (frozen contracts) + quick start
fixtures/                 deterministic demo repo for the golden path
```

## Quick start (local demo mode — zero external credentials)

See **[docs/v3/QUICKSTART.md](docs/v3/QUICKSTART.md)**. Short version:

```bash
pnpm install --frozen-lockfile
supabase start -x vector,logflare && supabase migration up
npx tsx apps/web/scripts/seed-demo-provider.ts
pnpm dev:web    # → http://localhost:3000/app/v3
```

The demo mode exercises the real production code paths with deterministic
local providers: Demo Account Provider (first-party fake login site + fake
inbox), local Playwright browser, fixture computer, Demo Codex/Demo Claude,
and Demo GitHub publication — all clearly labeled, never silently
substituted for real providers.

## Verification-first engineering

```bash
pnpm typecheck && pnpm lint
cd apps/web
pnpm test:unit                    # trust domain, brokers, adapters, tokens
pnpm test:integration             # RLS cross-tenant denial, state machines
pnpm test:integration:canary      # the secret canary gate
pnpm test:integration:agents      # Codex→Claude handoff on the fixture repo
pnpm test:integration:publication # deny→zero / approve→exactly-once
```

Key invariants under test: exact hash-bound single-use approvals; append-only
events and receipts (enforced against the service role); per-worktree writer
leases; signed runner job leases with realpath path jails; origin-locked
one-time secret injection; forbidden email-verification categories; and the
canary sweep across every client-visible table.

## Security

See [SECURITY.md](SECURITY.md) for the threat model and reporting process.

## Contributing & governance

[CONTRIBUTING.md](CONTRIBUTING.md) · [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
· [GOVERNANCE.md](GOVERNANCE.md) · [TRADEMARK.md](TRADEMARK.md) ·
[MIT License](LICENSE). The "2Hands" name and orb identity are trademarks —
forks must rebrand (see TRADEMARK.md).

## Documentation

The complete v3 product/build documentation lives in the
`2hands-ai-documentation-v3` package (PRD, UX, architecture, account broker,
auth secrets, payments, billing, data model, security, testing, roadmap);
the implementation-facing distillation is
[docs/v3/IMPLEMENTATION_MAP.md](docs/v3/IMPLEMENTATION_MAP.md).
