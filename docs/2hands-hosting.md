# 2hands hosting

2hands is a long-running API + Graphile worker. Do **not** put the signed-in product on Vercel serverless.

| Layer | Where | Notes |
|---|---|---|
| Marketing (`apps/www`) | **Vercel** | `https://2hands.ai`; `www.2hands.ai` redirects to the website. |
| Signed-in app + API + worker | **Fly.io** app `2hands-computers` (`fly.toml`) | One Machine. API serves the SPA on the same origin as `/rpc` and `/api`. Customer URL is `https://app.2hands.ai`. |
| Bot computers | **E2B Desktop** | `SANDBOX_PROVIDER=e2b` plus `E2B_API_KEY`. Without the key, health reports `sandbox: none`. |
| Database | Operator-managed PostgreSQL | Postgres only. Keep Better Auth + Prisma. |
| Models | Vercel AI Gateway `https://ai-gateway.vercel.sh/v1` | `AI_GATEWAY_API_KEY`, `PI_DEFAULT_PROVIDER=vercel-gateway`. |
| Payments | Stripe | Plus / Pro / Ultra prices. Free is the DB default. Needs `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. |

Public product origin: `https://app.2hands.ai` (same origin for the SPA, `/rpc`, and `/api`). The website and its legal pages live at `https://2hands.ai`. Keep the long-running API and worker on Fly; only the static marketing application runs on Vercel.

## Database connections

- API may use the Supabase session pooler **or** the direct URL.
- Graphile worker needs `LISTEN/NOTIFY`. Set `REALTIME_DATABASE_URL` (and Graphile's `DATABASE_URL`) to the session host, **not** the transaction pooler on 6543.

Apply the full Prisma migration history to a new database. `organization_billing` cannot be added first because it references `organization`. After you have the **direct** connection string (port 5432):

```bash
DATABASE_URL='postgres://postgres.[ref]:[password]@db.[ref].supabase.co:5432/postgres' pnpm db:migrate
```

`fly.toml` runs `pnpm --filter @rakazo/db migrate` as the release command and again on API boot.

## Fly.io

Fly volumes cannot attach to two Machines. Homes live on `DATA_DIR=/data`. Until object storage is wired, **API and worker must share one Machine** (`infra/fly/start.sh`). Do not scale `api` above 1. Do not add a second process group with its own volume.

```bash
fly deploy --app 2hands-computers --build-arg GIT_SHA=$(git rev-parse HEAD)
fly secrets set \
  DATABASE_URL=... \
  REALTIME_DATABASE_URL=... \
  BETTER_AUTH_SECRET=... \
  ENCRYPTION_KEY=... \
  SCREEN_PROXY_SECRET=... \
  AI_GATEWAY_API_KEY=... \
  E2B_API_KEY=... \
  STRIPE_SECRET_KEY=... \
  STRIPE_WEBHOOK_SECRET=... \
  STRIPE_PRICE_PLUS=... \
  STRIPE_PRICE_PRO=... \
  STRIPE_PRICE_ULTRA=... \
  SMTP_URL=... \
  EMAIL_FROM=... \
  WEB_ORIGIN=https://app.2hands.ai \
  BETTER_AUTH_URL=https://app.2hands.ai \
  API_URL=https://app.2hands.ai
```

Point new Stripe webhook endpoints at `https://app.2hands.ai/api/stripe/webhook`. Preserve delivery to the previous apex endpoint during the hostname transition; verify its external rewrite before moving DNS.

The `ci` workflow deploys to this Fly app only after all checks pass on the exact
current `main` revision. Configure the repository's `FLY_API_TOKEN` secret and
`PRODUCTION_DEPLOY_ENABLED=true` variable after the live release gates pass.
It requires `SIGNUPS_LOCKED=true` in the deployed configuration. Mobile updates
have a separate operator-owned Expo configuration and opt-in; see
[mobile release](mobile-release.md).

After a controlled deployment, verify its identity and public HTTP composition:

```sh
pnpm release:check --origin https://app.2hands.ai --revision "$(git rev-parse HEAD)" --mode controlled
```

This is a read-only HTTP smoke check. It rejects an old image, missing computer
configuration, non-durable background services, unavailable email/password
recovery, and missing or open signup policy. It does not verify inference,
computer access/recovery, payment delivery, or native interaction. Complete those
separate gates before enabling public registration. Then run the same command
with `--mode public` against the exact approved revision.

DNS is **Vercel DNS** for the registered domain. Bring the app subdomain online and verify its Fly certificate before moving the website's apex records:

- `app` CNAME to the value returned by `fly certs show app.2hands.ai`.
- Add the corresponding `_fly-ownership.app` TXT and `_acme-challenge.app` CNAME when required by Fly.
- Attach `2hands.ai` and `www.2hands.ai` to the existing Vercel marketing project and use its current recommended DNS records. Redirect `www` to the apex.
- Preserve unrelated email, verification, and service records. Verify transactional-email DKIM/SPF independently.

Set `WEB_ORIGIN` / `BETTER_AUTH_URL` / `API_URL` to `https://app.2hands.ai`. Existing Fly secrets override `fly.toml`; update these three values together without replacing authentication or encryption secrets. Users may need to sign in again on the new origin; do not broaden session cookies across the marketing domain.

The SPA talks to `/rpc` on the app origin.

## Vercel marketing

Keep the existing Vercel project linked to `albin-holmgren/2Hands`. Set:

- Framework: Astro
- Root Directory: `apps/www`
- Production branch: `main`

`apps/www/vercel.json` is committed. Do not deploy `apps/api` or `apps/web` to Vercel. Attach `2hands.ai` and `www.2hands.ai` to this marketing project once the app subdomain and compatibility routes have passed their live checks.

## Stripe products

Create three recurring monthly prices (USD 2000 / 6000 / 20000 cents) named Plus / Pro / Ultra. Put the price IDs in `STRIPE_PRICE_PLUS`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_ULTRA`. Free is not a Stripe product.

Use the corresponding Stripe environment (test mode for verification, live mode only after release approval). Keep all account, product and price identifiers in deployment configuration, not in public examples.

Run the [Stripe release gate](stripe-release-gate.md) against a dedicated Stripe
sandbox and disposable loopback database. It verifies real Checkout completion,
paid allowance grants, renewals, cancellation, duplicates, and delayed events.
Separately verify Stripe's actual network delivery to a staging deployment and
its customer portal. Test success does not configure live prices or webhooks.

## E2B

`SANDBOX_PROVIDER=e2b` and `E2B_API_KEY`. Computers pause when idle; the home is checkpointed to `DATA_DIR`. Missing `E2B_API_KEY` boots as `sandbox: none` so signup still works. Before running more than one API instance, move homes to Supabase Storage or R2.

## Coding harness

Claude Code and Codex must be installed and authenticated **inside the isolated workspace computer**. They run with bounded time/output and cancellation. No coding CLI runs on the API or worker host. Only the matching user's model key may be supplied; the hosted deployment key stays outside the sandbox. Cursor handoff remains unavailable until a workspace-scoped adapter is configured; shell/file tools can still perform coding tasks.

## Hosted spending and signup

Set `BILLING_ENABLED=true` to enable shared monetary allowances. The committed Fly configuration publishes a customer computer rate of `$0.15/hour` (`HOSTED_COMPUTER_USD_PER_HOUR=0.15`). Model rates are taken from the checked public model catalog and recorded with every reservation. All workspaces share account credit; there are no automatic overage charges.

Hosted signup remains controlled (`SIGNUPS_LOCKED=true`, `SIGNUPS_ENABLED=false`) until real-provider and Stripe test-mode journeys, recovery and spending limits pass. The lock overrides previously saved registration settings and messaging signup. See [workspace release gates](2hands-workspace-release.md) for pricing, metering, migration and verification details. Supply the correct hosted operator and support details before publishing the website's legal pages.

Verify the running deployment's registration policy as well as the configuration
file: changes on disk do not protect an older running image. If the older image
lacks the lock, disable registration through its existing deployment settings
before preparing the controlled update. Preserve existing users' access.

The marketing site shows preview notices for support and privacy until those policies are approved.
Those are not a hosted privacy policy. Replace them with the operator's approved
policy and working private support contact before public signup, and publish them
on routes reachable from the signed-in product. Keep upstream Rakazo attribution
separate from the hosted operator's identity.
