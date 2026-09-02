# 2hands hosting

2hands is a long-running API + Graphile worker. Do **not** put the signed-in product on Vercel serverless.

| Layer | Where | Notes |
|---|---|---|
| Marketing (`apps/www`) | **Vercel** | Project `2hands` on team `biz`. Set **Root Directory** to `apps/www`. Domain `2hands.ai`. |
| API + worker | **Fly.io** (`fly.toml`) | Always-on Machines + volume for `DATA_DIR`. Railway (`railway.toml`) is the fallback. |
| Bot computers | **E2B Desktop** | `SANDBOX_PROVIDER=e2b`. Not Railway containers, not Vercel Sandbox. |
| Database | Supabase project `sopjzykpdyioxfdlivxd` (eu-west-1) | Postgres only. Keep Better Auth + Prisma. |
| Models | Vercel AI Gateway `https://ai-gateway.vercel.sh/v1` | `AI_GATEWAY_API_KEY`, `PI_DEFAULT_PROVIDER=vercel-gateway`. |
| Payments | Stripe | Plus / Pro / Ultra prices. Free is the DB default. |

## Database connections

- API may use the Supabase session pooler **or** the direct URL.
- The **worker must use the direct connection** (port **5432**). Set `REALTIME_DATABASE_URL` (and Graphile's `DATABASE_URL`) to the session host, **not** the transaction pooler on 6543. `LISTEN/NOTIFY` breaks on the transaction pooler.

The remote 2hands Supabase project (`sopjzykpdyioxfdlivxd`) is empty until the full Prisma history is applied. `organization_billing` cannot be added first because it references `organization`. After you have the **direct** connection string (port 5432):

```bash
DATABASE_URL='postgres://postgres.[ref]:[password]@db.[ref].supabase.co:5432/postgres' pnpm db:migrate
```

## Fly.io

```bash
fly apps create twohands-api
fly volumes create twohands_data --region arn --size 20
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
  CURSOR_API_KEY=... \
  WEB_ORIGIN=https://app.2hands.ai \
  BETTER_AUTH_URL=https://app.2hands.ai \
  API_URL=https://api.2hands.ai
fly deploy
```

`DATA_DIR` is `/data` on the Fly volume. Point Stripe webhooks at `https://api.2hands.ai/api/stripe/webhook`.

## Vercel marketing

Keep the existing Vercel project linked to `albin-holmgren/2Hands`. Set:

- Framework: Astro
- Root Directory: `apps/www`
- Production branch: `main`

`apps/www/vercel.json` is committed. Do not deploy `apps/api` to Vercel.

## Stripe products

Create three recurring monthly prices (USD 2000 / 6000 / 20000 cents) named Plus / Pro / Ultra. Put the price IDs in `STRIPE_PRICE_PLUS`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_ULTRA`. Free is not a Stripe product.

Created on the 2Hands Stripe account:

| Plan | Product | Price ID |
|---|---|---|
| Plus $20 | `prod_VBh3n5MRx9Rwda` | `price_1UBJfZEBP02zlWRjvMfzVamO` |
| Pro $60 | `prod_VBh4qK2Ih2k3cm` | `price_1UBJgBEBP02zlWRjEW1x938s` |
| Ultra $200 | `prod_VBh4BcNCfBkEgq` | `price_1UBJgBEBP02zlWRjNY9Wxy6r` |

## E2B

`SANDBOX_PROVIDER=e2b` and `E2B_API_KEY`. Computers pause when idle; the home is checkpointed to `DATA_DIR`. Before running more than one API instance, move homes to Supabase Storage or R2.

## Coding harness

- Cursor: `CURSOR_API_KEY` (Cursor Cloud Agents). Do not siphon Cursor subscription seats into the VM.
- Claude Code: `claude` CLI on the API host, or `ANTHROPIC_API_KEY` / Gateway.
- Codex: `codex` CLI, or Gateway `OPENAI_API_KEY` / `AI_GATEWAY_API_KEY`.

Bot setting `codingHarness`: `none` | `cursor` | `claude` | `codex`. Gated by plan.

## Old product

The previous 2Hands Next.js app is on branch `legacy/v3`. Do not merge it into v1.
