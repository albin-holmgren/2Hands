# 2Hands v3 — Engineering handoff

Build executed 2026-07-24 on branch `v3/build` (5 commits on top of `main`).
Authority: `CODEX_ONE_SHOT_PROMPT.md` + the v3 documentation package;
implementation decisions frozen in [IMPLEMENTATION_MAP.md](IMPLEMENTATION_MAP.md).

## 1. Repository areas inspected and preserved

Full audit before any edit (map §1): all `/api/*` route families, both apps,
all packages, all 45 pre-existing migrations. Preserved untouched: marketing
pages, `(auth)` flows, `/api/v1` public API, mobile-consumed contract-frozen
routes, missions/outreach/eval/referral subsystems, the 5,873-line `/api/chat`
monolith, and the legacy `(dashboard)/app` surface. The v3 surface is additive
(`/app/v3`, `(app)/v3` on mobile, `components/v3/*`, `lib/v3/*`, new packages,
migrations `20260401000000`–`20260401000009`).

## 2. What was added (by slice)

| Slice | Delivered |
|---|---|
| 0 | Implementation map; baseline checks recorded (typecheck green, mobile lint 3 pre-existing errors, `turbo test` wired to nothing) |
| 1 | Token consolidation + drift test (74); 12-state orb, glass composer, marketplace sheet, approval + secure-input card primitives, v3 shells web+mobile |
| 2 | Canonical task spine (extends legacy `tasks`), `task_steps`, append-only `task_events` with per-task sequence + cursor replay, exact approvals (challenge + SHA-256 canonical action hash + single-use consumption), immutable `action_receipts`, `artifacts`, `policy_profiles`, `capability_grants`, `usage_reservations`; `@2hands/core`; `/api/tasks*`, `/api/approvals/:id/respond`, `/api/receipts`; v3 api-client |
| 3 | `@2hands/secret-broker` (x25519+XChaCha20 transport sealing, AAD-bound envelope storage, one-time signed injection leases, redaction/canary scanner); `@2hands/account-broker` (schema-exact manifest validator, 14-state auth-run machine, capability resolution); `@2hands/browser` (origin-locked local Playwright provider, deterministic semantic observation, lease-gated injection); isolated secure-input endpoints; Demo Account Provider site with adversarial scenarios; full deterministic browser login E2E |
| 4 | Email Verification Broker (signed expectations, exact sender domains, forbidden-category classifier, privileged extractor → secret refs); Demo Gmail connector (R0 search/read, drafts, exact-approved idempotent send) |
| 5 | `@2hands/runner-protocol` (signed job leases, lexical+realpath path jail, event normalization); `@2hands/computer` (Fixture + LocalDocker providers, RunnerHost); computer control-plane service + routes; write leases (one writer per worktree) |
| 6 | `@2hands/agent` (adapter contracts; reviewer is read-only at the type level); Demo Codex/Demo Claude; multi-agent pipeline service (implement → checkpoint → review → reconcile → verify) with dual event streams |
| 7 | Demo GitHub publication (approval-consumed, exactly-once under retry, immutable records + receipts); propose/execute publication routes; shell streams real task events with approval cards + receipt chips + reload-resume |
| 8 | Billing migration (subscriptions, ISO-week-idempotent `credit_grants`, append-only `usage_events` + `credit_ledger`, `spending_mandates`, external subscriptions); reserve→settle→refund pipeline; weekly-grant cron route |
| 9 | `memory_items` (lifecycle, sensitivity, FTS + HNSW, secret/injection storage filter); push-to-talk voice web (MediaRecorder → whisper passthrough or honest 501) and mobile (expo-audio/expo-speech); golden-path Playwright E2E; docs/governance set |

## 3. Working user journeys (all demo-mode, zero external credentials)

1. **Conversation → task**: goal in composer → durable task → streamed safe
   events → orb states tied to real state.
2. **Protected account connect**: capability missing → SecureInputCard →
   client-sealed submission → deterministic browser login on the demo
   provider → validated session → encrypted context → receipt.
3. **Managed computer multi-agent fix**: fixture computer wakes → Demo Codex
   fixes the failing fixture test in its writer worktree → checkpoint →
   Demo Claude reviews read-only → important findings applied → tests green.
4. **Approval-gated publication**: exact card (repo/branch/commit) → Deny ⇒
   zero side effects → re-request → Approve ⇒ exactly one draft-PR record
   under retry → immutable receipt with evidence.
5. **Email verification**: expectation → demo inbox OTP found → forbidden
   categories (password reset etc.) never auto-consumed → code stays outside
   model context, consumed once.
6. **Billing**: weekly grants (idempotent), reservation before work,
   settlement with refund, insufficient-credit blocking, spending-mandate
   coverage checks.
7. **Memory**: propose (secret/injection content rejected at storage) →
   approve → FTS retrieval → delete removes retrievability.
8. **Voice**: push-to-talk with honest not-configured state; spoken replies
   opt-in.

## 4. Security boundaries implemented

See [SECURITY.md](../../SECURITY.md). Highlights: private Postgres schema
(not API-exposed even to service role) for ciphertext; append-only triggers
that beat the service role; challenge+hash-bound single-use approvals;
origin-locked navigation with abort-on-redirect; leases failing closed on
signature/origin/field/session/provider/expiry/replay; canary gate scanning
every client-visible table for the secret and its encodings.

## 5. Tests and commands actually run (with outcomes)

- `pnpm typecheck` — 13/13 packages green (final tree).
- `pnpm lint` (apps/web) — all v3 files clean; 116 pre-existing legacy
  errors untouched (deliberate).
- Unit suites (final all-green pass): core-trust-domain 69, secret-broker 39,
  account-broker 105, browser-provider 68, runner-protocol 22,
  email-verification 18, memory-filter 40, token-drift 74.
- Integration vs local Supabase (one verified all-green pass): db 24,
  secret-canary 34, gmail-loop 42, pipeline 43, billing 46, memory 23,
  publication 12, publication-flow 34, computer-fixture 16, multi-agent 17,
  browser-injection 18.
- Golden-path Playwright E2E (`test:e2e:golden`): **passed 4 runs** against
  a live dev server + local stack, including deny→zero, approve→exactly-once,
  and mid-flow reload with cursor replay. A later independent rerun attempt
  hit environmental timeouts only (host under load ~19 from an unrelated
  Xcode build; local GoTrue 504s) — no product failure was observed; rerun
  with `pnpm test:e2e:golden` when the machine is quiet.
- Fresh-DB `supabase start` + `supabase migration up` — green after fixing
  two pre-existing bugs (see §7).

## 6. Demo-mode instructions

[QUICKSTART.md](QUICKSTART.md).

## 7. Pre-existing bugs found and fixed

1. Duplicate migration version `20260217000003` (two files) — broke every
   fresh `supabase start`. Renamed the idempotent `workspace_ai_name`
   variant to `20260217000005`. Hosted DBs that recorded the old version may
   need `supabase migration repair --status applied 20260217000005`.
2. `create_user_settings` trigger inserted `user_settings` without the
   NOT-NULL `workspace_id` — every signup on a clean DB failed
   (`20260401000002` fixes it via `ensure_personal_workspace`).
3. `scripts/security-fallback-guard.mjs` failed on the removed
   `apps/vm-server` (now optional).
4. `use-task-stream` stale-poll race clobbered the cursor when switching
   tasks; CSP `connect-src` blocked non-`*.supabase.co` local stacks;
   `Permissions-Policy` blocked the microphone entirely (would have broken
   voice in production).

## 8. Real-provider setup still required (manual, external)

- **Gmail**: real OAuth routes exist behind config; production use of
  restricted scopes requires Google verification (potentially CASA). Use
  test users meanwhile.
- **GitHub App**: create the App, set `GITHUB_APP_*`; the real adapter must
  implement the same `publishBranchAndDraftPr` contract (demo adapter is
  the reference; real one is not yet written).
- **Codex / Claude real adapters**: contracts + demo implementations exist;
  official-SDK adapters gated behind `FEATURE_REAL_AGENTS` are not yet
  written. Verify current OpenAI/Anthropic SDK APIs and provider policies
  at implementation time (do not assume a consumer Claude subscription can
  power hosted third-party execution).
- **Hosted browser (Browserbase) and hosted sandbox (Vercel Sandbox)**:
  adapter seams exist (`BROWSER_PROVIDER`, `COMPUTER_PROVIDER`); hosted
  adapters not yet written; confirm current APIs from official docs.
- **Stripe v3 plans**: create the three products/prices and set
  `STRIPE_PRICE_PRO_V3_MONTHLY` etc.; the checkout/webhook path reuses the
  existing working Stripe foundation.
- **KMS**: production Secret Broker must swap `envKeyProvider` for a
  KMS-backed `KeyProvider` (interface ready).

## 9. Known limitations / flags

- Realtime duplex voice is behind `FEATURE_REALTIME_VOICE` (not built);
  push-to-talk + TTS shipped.
- Task event delivery is polling (1.5 s) not SSE/Realtime push — adequate
  for the demo; swap the transport behind `use-task-stream`.
- No same-task re-propose affordance after a publication deny (task rests
  in `awaiting_approval`; a fresh goal works). Follow-up recommended.
- The legacy surface (`/app`) and v3 surface coexist; flipping the default
  route is a deliberate later cutover (map §risk 3, per-slice cutover
  checklist).
- Mobile temp voice recording (m4a in app cache) is not explicitly deleted
  post-upload (`expo-file-system` not added).
- Legacy lint debt (116 errors in non-v3 files) untouched.
- The `2hands-ai-documentation-v3` package's own `computer_workspaces`
  table was merged into `computers` (documented deviation, map §Slice 5).

## 10. Migration/deployment steps

1. Apply migrations `20260401000000`–`20260401000009` (additive; the
   `20260217000003→000005` rename may need `supabase migration repair` on
   environments that recorded the old version).
2. Set the new env vars (see `env.example` v3 sections); generate the three
   signing/master keys; production requires KMS wrapping.
3. Deploy web as usual; the worker daemon slot (`apps/integration-runtime`)
   is unchanged in this build.
4. Seed provider manifests (`apps/web/scripts/seed-demo-provider.ts` for
   demo; real manifests require policy review before enabling).

## 11. First recommended follow-up issue

**Same-task re-proposal after publication deny** — after a user denies a
publication, allow the principal to revise and re-propose on the same task
(new approval, new hash) instead of requiring a fresh task; includes the
awaiting_approval → planning transition path (already legal in the state
machine) and a shell affordance.

## 12. Owner decisions explicitly left open

Repo publication timing (blocked on credential rotation);
provider policy reviews for real browser-login manifests; Stripe price
creation; Google/GitHub app registrations; production KMS choice.
