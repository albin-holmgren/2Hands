# E2E Smoke Tests

Critical path smoke tests for 2Hands launch-blocking regressions.

## Test Coverage

| Flow | File | Description |
|------|------|-------------|
| 1. Signup | `smoke.spec.ts` | User signup → lands in dashboard |
| 2. Login | `smoke.spec.ts` | Protected routes require auth |
| 3. Create Agent | `smoke.spec.ts` | Agent creation via chat |
| 4. Chat Message | `smoke.spec.ts` | Send message → receive response |
| 5. Stripe Checkout | `smoke.spec.ts` | API returns session URL (mocked) |
| 6. Settings Update | `smoke.spec.ts` | Settings persist correctly |

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Install Playwright browsers

```bash
pnpm --filter @2hands/web exec playwright install
```

### 3. Configure environment variables

Create `.env.local` in `apps/web/`:

```bash
# Required for Supabase
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Optional: Enable authenticated tests
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=your-test-password
```

> **Note**: Tests that require real authentication will skip if `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` are not set.

## Running Tests

### Run all smoke tests

```bash
pnpm --filter @2hands/web test:e2e:smoke
```

### Run with UI mode (debugging)

```bash
pnpm --filter @2hands/web exec playwright test tests/e2e/smoke.spec.ts --ui
```

### Run specific test

```bash
pnpm --filter @2hands/web exec playwright test -g "should login and access dashboard"
```

### Run in headed mode (see browser)

```bash
pnpm --filter @2hands/web exec playwright test tests/e2e/smoke.spec.ts --headed
```

### Generate HTML report

```bash
pnpm --filter @2hands/web exec playwright show-report
```

## CI Commands

### GitHub Actions

The workflow is configured in `.github/workflows/e2e-smoke.yml`.

Required secrets:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TEST_USER_EMAIL` (optional)
- `TEST_USER_PASSWORD` (optional)

### Manual CI run

```bash
# Build first
pnpm --filter @2hands/web build

# Run smoke tests (Chromium only for speed)
CI=true pnpm --filter @2hands/web exec playwright test tests/e2e/smoke.spec.ts --project=chromium
```

## API Mocking

External APIs are mocked to ensure reliable CI runs:

- **Anthropic API** (`/api/chat`): Returns mock assistant responses
- **Stripe API** (`/api/stripe/checkout`): Returns mock session URL
- **Agent API** (`/api/agents`): Returns mock agent data
- **Settings API** (`/api/settings`): In-memory mock storage

## Writing New Smoke Tests

1. Add test to `smoke.spec.ts`
2. Use existing mock utilities (`mockAnthropicAPI`, `mockStripeCheckout`, etc.)
3. Skip tests that require real credentials:
   ```typescript
   test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL and TEST_USER_PASSWORD')
   ```
4. Focus on critical user paths only

## Troubleshooting

### Tests timeout

- Increase timeout in `playwright.config.ts`
- Check if dev server is running on port 3000

### Auth tests fail

- Verify `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` are set
- Ensure test user exists in Supabase
- Check Supabase connection

### Selectors not found

- Update selectors in `setup/test-data.ts`
- Add `data-testid` attributes to components
