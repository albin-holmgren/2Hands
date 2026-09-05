# 2hands workspace release

## Product and research

2hands is a general AI workspace for research, browser tasks, files, coding and recurring work. Personal projects are separate workspaces. Team invitations, workflow recording and native purchases are deferred. Rakazo attribution and internal package/platform identifiers are retained.

Research checked September 4, 2026. Official [Cursor pricing](https://cursor.com/pricing) and [Grok Bot billing](https://cursor.com/help/grok-bot/plans) place Grok Bot in Cursor Pro at $20/month; $300 is not an entry requirement. Its trial credits are time limited. [Settings documentation](https://docs.x.ai/grok-bot/settings-and-notifications) describes managed model selection without a picker. [Computer documentation](https://docs.x.ai/grok-bot/computer-and-apps) describes account-shared computer state. These support differentiating on recurring free access, visible model choice, personal workspace isolation and transparent spending.

The [design retrospective](https://x.ai/news/designing-grok-bot) informs the compact roster, conversation focus, readable activity and progressive computer controls. [Mobile documentation](https://docs.x.ai/grok-bot/mobile) and [approval guidance](https://docs.x.ai/grok-bot/approvals-security-and-privacy) inform continuity, review and takeover. Public material does not establish comparative performance or completion rates. No authenticated competitive benchmark was performed.

## Architecture

- `apps/web`: shared web/Electron renderer; scoped workspace shell, model/composer control, Computer / Files / Activity pane and usage UI.
- `apps/desktop`: Electron navigation, isolated server sessions, packaged hosted entry point and optional self-hosted setup.
- `apps/mobile`: Expo native navigation, workspace/model sheets, private draft state, routines, approvals, artifacts and allowance screen.
- `apps/api`, `apps/worker`: Hono authorization/RPC and durable background execution.
- `packages/contracts`, `packages/core`: model/usage contracts, shared pricing and model-picker rules.
- `packages/adapters`: provider-specific models, safe computer execution and metering hooks. `gateway-catalog.json` records tool-capable hosted model capabilities and public rates for deterministic discovery.
- `packages/db`: isolated persistence, immutable billing periods, monetary reservations, settlement and provider-event reconciliation.
- `packages/ui-tokens`, `packages/chat-ui`: shared semantic themes and response rendering. Existing Beautiful UI primitives remain the web interaction foundation.

## Commercial terms and rates

The authoritative plan table is `packages/core/src/plans.ts`:

| Plan | Monthly price | Included combined hosted usage |
| --- | ---: | ---: |
| Free | $0 | $1 |
| Plus | $20 | $10 |
| Pro | $60 | $30 |
| Ultra | $200 | $100 |

Hosted billing is opt-in (`BILLING_ENABLED=true`). Self-hosters can leave it disabled. Tokens, cache tokens and computer time use one account balance across all workspaces. BYOK inference uses the user's provider account; hosted computer time still uses the 2hands allowance. Creating another workspace does not grant credit. Exhaustion blocks new reservations; there are no automatic overage charges.

Hosted computer customer rate: **$0.15 per active hour**, configured with `HOSTED_COMPUTER_USD_PER_HOUR`; billed per second with five-minute reservation coverage and idle suspension. This is the customer price, not a claim about an operator's actual cost. [E2B prices](https://e2b.dev/pricing) CPU and memory per second; operators must verify their template resources and margin. Unsupported hosted providers without bounded lifetimes fail closed.

Model rates come from the [public Gateway catalog](https://ai-gateway.vercel.sh/v1/models) and are stored with each usage reservation and settlement. Input, output, cache-read and cache-write quantities remain auditable. A provider call reserves a conservative bound before dispatch. Output and retries are bounded. A network failure with unconfirmed usage retains its hold for reconciliation rather than incorrectly refunding unknown spending. Operators must reconcile those holds against provider records; do not release them merely because a worker lease expired.

Existing usage quantities are retained; no retrospective dollar charges are invented. Subscription grants require confirmed paid periods. New terms for existing subscriptions must be coordinated with renewal before enabling hosted billing.

## Execution and continuity

The effective model is resolved as bot override, workspace default, then deployment default, together with the authorized key and funding source. Runs snapshot their selection before execution; resumed runs preserve it. An unavailable explicit selection produces an error instead of changing providers.

Run metadata exposes the resolved provider, model and hosted/BYOK funding. Allowance exhaustion, model unavailability, computer unavailability and plan limits carry shared error codes through RPC, persisted failures and live web/native updates. Existing unclassified failures remain readable.

Computers are allocated when a tool, attachment or takeover needs one. Coding CLIs run only through the isolated sandbox provider, with bounded execution/output and cancellation. User credentials are narrowly supplied; deployment keys never enter these CLIs. Missing CLI authentication/installation is reported explicitly. Cursor cloud handoff is unavailable until a workspace-scoped adapter exists; normal sandbox shell/file coding remains available.

Workspace views and drafts are scoped by server/account/workspace/conversation. Switching does not cancel backend work. Native drafts survive app restarts in private application storage, with a last-complete backup and clearing on signout. Attachment metadata refers only to validated private cache/document files; attachment bytes are not serialized into preferences or draft metadata. If the operating system purges an attachment cache file, the user must attach that file again.

## Local verification

Use deterministic tests by default, with `RAKAZO_IGNORE_ENV_FILES=1`. The test harness uses a disposable Docker Postgres by default. Without Docker, an explicitly provisioned disposable loopback database can be supplied:

```sh
TEST_DATABASE_URL=postgres://test:test@127.0.0.1:55439/twohands_test pnpm test:integration
TEST_DATABASE_URL=postgres://test:test@127.0.0.1:55439/twohands_test pnpm test:e2e
```

Only a loopback database name ending in `_test` is accepted. Never pass a live database. Offline rendering tests do not establish live provider or payment correctness.

Use `--workers=2` for browser verification on a busy development machine. Keep database journey runs separate from other heavy checks. Live onboarding verification additionally requires `VERIFY_PROVIDERS=1`, `VERIFY_HOSTED_ONBOARDING=1`, `BILLING_ENABLED=true`, a hosted Gateway credential and a freshly migrated disposable `TEST_DATABASE_URL`; run `packages/testkit/src/free-onboarding.canary.test.ts` explicitly. It checks real inference, the selected model snapshot, monetary settlement and lazy computer provisioning without using a production database.

## Release gates

### Local evidence, September 5, 2026

- All 20 package typechecks and all four production builds passed. Lint passed with no errors. The web build still reports a large entry chunk (about 257 KB gzipped); packaged startup needs a separate measurement.
- The latest offline unit suite passed 2,512 tests with no failures; 120 opt-in tests were skipped. Database and live-provider verification ran separately. A run interrupted by machine sleep was discarded and repeated with command-scoped sleep prevention. A final listener-hardening correction then passed all 39 affected E2B/display tests and independent review.
- All 83 database integration tests passed across 13 files on a fresh disposable PostgreSQL database. These cover monetary reservations and period transitions, paid-invoice reconciliation, concurrent shared-computer startup, and shutdown/restart recovery.
- The expanded browser suite exercised 58 cases. Its full run passed 57 and found one mobile group-panel close target shrinking during a width transition; that issue was fixed and passed a fresh-database rerun. The previous clean full suite passed 55 cases. Browser coverage includes first-run setup, workspace/draft continuity, model controls, approvals and takeover, files, routines, shared conversations, delayed-save isolation, missing-computer recovery, and mobile pane layering/44px close targets.
- A real hosted model call and a complete free-account onboarding canary passed. The canary signed up without a user API key or payment card, invoked the selected model, settled positive usage against the $1 allowance, kept the computer unallocated for a text task, and confirmed a second workspace shared the same balance.
- Native draft/storage tests and typechecking passed; iOS and Android Hermes exports completed. A locally signed iOS Simulator Release build passed a full Maestro smoke journey: sign-in, workspace and model sheets, bot creation, scripted chat, the computer panel, takeover and release. A separate draft journey verified isolation between conversations and restoration after process death. These use a synthetic backend; they do not prove real computer streaming, provider execution, payment delivery, store signing or Android device interaction.
- The headless workspace benchmark restored cached conversation state in 40–51 ms on this development machine. This measures a click through two animation frames with a deterministic local fixture; it does not establish production network latency or packaged startup performance.
- Synthetic screenshots cover light/dark workspace and model pickers, narrow layouts, conversation, files, billing and recovery states. Playwright attaches them to its report for CI artifact upload.
- Eight additional marketing browser checks passed in desktop and phone-sized layouts, with CI screenshot attachments for pricing, about, support, and preview privacy notices. Native screenshots are local simulator evidence and must be labeled separately from CI web screenshots.

An actual packaged mac-arm64 Electron 3.1.0 build passed its sign-in and rejected-auth recovery test with an isolated profile and a window that was never made visible. This verifies the bundled renderer and Electron isolation, not notarization, Windows distribution, or startup performance. Version 3.1.0 is a release candidate above the repository's existing v3.0.0 tag; no installer has been published. Ordinary checks do not launch Electron, and native launch tests require explicit opt-in.

The release review additionally hardened computer stream authorization and prepaid reconnect behavior, and added a real Stripe test-mode gate. Offline proxy/payment regressions and real-Postgres payment-event tests pass. Real E2B computer execution and Stripe test-mode lifecycle checks remain unverified because their test credentials are unavailable. The dedicated canaries fail preflight when credentials are missing; a skipped ordinary unit test is not release evidence. See [Stripe verification](stripe-release-gate.md).

No new image, mobile update, signed installer, or production migration has been published. The live HTTP audit found an older source revision and unavailable email/password recovery. Public registration on that running image was paused through its existing deployment setting and the live signup route was checked to reject registration. New `fly.toml` settings alone had not applied to that image. The new exact-revision HTTP check is documented in [hosting](2hands-hosting.md); it remains separate from live provider and payment journeys.

Hosted signup is controlled by `SIGNUPS_LOCKED=true` in `fly.toml`, which overrides previously saved registration settings and messaging signup. Do not unlock public signup until real provider execution, computer expiry/recovery and Stripe test-mode renewal/cancellation/replay are verified against the completed implementation. Run all checks, builds, unit and database tests, Playwright, packaged Electron and native Maestro journeys. Review both themes, narrow layouts, errors, workspaces, model selection and billing screenshots. Attach CI screenshots to a PR, finish automated review and re-run affected journeys before release. Desktop launch tests require an explicit `RAKAZO_ELECTRON_E2E=1`; ordinary checks do not open application windows.

Before opening registration on an existing E2B deployment, inventory its running
computers and checkpoint/pause or normalize every legacy instance through the
authorized computer lifecycle. New computers deny anonymous network traffic from
creation, and reconnect hardens legacy screen listeners. A lazy reconnect does
not protect an untouched older computer; do not treat deploying the new image
alone as completion of this rollout gate. Preserve workspace files and reconcile
the existing computer reservations rather than allocating replacement instances
on uncertain transport failures.

The hosted operator name, support contact and legal policy must be supplied by the maintainer; do not attribute the 2hands hosted service to Rakazo's upstream company or publish its contact details as 2hands support.
