# Stripe payment release gate

Run this before opening paid signup. A successful offline suite does not establish that a real Stripe account, Checkout, or webhook destination is configured correctly.

## Verified release evidence — 2026-09-06

The dedicated sandbox's renewal-only run passed against the full-period invoice coverage guard. A real Test Clock verified a Plus → Pro change charging the full $60 at renewal and granting $30 once, with duplicate and delayed events preserving settled usage. It also verified pending-change undo, cancellation undo, paid access until cancellation takes effect, and no paid allowance after a declined scheduled renewal. All three recorded scenario checks passed, and the manifest reported `complete: true` and `cleanupComplete: true`.

A separate [registered HTTPS delivery run](stripe-delivery-gate.md) completed real sandbox Checkout through Stripe's hosted form and received its signed public webhook with HTTP 200 and the $10 Plus grant. Two official Stripe redeliveries preserved one billing event and the existing $0.25 of synthetic usage; cleanup completed. The renewal-only run did not repeat the incomplete-subscription or direct initial Pro/Ultra checks. These results use synthetic customers and disposable local storage; they do not verify live charges or the deployed application's revision and configuration.

## Prerequisites

- A **dedicated Stripe sandbox**, containing only synthetic test data. Supply its secret key as `STRIPE_TEST_SECRET_KEY` through your local secret manager or shell environment. The gate never reads `.env`, `STRIPE_SECRET_KEY`, existing customer IDs, or existing price IDs.
- Set `VERIFY_STRIPE_TEST_MODE=1` to authorize creating and deleting test customers, subscriptions, and Test Clocks. Both `sk_test_` and appropriately permissioned `rk_test_` keys are accepted; live and publishable keys are rejected. The runner checks Stripe's `livemode` response before creating anything.
- A disposable PostgreSQL database on loopback, with a database name ending in `_test`. Supply `TEST_DATABASE_URL`; the runner applies repository migrations but does not delete the database. Never use a tunnel to another database.
- Key permissions for Balance (read-only), Events (read-only), Customers, Payment Methods, Products, Prices, Checkout Sessions, Subscriptions, and Test Clocks. The runner creates fresh $20/$60/$200 monthly test prices; no existing catalog configuration is required.

For example, after supplying the test key separately:

```sh
VERIFY_STRIPE_TEST_MODE=1 \
TEST_DATABASE_URL='postgres://test:test@127.0.0.1:55439/stripe_release_test' \
pnpm test:stripe:preflight

VERIFY_STRIPE_TEST_MODE=1 \
TEST_DATABASE_URL='postgres://test:test@127.0.0.1:55439/stripe_release_test' \
pnpm test:stripe
```

Preflight only validates explicit configuration and makes no network requests. Missing credentials fail the command; they do not produce a green skipped release gate. Ordinary `pnpm test` skips the live canary.

## Complete one real test Checkout

The runner writes a Checkout URL to `checkout-url.txt` in a private temporary directory and prints that file's path. Open the URL yourself. Use the supplied synthetic customer and Stripe's test card `4242 4242 4242 4242`, any future expiry, any three-digit CVC, and a fictitious postal code. Do not enter real payment or personal information. The success redirect points to loopback; it is fine if no UI is running there.

The runner waits up to ten minutes for Stripe to confirm that this actual session is complete and paid. It never opens a browser, manufactures Checkout completion, or uses a private Stripe endpoint. Stripe's public API has no session-completion endpoint, and its hosted forms have measures that prevent automated frontend testing. [Checkout API](https://docs.stripe.com/api/checkout/sessions), [automated testing](https://docs.stripe.com/automated-testing), [test cards](https://docs.stripe.com/testing).

After that step, the runner automatically verifies:

1. Concurrent checkout requests reuse one session; unfinished checkout grants only Free.
2. The real completed checkout grants Plus's $10 allowance.
3. A real incomplete subscription grants no paid allowance.
4. Paid Pro and Ultra invoices grant $30 and $100.
5. A Test Clock schedules Plus → Pro at renewal, preserving current usage. The next invoice charges the full $60 monthly price and grants $30 once.
6. Duplicate deliveries and delayed prior-period events retain already settled usage.
7. `cancel_at_period_end` keeps paid access through the period's end; cancellation then returns to Free, and delayed renewal cannot revive the subscription.
8. Pending downgrades can be undone. Cancellation releases the app's schedule without ending the paid period; cancellation can also be undone.
9. A separate Test Clock reaches a scheduled Pro renewal with Stripe's decline-after-attachment test card. The failed invoice and delayed/duplicate events grant no new paid allowance.

For a focused repeat of the renewal, plan-change and cancellation scenarios, run `pnpm test:stripe -- --renewal-only` with the same explicit sandbox key and disposable database. This skips Checkout and direct initial plan-grant checks; it is not evidence of completing Checkout.

All paid plan changes use app-managed subscription schedules and take effect at renewal. The settings screen confirms the new monthly price and renewal date before a write. Current credit stays intact until the next period is paid. Existing promotion discounts are preserved without restarting them. The management portal must keep subscription updates disabled; its payment-method and invoice controls remain available. Since Stripe's portal cannot cancel a subscription with a pending schedule, the app provides cancellation and undo controls. Unrecognized schedules are left untouched. [Subscription schedules](https://docs.stripe.com/billing/subscriptions/subscription-schedules), [portal limitations](https://docs.stripe.com/customer-management).

Stripe requires schedule creation from an existing subscription and metadata tagging to be separate calls. The backend first stores a nonsecret request key on the owned subscription. If a response is lost, the settings flow replays that key and verifies the returned schedule ID before recovering it. An uncertain request older than 23 hours stops for operator reconciliation rather than assuming ownership after Stripe's guaranteed retention window. Inspect only that organization's subscription, request log and attached schedule before clearing the intent; do not overwrite a manually managed schedule. [Idempotent requests](https://docs.stripe.com/api/idempotent_requests).

The run uses actual Stripe event objects retrieved from the dedicated sandbox. It signs each payload with a temporary local secret and sends it through the production webhook route against the real local database. This verifies signature handling and the full entitlement transaction; it **does not verify Stripe's public network delivery to the deployment**. [Stripe billing testing](https://docs.stripe.com/billing/testing), [Test Clock API](https://docs.stripe.com/billing/testing/test-clocks/api-advanced-usage), [webhook ordering and duplicates](https://docs.stripe.com/webhooks).

## Deployment delivery and catalog check

Use the separate [registered HTTPS delivery gate](stripe-delivery-gate.md) to verify a temporary sandbox destination without exposing the application or touching production storage. Its official Stripe redeliveries verify the same allowance and deduplication boundary over the public network.

Before enabling paid checkout in a deployment, separately verify that its Stripe mode, customer portal configuration, price IDs, and webhook signing secret match that account. The endpoint is `/api/stripe/webhook`. Subscribe it to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed`. Deliver a real test payment event to a disposable staging deployment, confirm a 200 in Stripe, and verify the paid allowance there. Do not reuse test-mode customers or prices for live billing.

An active subscription with an unpaid, draft, unavailable or mismatched latest invoice returns a retryable 503 without changing the last verified allowance. The paid invoice must contain the matching subscription item, price and full non-prorated period. A previous plan or period's payment cannot fund the new one. Payment confirmation and the subsequent retry or `invoice.paid` event reconcile it. Stripe status alone is insufficient proof of payment. [Subscription lifecycle](https://docs.stripe.com/billing/subscriptions/overview).

## Reports and cleanup

The private temporary `manifest.json` records checks, created test object IDs, completion, and cleanup status. The URL and manifest use private filesystem permissions; keep them out of commits and public reports. On both success and failure, the runner deletes its test customers and clocks, archives its test products/prices, and deletes its local synthetic organizations/users. It never touches pre-existing objects. Test prices with transaction history are archived because Stripe does not delete them.

If the process is forcibly interrupted, use the manifest's IDs in the dedicated sandbox to finish cleanup. Stripe also expires Test Clocks automatically. A successful release result requires both the checks and cleanup to complete. An unavailable key or an uncompleted Checkout is a release check still outstanding, not evidence that payments work.
