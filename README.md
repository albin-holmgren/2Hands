# 2hands

[![GitHub stars](https://img.shields.io/github/stars/albin-holmgren/2Hands?labelColor=black&style=for-the-badge&color=2563EB)](https://github.com/albin-holmgren/2Hands/stargazers)

2hands is a hosted Grok Bot alternative: named bots, a shared persistent computer (browser, files, terminal, desktop QA), plugins, and **per-bot model + coding-harness choice** (Cursor, Claude Code, or Codex).

The runtime is [Rakazo](https://github.com/elie222/rakazo) (Apache 2.0). Attribution is in `NOTICE` and `LICENSE`.

Hosted product: [2hands.ai](https://2hands.ai). Plans: Free / Plus $20 / Pro $60 / Ultra $200.

## Features

- Persistent bots with their own conversations, memory, routines, and history
- Shared Team Computers and isolated Private computers (E2B Desktop in production)
- Browser, terminal, file, and graphical desktop access for QA
- Coding handoff to Cursor Cloud Agents, Claude Code, or Codex — Pi stays the orchestrator
- Platform models through Vercel AI Gateway, plus BYOK
- App integrations through Composio or Pipedream Connect, plus user HTTPS MCP / OpenAPI / Treg
- Stripe subscriptions with plan gates on bots, harnesses, plugins, and model tiers

## Stack

- TypeScript
- React 19, Vite, and Tailwind CSS
- Electron and Expo
- Hono and oRPC
- PostgreSQL (Prisma + Better Auth) on Supabase
- Graphile Worker
- Pi
- E2B Desktop (computers), Fly.io (API + worker), Vercel (marketing)
- Stripe, Vercel AI Gateway

## Local development (source checkout)

You need Node.js 22+, pnpm 9, and Docker.

```bash
git clone https://github.com/albin-holmgren/2Hands.git
cd 2Hands
cp .env.example .env
```

Set `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, and `SCREEN_PROXY_SECRET` in `.env` to independent
long random values. Docker sandboxes also need a dedicated `SANDBOX_SUPERVISOR_TOKEN`. For hosted
models set `AI_GATEWAY_API_KEY` and `PI_DEFAULT_PROVIDER=vercel-gateway`.

```bash
docker compose --env-file .env -f infra/compose/docker-compose.yml up postgres -d
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm sandbox:build
pnpm dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173), create an account, and create your first bot.

Production layout, secrets, and Stripe prices: [hosting](./docs/2hands-hosting.md).
Self-hosters can still follow Rakazo's [self-hosting guide](./docs/self-host.md).

## Desktop and mobile

The Electron and Expo apps are clients of the same Rakazo API used by the web app.

With the development stack running, launch Electron with:

```bash
pnpm --filter @rakazo/desktop dev
```

Installed 2hands builds open https://2hands.ai on first launch. A saved custom server takes
precedence. Development builds show setup for a local stack (`http://127.0.0.1:5173`) or an existing
server. Public servers must use HTTPS; HTTP is accepted only for loopback and private LAN addresses
(not link-local). The app verifies the server's health endpoint before saving.

Use **Change Server…** in the application menu to reconnect. Closing that window without
saving returns to the previous instance. For development automation, set `RAKAZO_WEB_URL` to point
the shell somewhere else without changing the saved instance, or `RAKAZO_FORCE_SETUP=1` to run
setup again.

Electron E2E tests open visible application windows. Run them only when those interactions are
intended, with `RAKAZO_ELECTRON_E2E=1 pnpm --filter @rakazo/desktop test:e2e`. For checks that do not
open apps, use `pnpm --filter @rakazo/desktop check` and `pnpm --filter @rakazo/desktop test`.

Mobile build and release instructions live in [docs/mobile-release.md](./docs/mobile-release.md).

## Web UI language

The web (and Electron-hosted) UI supports English, Deutsch, 한국어, Türkçe, हिन्दी,
Português (Brasil), and 简体中文. Change it under **Settings → Language**. The marketing
homepage (`apps/www`) is available in en/de/ko via footer language links (`/`, `/de/`,
`/ko/`); other marketing pages stay English.

## Development

Rakazo is a TypeScript monorepo built with React, Electron, Expo, Hono, Postgres, Prisma, Graphile
Worker, and Pi.

```text
apps/       web, api, worker, desktop, mobile, and public website
packages/   domain, contracts, persistence, adapters, UI, and test tooling
infra/      local services and computer images
docs/       architecture, operations, and release guides
```

Common checks:

```bash
pnpm lint
pnpm check
pnpm test
pnpm test:integration
pnpm test:e2e
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development workflow and test matrix.

## Documentation

```bash
pnpm test              # unit, property, and in-process contract tests
pnpm test:integration  # Postgres journeys, Graphile jobs, LISTEN/NOTIFY
pnpm test:e2e          # Playwright against the emulated stack
pnpm test:e2e -- --sandbox=e2b # the same deterministic suite against real E2B
pnpm test:e2e -- --sandbox=daytona # the same suite against real Daytona
pnpm test:e2e -- --sandbox=box # the same suite against real Box
pnpm test:topology     # local Docker + Graphile worker recovery (needs Docker)
pnpm test:canary       # live OpenRouter / E2B / Box canaries
pnpm test:canary --provider=e2b # one E2B desktop with a fixed three-minute expiry
# explicit real vision-model + real E2B desktop acceptance test:
COMPUTER_E2E_MODEL=<vision-capable-openrouter-model-id> pnpm test:computer
```

Live canary commands use credentials explicitly supplied in the process environment; they do not load `.env`. Provider selection prevents unrelated credentials from enabling extra checks. Model/API canaries use temporary Postgres, or an explicit loopback `TEST_DATABASE_URL` whose database name ends in `_test`; inherited `DATABASE_URL` is never used.

- [2hands hosting](./docs/2hands-hosting.md)
- [Self-hosting](./docs/self-host.md)
- [Computer runtime and isolation](./docs/computer-runtime.md)
- [Mobile releases](./docs/mobile-release.md)
- [Performance testing](./docs/performance.md)

## Contributing

The Playwright workflow can also be started manually with **Sandbox provider** set to `e2b`, `daytona`, or `box`.
Those options require `E2B_API_KEY`, `DAYTONA_API_KEY`, or `BOX_API_KEY`, keep the deterministic scripted agent runtime, and destroy
the provider machines after the run. The default and all automatic runs remain on `fake`.
Contributions are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull
request. For security vulnerabilities, follow [SECURITY.md](./SECURITY.md) instead of filing a public
issue.

Rakazo is licensed under the [Apache License 2.0](./LICENSE).

Questions and ideas are welcome in the [Rakazo Discord community](https://discord.gg/RWwKa2Sn7h).
