## What

<!-- What does this PR change, in one or two sentences? -->

## Why

<!-- The problem or outcome this serves. Link issues: Fixes #123 -->

## Checks

- [ ] `pnpm typecheck` passes
- [ ] `pnpm --filter @2hands/web test:unit` passes
- [ ] Touches credentials/secret paths → `pnpm --filter @2hands/web test:integration:canary` run against local Supabase
- [ ] New Supabase migration is additive, timestamped after every existing file
- [ ] No new npm dependency without discussion (or it's justified below)
- [ ] No frozen-contract change (docs/v3/IMPLEMENTATION_MAP.md §3) — or an RFC issue is linked

## Notes for reviewers

<!-- Anything that needs extra attention: security boundaries, migrations, UI screenshots. -->
