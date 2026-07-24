# 2Hands v3 — IMPLEMENTATION MAP

Internal build document for slices 1–9. Authority order: `CODEX_ONE_SHOT_PROMPT.md` → v3 docs → intentionally-retained repo behavior → v1/v2 planning. For API-level signatures: current repo/tests → v3 spec → current official SDK docs (preserve product/security invariants). Where doc summaries conflict on names, this map prefers `specs/*.types.ts` + `specs/provider-auth-manifest.schema.json`, then `CODEX_ONE_SHOT_PROMPT.md`. All names in the Appendix (Section 3) are frozen contracts for the build slices.

---

## 1. Existing → v3 Mapping Table

Legend: **EXTEND** = keep and build v3 on top; **PRESERVE** = keep working, do not build on, do not break; **SUPERSEDE** = keep running during transition, v3 replaces it as the canonical path (never delete data; deprecate additively).

### 1.1 Routes (apps/web/src/app/api)

| Existing | v3 bounded context | Disposition | Notes |
|---|---|---|---|
| `/api/chat` (5,873-line monolith) | Conversation / Principal Agent | EXTEND (wrap, then extract) | Keep SSE vocabulary mobile depends on (`ai_state`, `tool_call`, …); new v3 event stream added alongside, tools extracted incrementally. Do not rewrite in one slice. |
| `/api/conversations`, `/api/messages` | Conversation | EXTEND | Add `GET /api/conversations/:id/events?cursor=`, `POST /api/conversations/:id/cancel`. |
| `/api/agents/*` (run, worker, scheduler, heartbeat, reconciliation, screenshot, provision, terminate, session-pool) | Tasks + Computer | SUPERSEDE | `agent_runs` worker loop becomes the seed of the v3 durable task worker; Paperspace provision/terminate/screenshot superseded by ComputerProvider routes (COMPUTER.md §24 set). Screenshot polling preserved until live-view lands. |
| `/api/approvals` + `(dashboard)/app/approvals` | Approval Engine | EXTEND (consolidate) | One canonical `approvals` table + hash-bound respond endpoint; two legacy tables read-merged during transition. |
| `/api/missions/*` | Tasks (monitors/long-running) | SUPERSEDE | Missions map to v3 tasks + monitors. `claim_mission_tick` pattern reused for monitor cron. |
| `/api/integrations/{connections,oauth/connect,oauth/callback,tools,deliveries,deliveries/worker,slack/events}` | Account Broker + Connector Registry | EXTEND | ProviderPack → `ProviderAuthManifest`; OAuth PKCE flow kept, rebased on `auth_runs`. Delivery worker outbox generalized. |
| `/api/gateway/{deliver,events}` | Events/idempotency ingestion | EXTEND | `inbound_event_dedupe` pattern is the v3 webhook-dedupe primitive. |
| `/api/stripe/{checkout,portal,webhook}`, `/api/credits/*` | Billing | EXTEND | Webhook idempotency via `claim_webhook_event` kept; add credit_ledger/usage_events layer. |
| `/api/memory`, `/api/memory/boxes` | Memory | EXTEND | Rebase on `memory_items` (pgvector) with proposed/active lifecycle. |
| `/api/v1/{agents,keys,webhooks}` (public API-key surface) | — | PRESERVE | Out of v3 scope; keep stable. |
| `/api/{boards,office,outreach,confidence,eval,sandbox,referral,recurring-tasks,reminders,search,export,teams,settings,notifications,files,skills,security}` | — | PRESERVE | Unrelated subsystems; must not break. |
| Marketing pages, `(auth)` pages, `/auth/callback` | Shell | PRESERVE / EXTEND | `/auth/callback` (Supabase) must not collide with new `GET /api/auth/callback/:provider` (Account Broker OAuth) — distinct paths, both kept. |
| Mobile-consumed routes (`/api/profile`, `/api/agents`, `/api/referral`, `/api/settings`, `/api/notifications`, `/api/health`, `/api/auth/check-email`, `/api/agents/screenshot`, `/api/stripe/checkout`) | — | PRESERVE (contract-frozen) | `@2hands/api-client` and mobile fetch these; breaking them bricks shipped app builds. |

### 1.2 Packages

| Existing | v3 context | Disposition |
|---|---|---|
| `@2hands/tailwind-config` | Design tokens (source of truth) | EXTEND — tokens already match v3 brand; add Newsreader/display scale, radius/duration/layout keys from `specs/design-tokens.json`, token-drift test. |
| `@2hands/types` | Shared types | EXTEND — add v3 contract types (copied from `specs/*.types.ts`); fix stale drift (workspace_id, plan_type); populate `src/database.ts` with generated Supabase types. |
| `@2hands/api-client` | Client transport | EXTEND — add tasks/approvals/auth-runs/computers endpoints; keep existing methods stable for mobile. |
| `apps/integration-runtime` | Durable worker plane | EXTEND — the polling-daemon pattern + nixpacks deploy slot become the v3 durable-task/runner-callback worker host (Vercel-independent orchestration). |
| New packages (`packages/core`, `account-broker`, `secret-broker`, `connectors`, `computer`, `runner-protocol`, `browser`, `agent`, `memory`, `billing`, `observability`, `design-system`) | per ARCHITECTURE §2 | NEW — follow existing uncompiled-TS + tsconfig-paths pattern (metro constraint). |

### 1.3 Tables

| Existing | v3 context | Disposition |
|---|---|---|
| `workspaces`, `workspace_members`, `workspace_invites`, `profiles` | Identity/tenancy | EXTEND — canonical tenant spine; all new tables get `workspace_id` + membership RLS. |
| `conversations`, `messages` | Conversation | EXTEND — add safe-content-parts constraint; protected values structurally forbidden. |
| `tasks` (dormant) | Tasks | EXTEND — ALTER: add goal/normalized intent/policy snapshot/reservation refs; widen status to canonical v3 enum (additive migration). |
| `agent_runs` + `agent_run_events` (SKIP LOCKED queue + seq event stream) | Durable orchestration | EXTEND — proven claim/append pattern is the template for `task_events` and `computer_runs`/`computer_events`; agent_runs keeps serving legacy agents until cutover. |
| `agent_approvals`, `agent_pending_approvals` | Approval Engine | SUPERSEDE — new canonical `approvals` (hash-bound, signed, single-use); legacy tables read-only merged in UI during transition. |
| `evidence_bundles`, `quality_gate_*` | Receipts | SUPERSEDE — new `action_receipts` immutable table; evidence_bundles preserved as historical data. |
| `credentials`, `agent_credentials` | Secret Broker | SUPERSEDE — new `protected_secrets` + `secret_leases` (envelope encryption, AAD, opaque refs). `credentials` stays for existing OAuth token storage until connections migrate to `provider_connections`. **The plaintext-password-into-prompt path (`buildTaskWithCredentials`) is deleted in Slice 3 — it violates the core v3 invariant.** |
| `integration_connections`, `integration_threads`, `inbound_event_dedupe`, `integration_delivery_log` | Account Broker / Connectors | EXTEND — connections become `provider_accounts`/`provider_connections` fronting; delivery outbox + dedupe generalized (add stuck-`processing` recovery). |
| `agent_sessions`, `session_pool` (Paperspace) | Computer | SUPERSEDE — new `computers`/`computer_workspaces`/`computer_sessions`/`computer_runs`; Paperspace path retired behind `COMPUTER_PROVIDER`. |
| `credit_reservations`, `stripe_webhook_events`, workspace credit columns | Billing | EXTEND — workspace ledger is authoritative; add `subscriptions`, `credit_grants`, `usage_reservations`, `usage_events`, `credit_ledger`. Profile-level credits frozen (read-only fallback). |
| `memory_notes` (pgvector 1536), `memory_links`, `ai_manager_memories`, `memory_boxes`, `agent_memory_documents` | Memory | EXTEND — new canonical `memory_items` per MEMORY.md DDL; legacy stores preserved, migrated opportunistically. |
| `missions`, `mission_events`, `mission_tick_locks` | Monitors | SUPERSEDE — monitors table per v3; mission tick-lock RPC pattern reused. |
| `idempotency_keys`, `cron_locks`, `agent_execution_locks` | Reliability primitives | EXTEND. |
| referrals, notifications, push_tokens, eval_*, outreach_*, learning/excellence tables, workflows, api_keys, webhooks | — | PRESERVE. |

### 1.4 integration-runtime daemon

| Aspect | Disposition |
|---|---|
| Polling loop + CRON_SECRET bearer + healthz + nixpacks slot | EXTEND — becomes host for: v3 durable task worker, monitor cron, delivery outbox drain, runner-callback ingestion helpers, and (later) browser-session orchestration workers that cannot live in Vercel serverless. |
| Dual drainers (Vercel cron + daemon) | EXTEND with reconciliation — keep SKIP LOCKED safety; document which environment owns which drainer. |
| Inline Gmail send + inline AES decrypt in worker route | SUPERSEDE — moves to Gmail connector (Slice 4) + Secret Broker (Slice 3); GET/POST duplicate drain logic collapsed. |

---

## 2. Gap List per Build Slice

### Slice 1 — Design tokens, shell, voice-first conversation UI
**Exists:** Brand colors/semantic tokens already correct in `packages/tailwind-config/src/{colors,index}.ts` and `apps/web/src/app/globals.css` (terracotta #D97757, black #34322D, DM Sans, `--font-newsreader`). Chat UI + zustand stores (`apps/web/src/components/chat/*`, `src/store/chat-store.ts`), mobile chat shell (`apps/mobile/app/(app)/(tabs)/index.tsx`, `src/hooks/use-chat.ts`), theme context on mobile.
**Build:** `specs/design-tokens.json` as normalized source + token-drift test; add missing token keys (radius sheet 24/media 30, durations 220/500, layout widths, Newsreader type scale); orb component (12 orb states, reduced-motion variants) — greenfield on both platforms; voice capture/TTS — greenfield (mobile "speak" button is fake; no expo-av/speech anywhere); composer per brand spec; empty-state "What should we get done?"; kill sidebar/dashboard-grid patterns for the v3 surface (marketplace + account controls replace them).
**Touch:** `packages/tailwind-config/src/*`, `specs/design-tokens.json`, `apps/web/src/app/globals.css`, new `apps/web/src/components/orb/*`, `apps/web/src/app/(dashboard)/app/page.tsx`, `apps/mobile/app/(app)/(tabs)/index.tsx`, `apps/mobile/global.css`, new `packages/design-system`.

### Slice 2 — Durable tasks, events, approvals, receipts
**Exists:** `agent_runs`/`agent_run_events` with `claim_queued_agent_runs`/`append_agent_run_event` (SKIP LOCKED + monotonic seq) — the durable spine pattern; `/api/agents/worker` cron worker; two approval tables + `/api/approvals`; `evidence_bundles`; `idempotency_keys`; `transition_agent_status` state-machine RPC precedent.
**Build:** Canonical `tasks` extension + `task_steps` + `task_events` (EventEnvelope v1, per-task sequence); server-validated task state machine (canonical states, Appendix 3.1); consolidated `approvals` table with canonical action hash (inputs per SECURITY.md), signature, expiry, single-use consumption; `action_receipts` immutable table; `/api/tasks/*`, `/api/approvals/:id/respond` (challenge + hash + idempotency key); cursor-based event replay endpoints; reconnect-survives-restart test; approval-invalidation-on-payload-change tests; deny-once-sends-nothing + retry-sends-exactly-once tests.
**Touch:** new migration in `supabase/migrations/` (see §4), new `packages/core`, `apps/web/src/app/api/tasks/*`, `apps/web/src/app/api/approvals/*`, `apps/web/src/lib/agents/run-queue.ts` (bridge), `packages/types`, `packages/api-client`.

### Slice 3 — Account Broker + Secret Broker (deterministic test provider first)
**Exists:** `ProviderPack`/`CustomProviderManifest` + 13 provider packs (`apps/web/src/lib/integrations/provider-packs/*`), PKCE OAuth in `oauth.ts` with encrypted state, AES-256-GCM crypto in `credential-helpers.ts` and `computer-use/credential-manager.ts` (`CREDENTIAL_ENCRYPTION_KEY`), `integration_connections`, mobile OAuth deep-link return.
**Build:** `ProviderAuthManifest` validation against `specs/provider-auth-manifest.schema.json` (Ajv2020 + ajv-formats); `auth_runs` + `auth_events` tables and 14-state machine; `provider_manifests`, `provider_accounts`, `provider_connections`, `provider_capability_grants` tables; Secret Broker: `protected_secrets` (envelope encryption, AAD binds user/workspace/class/auth-run/provider/purpose; non-exposed schema, no client SELECT), `secret_leases` (`maximumUses: 1`), isolated `/api/secure-input/*` route segment (no body logging/analytics/model calls); server-signed secure-input card schema rendered by trusted compiled components (web sheet + Expo native — NOT model-generated HTML, submission bypasses the chat pipeline); trusted injector fail-closed rules; `verification_expectations` + `verification_events` + exclusion classes; deterministic fake provider (`/login/password`, `/login/otp`, `/login/magic-link`, `/login/mfa`, `/signup`, `/terms`, `/checkout`, `/account`, `/logout`) + fake inbox; CI canary-secret leak scanner (build this here, not last); **remove `buildTaskWithCredentials` plaintext injection**.
**Touch:** new `packages/account-broker`, `packages/secret-broker`, `apps/web/src/app/api/{auth-runs,secure-input,provider-accounts,verification-expectations}/*`, `apps/web/src/lib/integrations/*` (adapter bridge), migrations, mobile protected-input sheet (`apps/mobile/src/components/`), fix dead `sidebar.tsx` integrations fetches (relative URLs).

### Slice 4 — Gmail vertical slice + email verification
**Exists:** `provider-packs/gmail.ts` (GOOGLE_CLIENT_ID/SECRET), `gmail-tools.ts` (`gmail_get_inbox/search_emails/read_email/send_email/modify_labels`), token refresh in `mcp-executor.ts`, working send path in `deliveries/worker/route.ts`, `integration_delivery_log` outbox + idempotency column.
**Build:** Rebase Gmail tools on v3 risk classes (`gmail.search` R0 … `gmail.sendDraft` R2 with `approvalId` + `idempotencyKey`); draft-create/update tools (missing); exact-preview approval binding (recipients/subject/body/attachments in canonical hash); post-send verification via provider message ID into receipt; sent-exactly-once-under-retry test with fake Gmail; email-verification correlation using Slice 3 expectations (Gmail mailbox as verification source, manual-entry fallback — restricted-scope Google verification is a launch workstream, not code); labeled Demo Gmail connector for CI/golden path; token storage migrated to `provider_connections`.
**Touch:** `apps/web/src/lib/integrations/{gmail-tools,provider-packs/gmail,mcp-executor}.ts`, new `packages/connectors/gmail`, `apps/web/src/app/api/integrations/deliveries/worker/route.ts` (extract send + dedupe GET/POST logic), approval/receipt wiring from Slice 2.

### Slice 5 — ComputerProvider + 2Hands Runner (local Docker first)
**Exists:** Only superseded prior art: Paperspace client, `session-manager.ts`, `agent_sessions`/`session_pool` RPCs, HMAC signing (`security/hmac.ts`), VM screenshot viewer on mobile, `agent-executor.ts` in-process loop. Nothing matches the v3 contract.
**Build:** `packages/computer` implementing `ComputerProvider` interface + capability set (specs/computer-provider.types.ts is canonical for types; COMPUTER.md §24 is canonical for routes); `LocalDockerComputerProvider` (deterministic, dev/CI/self-host; never silently selected in prod); open-source `@2hands/runner` + `packages/runner-protocol` (signed `RunnerJobLease`, nonce, path prefixes, `runner.*` operations, redaction, one process group per run); internal routes `POST /api/internal/runner/{register,events,heartbeat,result}`; command-delivery channel design (control plane → runner: polling/queue — no inbound WS on Vercel); tables `computers`, `computer_workspaces`, `computer_sessions`, `computer_runs`, `computer_events` (append-only), `computer_checkpoints`, `environment_blueprints`, `preview_endpoints`, `workspace_write_leases`; `.2hands/computer.yaml` blueprint + EnvironmentPlan approval flow; network policy phases; heartbeat-loss → `unknown` reconciliation; checkpoint via git+tar-to-object-storage fallback where provider lacks snapshots; stop/resume/delete acceptance tests (Docker-only prerequisite); retire `SHARED_VM_IP`/`'api-only'` sentinel behind `COMPUTER_PROVIDER`.
**Touch:** new `packages/{computer,runner-protocol}`, new `apps/runner` (or `packages/runner`), `apps/web/src/app/api/{computers,computer-workspaces,computer-runs,computer-checkpoints,computer-previews,internal/runner}/*`, `apps/integration-runtime` (worker host), `images/workstation/`, migrations; update `scripts/security-fallback-guard.mjs` (currently FAILS on missing `apps/vm-server`).

### Slice 6 — Codex + Claude specialist adapters
**Exists:** Nothing adapter-shaped. Seams: `ai-client.ts` (Vercel AI Gateway), `model-routing.ts`, `model-registry.ts`. SSE display vocabulary on mobile is the render contract.
**Build:** `packages/agent` with `SpecialistAgentAdapter` + `AgentJob` envelope + `AgentJobEnvelope` (literal `publishAllowed: false`/`deployAllowed: false`); Codex via official app-server/SDK over stdio/Unix socket inside the workspace (auth precedence: 2hands-managed → user OpenAI key → device-code); Claude via Claude Agent SDK non-interactive mode with permission callback routed to `/api/approvals`; normalized event stream (`agent.started` … `agent.failed`) mapped to canonical `agent.run.*` events; thread-ref persistence for resume across session stop/start; deterministic Demo Codex + Demo Claude workers for CI; separate worktrees + one-writer lease enforcement in runner; implement-then-review pipeline (Codex worktree → checkpoint → Claude read-only review → reconcile → rerun verification); normalized `AgentResult` contract (text alone ≠ success).
**Touch:** new `packages/agent`, runner agent operations (`runner.agent.codex.*`, `runner.agent.claude.*`), `apps/web/src/app/api/agent-runs` or computer-run steer endpoints, worktree/lease logic in `packages/computer`.

### Slice 7 — GitHub App + publication (exactly-one-draft-PR)
**Exists:** OAuth-style `github.ts` pack + 8 `github_*` chat tools (create_branch/create_pr/read/write etc.) — direct tools with broad token; no GitHub App, no split credentials, no approval gating.
**Build:** GitHub App (installation flow, repo-scoped short-lived tokens); split credentials: clone/fetch token vs fresh post-approval publication token; control-plane publishing preferred (show files+message → exact approval → mint one-op lease → push branch → draft PR → verify refs → revoke); idempotency + postcondition verification (branch-exists check, exactly-one-PR-under-retry test); protected-branch push/merge/prod-deploy blocked; receipt with commit/checks/PR URL evidence; project-source picker (GitHub repo | blank | archive | existing project); demo repo for CI.
**Touch:** new `packages/connectors/github`, replace direct-push paths in `apps/web/src/lib/integrations/github-tools.ts`, publication endpoints under computer-run routes, approval hash wiring.

### Slice 8 — Billing: plans, weekly credits, reservation/settlement
**Exists:** Stripe checkout/portal/webhook routes, `claim_webhook_event` idempotency, `credit_reservations` + reserve/commit/release RPCs, workspace credit columns (`credits_balance`, `paid_credits_balance`, `reset_workspace_daily_credits`), mobile upgrade flow, `PRICING` config in `stripe/config.ts`.
**Build:** Server-side plan config for Free/Pro/Pro 5x/Pro 20x (weekly credits 50/500/2500/10000 — replaces 300/day model; ASCII `5x`/`20x` for Stripe/env; products `2Hands Pro`, `2Hands Pro 5x`, `2Hands Pro 20x`); tables `subscriptions`, `credit_grants`, `usage_reservations`, `usage_events` (11-category UsageEvent, append-only, providerCostMicros), immutable `credit_ledger`; pipeline `estimate → reserve maximum → execute → measure → settle → refund`; reservations must cover approved external writes through verification; entitlement computation server-side (Free = no Stripe record); `external_subscriptions` + `external_subscription_events` + `external_receipts` + `spending_mandates` (signed, minor units, bps tolerance); credit/provider-cost/external-subscription ledgers strictly separated; usage warnings 70/90/100%; mobile billing UI gated by release channel (no hard-coded checkout links in store builds); shared money-units utility (minor units vs bps vs micros vs credits).
**Touch:** new `packages/billing`, `apps/web/src/lib/{credits,stripe}/*`, `/api/billing/*`, `/api/usage/*`, migrations, `apps/mobile/app/(app)/upgrade.tsx` (channel gating).

### Slice 9 — Memory
**Exists:** `memory_notes` (already `vector(1536)`), `memory_links`, `match_memory_notes` RPC, `ai_manager_memories`, `memory_boxes`, memory settings pages on mobile sidebar, `/api/memory`.
**Build:** Canonical `public.memory_items` per MEMORY.md DDL (content_tsv GIN + HNSW; add explicit `CREATE EXTENSION IF NOT EXISTS vector` — missing today); MemoryItem lifecycle proposed → active | rejected → expired; candidate extraction after successful tasks; hybrid retrieval scoring (0.40 semantic + 0.25 FTS + 0.15 confidence + 0.10 recency + 0.10 usefulness, hard filters first); sensitivity filter — `secret` never enters prompts, credential-like content rejected at storage; poisoning defenses (Unicode stripping, instruction-pattern rejection, provenance); memory sheet UI (inbox, why-remembered, approve/reject/pin/export/clear); consolidation job; append-only memory-change events; legacy stores bridged read-only.
**Touch:** new `packages/memory`, migration for `memory_items`, `/api/memory/*` rework, memory sheet components web+mobile.

---

## 3. Canonical Contracts Appendix (frozen names)

### 3.1 Task states (canonical — CODEX_ONE_SHOT_PROMPT)
`draft → planning → awaiting_auth | awaiting_approval | queued → running → verifying → completed | failed | cancelled`
- `awaiting_*` re-enterable; all transitions server-validated; illegal transitions fail closed; every transition appends a task_event.
- Supersedes DATA_MODEL's `task_status` (`waiting_user`/`waiting_external`) and legacy PRD list (`created`/`waiting_approval`/`waiting_external`). `waiting_external` and `failed_unknown_outcome` survive only as **side-effect outcome states** on task_steps/receipts, not task states.

### 3.2 Auth-run states (canonical — specs/account-broker.types.ts `AuthRunStatus`, 14 values)
`created → selecting_method → awaiting_oauth | awaiting_secure_input | browser_running | awaiting_email_verification | awaiting_user_takeover | awaiting_terms | awaiting_payment → validating_session → completed | failed | cancelled | expired`
- The ACCOUNT_BROKER prose machine (`discovering`, `authenticating`, `validating_capability`, …) and DATA_MODEL `auth_run_status` are superseded for the `auth_runs.status` column. The connection-health loop lives on `provider_accounts.status`: `connected | needs_reauth | revoked | error` (specs `ProviderAccount`).

### 3.3 Provider auth modes (7, verbatim everywhere)
`2hands_managed_api | user_oauth | user_api_key | user_browser_session | assisted_signup | enterprise_sso | unsupported`

### 3.4 Risk classes (canonical — SECURITY.md)
`R0` read-only (auto) · `R1` reversible internal write (auto per policy, record+checkpoint) · `R2` external/material write (exact-preview approval in MVP) · `R3` high impact (explicit approval every time; many disabled in MVP) · `R4` blocked. DB enum: `r0_read | r1_reversible | r2_external_write | r3_high_impact | r4_blocked`. Computer command classes C0–C4 map: C0→R0, C1→R1, C2→R1/R2 policy-dependent, C3→R2/R3, C4→R4. `ApprovalRequest.riskClass` labels (`external_communication|publication|financial|account_security|destructive|legal`) are display categories carried in payload, not a second enum.

### 3.5 Approval invariants
`approval_status`: `pending | approved | denied | expired | cancelled | consumed`. Canonical action hash over `(task_id, run_id, connector_or_computer_capability, target_account_or_repository, normalized_input, branch_and_commit_or_file_hashes, attachment_hashes, cost_ceiling, policy_version, expires_at)`; signed, expiring, single-use; any payload change invalidates; respond requires challenge + hash + idempotency key; Approve/Deny differ by text/icon/position.

### 3.6 Event families (envelope: `EventEnvelope` — id, version:1, type, workspaceId, conversationId?, taskId?, runId?, occurredAt, sequence, actor{kind: 'user'|'2hands'|'agent'|'connector'|'system'; id?}, payload; sequence is **per-task/per-run stream**, cursor = sequence)
- Task: `task.created, task.plan.updated, task.step.started, task.step.progress, task.step.completed, task.waiting, task.resumed, task.verification.started, task.verification.completed, task.completed, task.failed, task.cancelled, receipt.created, artifact.created`
- Approval: `approval.requested, approval.updated, approval.approved, approval.denied, approval.expired, approval.consumed, approval.revoked`
- Auth: `auth.run.created, auth.method.selected, auth.oauth.started, auth.secure_input.requested, auth.secure_input.supplied, auth.browser.started, auth.verification.waiting, auth.verification.found, auth.takeover.required, auth.takeover.started, auth.takeover.completed, auth.terms.required, auth.payment.required, auth.session.saved, auth.completed, auth.failed, auth.cancelled, provider_account.connected, provider_account.needs_reauth, provider_account.revoked`
- Computer/agent (canonical public): `computer.created, computer.session.starting, computer.session.ready, computer.session.stopping, computer.session.stopped, computer.session.failed, computer.checkpoint.created, computer.checkpoint.restored, computer.preview.ready, runner.connected, runner.lease.accepted, runner.command.started, runner.command.output, runner.command.completed, agent.run.started, agent.run.progress, agent.run.completed, agent.run.failed, verification.test.started, verification.test.completed, publication.proposed, publication.completed`
- Usage: `usage.reserved, usage.measured, usage.settled, usage.released, limit.warning, limit.reached, external_subscription.created, external_subscription.renewal_due, spending_mandate.created, spending_mandate.exceeded`
- Conversation/voice: `conversation.created, conversation.message.accepted, conversation.response.delta, conversation.response.completed, voice.listening.started, voice.transcript.partial, voice.transcript.final, voice.speaking.started, voice.speaking.completed`
- COMPUTER.md's `computer.command.*`/`computer.agent.*` union is the **internal provider/runner stream**; a normalization map to the canonical family above is a Slice 5 deliverable. Adapter-internal `agent.*` events (agent.message.delta etc.) normalize to `agent.run.*`.

### 3.7 Table list (canonical v3 set; ★ = new, ● = extend existing)
Identity: ● profiles, ● workspaces, ● workspace_members, ★ devices.
Conversation/task: ● conversations, ● messages, ● tasks, ★ task_steps, ★ task_events, ★ artifacts, ★ action_receipts.
Policy/approval: ★ policy_profiles, ★ capability_grants, ★ approvals, ★ spending_mandates.
Provider accounts: ★ provider_manifests, ★ provider_accounts, ★ provider_connections, ★ provider_capability_grants.
Auth/secrets: ★ auth_runs, ★ auth_events, ★ protected_secrets, ★ secret_leases, ★ browser_sessions, ★ browser_contexts, ★ verification_expectations, ★ verification_events, ★ terms_documents, ★ consent_receipts.
Computer: ★ computers, ★ computer_workspaces, ★ computer_sessions, ★ computer_runs, ★ computer_events, ★ computer_checkpoints, ★ environment_blueprints, ★ preview_endpoints, ★ workspace_write_leases.
Billing: ★ subscriptions, ★ credit_grants, ★ usage_reservations, ★ usage_events, ★ credit_ledger, ★ external_subscriptions, ★ external_subscription_events, ★ external_receipts.
Memory: ★ memory_items (+ ● memory_notes/memory_links legacy).
Reused infra: ● stripe_webhook_events, ● inbound_event_dedupe, ● integration_delivery_log, ● idempotency_keys, ● cron_locks.
Enums: `secret_retention: ephemeral|session|durable_user_opt_in`; `billing_owner: user|workspace|twohands`; `ComputerState: creating|stopped|starting|ready|stopping|failed|deleting|deleted`; computer session state (distinct enum): `starting|ready|stopping|stopped|failed|expired` (+ `unknown` on heartbeat loss); delivery outbox: `pending|processing|delivered|failed|dead_letter`.

### 3.8 Env vars
Existing (keep): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_GATEWAY_API_KEY`, `ANTHROPIC_API_KEY`, `CREDENTIAL_ENCRYPTION_KEY`, `CRON_SECRET`, `INTERNAL_API_SECRET`, `GATEWAY_SECRET`, `SCHEDULER_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `UPSTASH_REDIS_URL/TOKEN`, `NEXT_PUBLIC_APP_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`.
New v3: `COMPUTER_PROVIDER` (`local-docker | vercel-sandbox | daytona | e2b`), `SECRET_BROKER_KMS_KEY_ID` (+ KMS provider creds), `RUNNER_LEASE_SIGNING_KEY` (issuer literal `"2hands-control-plane"`), `APPROVAL_SIGNING_KEY`, `BROWSER_PROVIDER` (`browserbase | local-playwright`), `BROWSERBASE_API_KEY/PROJECT_ID`, `GITHUB_APP_ID/GITHUB_APP_PRIVATE_KEY/GITHUB_APP_WEBHOOK_SECRET`, `OPENAI_API_KEY` (Codex managed), `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_5X_MONTHLY`, `STRIPE_PRICE_PRO_20X_MONTHLY` (ASCII `5X`/`20X`), `EMBEDDINGS_PROVIDER/EMBEDDINGS_MODEL`, feature flags `FEATURE_REALTIME_VOICE`, `FEATURE_HOSTED_SANDBOX`, `FEATURE_REAL_BROWSER_LOGIN`, `FEATURE_REAL_AGENTS`. Legacy retired with Slice 5: `PAPERSPACE_*`, `VM_SECRET`, `SHARED_VM_IP`, `VM_IP`, `NEMOCLAW_EXECUTOR`. `env.example` must be regenerated (currently stale on both apps).

### 3.9 Brand tokens (specs/design-tokens.json — source of truth; @2hands/tailwind-config carries them)
Brand: black `#34322D`, terracotta `#D97757`, terracottaHover `#C86647`, terracottaLight `#E88768`, beige `#F5F3F0`, white `#FFFFFF`, darkCanvas `#1A1918`, darkSurface `#2C2B27`. Functional: success `#10B981`, warning `#F59E0B`, error `#EF4444`, info `#D97757`. Fonts: DM Sans (ui), Newsreader (display), Playfair Display (editorial marketing only), Geist Mono/platform mono. Type sizes: 11/13/14/16/18/24/32/40/60. Spacing: 4/8/16/24/32/48/64. Radii: 4/8/12/16 (card)/24 (sheet)/30/32/9999. Durations: 150/200/300/220/500 ms. Layout: conversation 800 max, auth sheet 560, computer sheet 680, touch target 44, mobile input text 16. Dark theme has no backgroundTertiary; focus is `#34322D` light / `#D97757` dark. Root `BRAND_GUIDELINES.md` (Inter/#091217) is obsolete — ignore.

### 3.10 Other frozen values
Orb states (12, ARCHITECTURE): `idle, listening, thinking, planning, computer_waking, workspace_preparing, agent_working, running_tests, waiting_approval, preview_ready, speaking, error`. Secret kinds: `username|email|password|otp|magic_link|api_key` (manifest `recovery_code` semantic is manual-only; not injectable — resolves the specs mismatch conservatively). Lease `maximumUses: 1` literal; `browser.recording === false` const; `payments.rawPaymentDataTo2Hands === false` const; `AgentJobEnvelope.approvalPolicy = { publishAllowed: false, deployAllowed: false }` literal. API envelope: `ApiSuccess<T>/ApiFailure` with `requestId`. Computer routes: COMPUTER.md §24 set is authoritative (workspace/run-centric); API_EVENTS session-centric set is dropped. Plans: Free/Pro/Pro 5x/Pro 20x, $0/$20/$100/$200, weekly credits 50/500/2500/10000 — server-side config only. UI vocabulary: Task, Computer/workspace, Needs your approval, Connected apps, Remembered, Work credits, Receipt.

---

## 4. Migration Strategy (additive only)

**Home and numbering.** All v3 migrations go in root `supabase/migrations/` with timestamps `>= 20260401000000` (later than every existing file, avoiding the duplicate `20260217000003` prefix and the web-local 2025-dated dir). The `apps/web/supabase/migrations` dir is frozen — no new files there; its 6 files are folded into root ordering documentation. First v3 migration: `CREATE EXTENSION IF NOT EXISTS vector;` (currently implicit-only).

**Extend (ALTER, never rewrite):**
- `tasks`: add goal, normalized_intent, plan jsonb, policy_snapshot, reservation/settlement refs, parent_task_id, origin; add new status values via replacing CHECK additively (new migration drops+recreates constraint with superset).
- `workspaces`: plan fields already exist; add policy_profile_id, region, deletion_state.
- `profiles`: add voice/notification/verification-assistance prefs.
- `conversations`/`messages`: safe-content constraint, task linkage.
- `integration_delivery_log`: add stuck-`processing` timeout recovery (RPC change via new migration), separate `kind` column to split audit rows from queue rows.
- `stripe_webhook_events`, `inbound_event_dedupe`, `idempotency_keys`: reuse as-is.

**Add new (Section 3.7 ★ set), with these rules:**
- UUID PKs; `workspace_id NOT NULL` on every tenant-owned row; `(workspace_id, created_at desc)` indexes; unique idempotency key per workspace/action type; membership RLS with **both USING and WITH CHECK** (fixing the existing USING-only pattern) using existing `user_belongs_to_workspace` SECURITY DEFINER helper.
- Append-only tables (`task_events`, `computer_events`, `auth_events`, `usage_events`, `credit_ledger`, `action_receipts`, `consent_receipts`, `verification_events`): REVOKE UPDATE/DELETE + trigger enforcement — RLS alone is insufficient against service role.
- `protected_secrets`, `secret_leases`, `browser_contexts`: live in a non-exposed schema (`private.` — no anon/authenticated grants); access only via server routes/SECURITY DEFINER functions. Ciphertext never selectable by client roles.
- Clients can never mint: approvals, receipts, auth transitions, secret leases, usage settlement, provider state — bounded privileged functions only.

**Supersede (data-preserving):** `agent_approvals`/`agent_pending_approvals`, `evidence_bundles`, `agent_sessions`/`session_pool`, `missions`, `agent_credentials` remain untouched; new canonical tables run in parallel; legacy write paths are switched off in code (not SQL) per slice; a backfill script (not a migration) copies still-relevant rows where useful. Never DROP in v3.

**Credits cutover:** workspace ledger stays authoritative; `credit_ledger` becomes the immutable record with an opening-balance grant entry per workspace; `reset_workspace_daily_credits` (300/day free) replaced by weekly `credit_grants` under the new plan config behind a flag — dual-run one release before switching entitlement reads.

---

## 5. Top 10 Risks and Mitigations

1. **Plaintext secrets in model prompts today** (`buildTaskWithCredentials` injects passwords into LLM task prompts). *Mitigation:* Slice 3 deletes this path first, before any new browser-login capability; CI canary-secret scanner built in Slice 3 (not deferred to release gate) and run on every PR.
2. **Durable orchestration on Vercel serverless is impossible for long waits, browser sessions, and runner channels.** *Mitigation:* DB-backed job runner first (extending the proven `agent_runs` SKIP LOCKED pattern), hosted in the existing `integration-runtime` daemon slot (nixpacks); Vercel Workflow only later behind the `packages/computer` orchestration contract. No feature may depend on a request outliving 300 s.
3. **Two task systems + two approval tables + dual credit ledgers already exist; v3 could become a fourth parallel system.** *Mitigation:* This map designates one canonical spine per domain (tasks/approvals/credit_ledger), a per-slice cutover checklist, and forbids new writes to superseded tables once each slice lands; transition UIs read-merge, never write-merge.
4. **Spec conflicts (task-state enums, computer route sets, event-name unions, connection vs auth-run machines).** *Mitigation:* Appendix 3 is the single ruling (specs/* > CODEX_ONE_SHOT > docs); COMPUTER.md §24 routes win; internal→canonical event normalization map is an explicit Slice 5 deliverable with contract tests; no engineer resolves a conflict locally.
5. **KMS/injector isolation has no Supabase-native answer; all Vercel routes share one identity.** *Mitigation:* External KMS (envelope encryption per AUTH_SECRETS) with the trusted injector running in the worker daemon (separate workload identity), not Next.js; secret tables in a non-exposed schema; per-context Postgres roles/SECURITY DEFINER functions instead of one service key everywhere.
6. **Mobile contract breakage** (frozen routes, SSE vocabulary, direct Supabase table writes, dead sidebar fetches, shipped EAS builds with baked env). *Mitigation:* Contract-freeze list in §1.1; new v3 event stream added alongside legacy SSE with an adapter emitting the old vocabulary; mobile moves to server-owned writes incrementally behind API-client methods; Playwright + a new minimal mobile test harness added in Slice 1.
7. **Idempotency/exactly-once for external side effects (Gmail send, branch/PR, purchases).** *Mitigation:* Server-persisted idempotency keys (existing unique-index pattern) + provider-side postcondition verification (message ID fetch, branch/PR existence check, Stripe event dedupe) + `waiting_external`/`failed_unknown_outcome` reconciliation states; deny-once/retry-once tests are release blockers per slice.
8. **Migration ordering hazards** (two migration dirs, duplicate `20260217000003` prefix, missing `CREATE EXTENSION vector`, USING-only RLS). *Mitigation:* §4 rules: root dir only, `>= 20260401` timestamps, extension migration first, WITH CHECK required on all new policies, `supabase db reset` verified in CI (add to `pnpm check`).
9. **CI is currently red and thin** (`pnpm security:check` fails on missing `apps/vm-server`; no test framework, tsx script chains; integration-runtime has zero checks). *Mitigation:* Slice 1/2 groundwork: fix the guard script file list, introduce vitest alongside existing tsx tests (do not rewrite them), define root `pnpm check` aggregating lint/typecheck/test/build, add deterministic fakes (Demo Gmail, fake Account Provider, fake inbox, Demo Codex/Claude) as first-class deliverables budgeted in Slices 3–6.
10. **External dependencies gate launch, not code** — Gmail restricted scopes (Google verification/CASA), Codex hosted-embedding policy, Vercel Sandbox capability gaps (snapshots/forks), Browserbase recording guarantees. *Mitigation:* Every real provider behind honest config states (unconfigured/configured/connected/error/demo — never falsely connected) and feature flags; deterministic local providers (Docker computer, Playwright browser, fake inbox, manual OTP entry) are the tested baseline so the 19-step golden path passes with zero live credentials; provider policy reviews tracked as launch workstreams parallel to, not blocking, slice engineering.