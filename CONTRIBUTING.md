# Contributing to 2Hands

Thanks for your interest. 2Hands is open source under the
[MIT License](LICENSE); contributions are accepted under the same license.

## Development setup

See [docs/v3/QUICKSTART.md](docs/v3/QUICKSTART.md) for the full local
demo-mode setup (pnpm, local Supabase, deterministic providers).

## Pull requests

1. Branch from `main`; keep PRs focused on one concern.
2. Run the checks:
   ```bash
   pnpm typecheck && pnpm lint
   cd apps/web && pnpm test:unit
   pnpm test:integration          # with local supabase running
   pnpm test:integration:canary   # if your change touches credentials/secrets
   ```
3. Additive Supabase migrations only; new timestamps strictly after every
   existing migration.
4. Security-sensitive areas (`packages/secret-broker`, `packages/browser`,
   `apps/web/src/lib/v3/secure-input.ts`, auth orchestrator, RLS policies)
   require a maintainer review — see `CODEOWNERS`.
5. No new npm dependencies without discussion in the PR description.

## Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Security issues

Never open a public issue for a vulnerability — see [SECURITY.md](SECURITY.md).
