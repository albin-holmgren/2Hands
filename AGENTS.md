# AGENTS.md — working on the 2Hands monorepo

Guidance for AI coding agents (and humans) contributing to this repository.

## Layout

```
apps/web                  Next.js 16 control plane + product surface
apps/mobile               Expo SDK 54 app (Expo Router)
apps/integration-runtime  polling worker daemon (nixpacks deploy slot)
packages/core             v3 trust domain: task states, canonical hashing, safe events
packages/types            shared types; v3 contracts under @2hands/types/v3 (FROZEN)
packages/secret-broker    protected-input crypto, storage envelopes, leases, redaction
packages/account-broker   provider manifests, auth-run machine, capability resolution
packages/browser          BrowserProvider + local Playwright implementation
packages/computer         ComputerProvider (fixture, local-docker) + RunnerHost
packages/runner-protocol  signed runner job leases, path jail, event vocabulary
packages/agent            specialist adapter contracts + demo Codex/Claude
packages/api-client       typed client for web+mobile (v3 client in src/v3.ts)
packages/tailwind-config  brand tokens (source of truth incl. design-tokens.json)
supabase/migrations       additive migrations only — never edit an applied file
docs/v3                   IMPLEMENTATION_MAP.md (frozen contracts), QUICKSTART.md
fixtures/                 demo repo + deterministic patch for the golden path
```

## Rules

1. **Extend, don't replace.** Additive migrations; never break the
   contract-frozen routes mobile ships against (see IMPLEMENTATION_MAP §1.1).
2. **Frozen contracts.** Task states, auth-run states, event names, risk
   classes, and brand tokens are frozen in `docs/v3/IMPLEMENTATION_MAP.md`
   §3. Don't invent variants.
3. **No model-visible secrets.** If your change touches credentials, run
   the canary gate: `pnpm test:integration:canary` (local Supabase up).
4. **No fake connected states.** Demo providers are labeled Demo; missing
   real configuration disables a feature with a precise setup message.
5. **Checks before handoff:**
   ```bash
   pnpm typecheck && pnpm lint
   cd apps/web && pnpm test:unit
   # with local supabase started:
   pnpm test:integration && pnpm test:integration:canary
   ```
6. **Migrations:** root `supabase/migrations/` only, timestamps strictly
   greater than every existing file (beware duplicate-version rollbacks —
   two files with the same version make `supabase start` fail).
7. **Tests are plain tsx scripts** (assert + exit code), not a framework;
   match the style of `apps/web/tests/unit/v3-*.test.ts`.
8. **Style:** match neighboring code; 2-space indent, no semicolons where
   the file omits them, `cn()` for class merging, cva variants for UI.
