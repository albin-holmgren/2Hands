# Governance

## Current phase: single-maintainer (pre-release)

The project is maintained by its founder (@albin-holmgren), who has final
say on roadmap, releases, and disputed changes.

## Decision making

- Routine changes: PR review by a maintainer.
- Security-sensitive areas (see `CODEOWNERS`): require maintainer review;
  the canary and injection test gates must pass.
- Breaking changes to frozen v3 contracts (`docs/v3/IMPLEMENTATION_MAP.md`
  §3): require an RFC issue describing migration impact before any PR.

## Roadmap

`docs/` in the v3 documentation package holds the build sequence. Public
roadmap issues will be labeled `roadmap` once the repository opens.

## Future

When regular external contributors emerge, this document will be revised to
add a maintainer team, contribution ladder, and release rotation.
