# Registered Stripe HTTPS delivery gate

This opt-in check verifies a real Stripe sandbox event reaching a registered public HTTPS webhook destination, the production billing handler's 200 response, the local paid allowance, and two real Stripe redeliveries. It uses only a disposable loopback database and resources that it creates in the explicitly selected sandbox.

The existing [payment lifecycle gate](stripe-release-gate.md) verifies Checkout, renewal, cancellation, and signed event replay in process. Neither an in-process replay nor `stripe listen --forward-to` is evidence that a registered HTTPS destination received and acknowledged an event. The Stripe CLI relay receives events through the CLI connection and forwards them locally using its listener secret. This gate registers an actual destination and uses that destination's signing secret. [Stripe webhook testing](https://docs.stripe.com/webhooks), [CLI forwarding](https://docs.stripe.com/cli/listen).

## Verified release run — 2026-09-06

The registered sandbox HTTPS destination passed with the current invoice coverage guard. An actual paid Checkout completed through Stripe's hosted form; Stripe delivered its signed event, the production route returned HTTP 200, and the disposable database received Plus's $10 allowance. Stripe reported zero pending deliveries for that event. Two real resends through the official CLI also returned HTTP 200, while one deduplicated billing event retained $0.25 spent and $0 reserved.

The manifest reported `complete: true` and `cleanupComplete: true`, with no failures. This was public delivery to a temporary registered destination, not a CLI relay or locally signed replay. No production customer or database was used. The result verifies this endpoint code over the public network; deployment configuration and live-mode payments remain outside its scope. The separate [renewal-only gate](stripe-release-gate.md) passed the paid renewal, cancellation and failed-renewal scenarios.

## Inputs

Install the official Stripe CLI and Cloudflare `cloudflared` separately; the runner does not install software. Supply these values through the process environment, never a tracked file:

- `VERIFY_STRIPE_TEST_MODE=1`: authorize disposable test objects and the temporary webhook destination.
- `STRIPE_TEST_SECRET_KEY`: an `sk_test_` or appropriately permissioned `rk_test_` key from the existing dedicated sandbox.
- `STRIPE_TEST_ACCOUNT_ID`: the expected sandbox account ID. The runner compares Stripe's account response and requires `livemode=false` before creating resources.
- `TEST_DATABASE_URL`: a fresh, migrated-by-the-runner PostgreSQL database on loopback with a name ending in `_test`. Query overrides and fragments are rejected. No database tunnel is permitted.
- Optional `STRIPE_CLI_BIN` and `CLOUDFLARED_BIN`: executable paths when the tools are not on `PATH`.

The test key needs read access to its account, balance and events, and access to create/delete webhook endpoints, customers, Checkout Sessions, products and prices, plus the subscription/invoice reads used by the production handler. The CLI receives the same test key only through its environment for redelivery. It does not reuse an authenticated live CLI context or pass credentials in command arguments.

After supplying credentials separately:

```sh
VERIFY_STRIPE_TEST_MODE=1 \
TEST_DATABASE_URL='postgres://test:test@127.0.0.1:55439/stripe_delivery_test' \
pnpm exec tsx packages/testkit/src/cli/stripe-delivery.ts
```

The runner creates one Plus test price, one synthetic owner/customer and one Checkout. Open the Checkout URL saved in the private temporary `checkout-url.txt`, and complete it with Stripe's `4242 4242 4242 4242` test card, fake personal information, future expiry and any three-digit CVC. No browser is opened automatically. The runner waits up to ten minutes for completion and has a fifteen-minute main-work deadline.

## What is exposed and verified

The local server binds only to `127.0.0.1` and exposes one random 192-bit POST path through a free temporary Cloudflare Quick Tunnel. Every other path and method returns 404. Missing signatures return 400; the unchanged `mountStripeWebhook` implementation verifies the actual destination signature before handling billing. Requests are capped at 1 MiB with bounded headers, request timeouts and connections. The runner captures only capped diagnostic output; it never prints credentials, payloads, Checkout URLs or the public tunnel URL. Quick Tunnels are temporary testing infrastructure, not the hosted product's deployment. [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

The registered destination subscribes to all six supported snapshot events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed`. The checkout customer is bound only to the new local organization. Other sandbox customers have no local binding and receive no entitlement changes.

A pass requires an actual completed and paid test Checkout, a received signed `checkout.session.completed` with handler status 200, Plus's $10 allowance, and Stripe reporting no pending deliveries for that event. If another sandbox endpoint is failing, Stripe's aggregate pending-delivery count can keep this check red; inspect that test destination separately without changing unrelated endpoints. [Stripe Event delivery state](https://docs.stripe.com/api/events/object).

The runner records $0.25 of synthetic usage locally, asks the official CLI to resend that exact event twice to the new destination, and waits for both handler acknowledgements. It then requires one deduplicated billing event and the same $10 allowance with $0.25 spent. It does not fabricate a Checkout completion or generate local signatures for these deliveries. [Official event resend command](https://docs.stripe.com/cli/events/resend).

## Cleanup and limits of this evidence

The private `manifest.json` records resource IDs, checks, delivery counts and cleanup status. On success or failure, cleanup deletes the destination first, expires an open Checkout, deletes the synthetic customer, archives the test price/product, removes the local synthetic owner/organization, stops the tunnel/server and closes database connections. A cleanup error fails the command. After a forced process kill, use only that manifest's IDs in the dedicated sandbox to finish cleanup; never bulk-delete the sandbox's existing objects.

This setup requires no Fly app, Fly volume, production database, production customer, model key or computer provider. Do not run it through the production `fly.toml` or `infra/fly/start.sh`: those belong to the real application and start migrations plus Graphile against configured storage. A passing tunnel gate establishes real Stripe delivery to the current endpoint code. It does not establish that the deployed Fly revision, its six-event subscription, live price IDs, default portal configuration or signing secret are correct. Those remain separate configuration and controlled-deployment checks.

## Read-only catalog and portal check

The catalog checker makes only Stripe GET requests and prints boolean results. It needs `STRIPE_TEST_SECRET_KEY`, the explicit `STRIPE_TEST_PRICE_PLUS`, `STRIPE_TEST_PRICE_PRO` and `STRIPE_TEST_PRICE_ULTRA` IDs, and `STRIPE_TEST_WEBHOOK_ENDPOINT_ID` with its expected HTTPS `STRIPE_TEST_WEBHOOK_URL`. It does not use the disposable delivery gate's archived prices as deployment configuration.

```sh
pnpm exec tsx packages/testkit/src/cli/stripe-catalog.ts
```

It checks active test products and USD monthly prices of $20/$60/$200, the default portal actually used by the app, payment-method updates, invoice history, cancellation at period end without proration, disabled portal plan switching, and an enabled destination with all six billing events. API reads cannot prove that a customer completed a portal action; verify that separately with a synthetic subscriber.

The management portal enables payment-method changes, invoices and cancellation at period end. Paid plan changes are managed by the app at renewal and verified by the [Test Clock gate](stripe-release-gate.md). Do not enable immediate or prorated portal upgrades: a partial-period charge does not fund the new full monthly allowance. [Portal configuration](https://docs.stripe.com/api/customer_portal/configurations/object), [subscription schedules](https://docs.stripe.com/billing/subscriptions/subscription-schedules).
