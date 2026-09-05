# Dependency security review

Reviewed on 2026-09-05 against the release branch's `pnpm-lock.yaml`, the public
maintainer advisories, and the installed call sites. GitHub's default-branch
alerts include duplicate manifest and lockfile findings; they are not a count of
independently reachable application vulnerabilities.

`pnpm audit --json` reports **1 high and 3 moderate version findings** after this
update, down from **7 high, 12 moderate and 1 low**. No advisories were suppressed.
The decoder's version-based finding remains visible even though its fix is
backported and verified locally, as described below.

## Updates

| Dependency | Updated version | Reason |
| --- | --- | --- |
| `fast-uri` | 3.1.6 | Four URI normalization advisories, including [malformed IPv6 normalization](https://github.com/fastify/fast-uri/security/advisories/GHSA-f65p-4m7j-42xc). Used by AJV through the MCP SDK. |
| `mysql2` | 3.23.1 | [Authentication downgrade](https://github.com/sidorares/node-mysql2/security/advisories/GHSA-3f6p-5ww8-9rcr) and [compressed protocol exhaustion](https://github.com/sidorares/node-mysql2/security/advisories/GHSA-rgwj-5xj2-c3m3). Installed through Prisma and auth peers; this application selects PostgreSQL. |
| `nodemailer` | 9.1.1 | [Raw message access-policy bypass](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-p6gq-j5cr-w38f) and preceding mail/TLS fixes. The adapter constructs only `from`, `to`, `subject`, `text`, and `html`; it does not forward arbitrary message options. |
| `qs` | 6.16.0 | [Parser denial of service](https://github.com/ljharb/qs/security/advisories/GHSA-4mjr-xmp4-gh2g) and [array-limit bypass](https://github.com/ljharb/qs/security/advisories/GHSA-w7fw-mjwx-w883). |
| `@xmldom/xmldom` | 0.8.15 and 0.9.12 | [Serialization injection](https://github.com/xmldom/xmldom/security/advisories/GHSA-6gmq-8vp8-gcm6) in both installed release lines. Used by plist/build tooling. |
| `decode-uri-component` | 0.2.2 with an upstream security backport | [Malformed-input exhaustion](https://github.com/SamVerschueren/decode-uri-component/security/advisories/GHSA-vcc3-ghjq-m6fr). Preserves Expo Router's CommonJS dependency contract. |

Transitive overrides apply only to affected version ranges. The existing React
pins remain unchanged. The Nodemailer 8/9 migration changes an unused error code
and makes remote TLS validation stricter; neither changes this adapter's mail
contract. [Version 9.1.1](https://github.com/nodemailer/nodemailer/releases/tag/v9.1.1)
also strengthens content access-policy inheritance.

## Remaining findings

### High: deepmerge-ts 7.1.5

[GHSA-ggr8-5vv4-36mx](https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx)
requires merging cyclic JavaScript object graphs. Plain JSON cannot create this
condition. The only installed consumer is `@prisma/config`, which imports the
merger when reading a local `prisma.config.ts` or JavaScript configuration file.
The repository supplies that configuration; remote configuration extension is
disabled by Prisma. The application's database runtime uses `PrismaPg` and does
not pass request data to this merger.

The patched library starts at 8.0.0. The latest stable
[`@prisma/config` 7.10.0 manifest](https://registry.npmjs.org/@prisma/config/7.10.0)
still pins 7.1.5, so a supported Prisma patch/minor update does not resolve it.
Keep this finding open for an upstream-supported upgrade. Do not run Prisma
configuration files supplied by untrusted users, or force an unverified major
library override into Prisma merely to remove the alert.

### Moderate: uuid 7.0.3 and 10.0.0

[GHSA-w5hq-g745-h8pq](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq)
affects v3/v5/v6 writes into caller-supplied buffers. The installed consumers,
`dockerode` and `xcode`, call only `v4()` without a destination buffer. No affected
call path was found in this application's source. The patched release lines start
at 11.1.1, 12.0.1, and 13.0.1; prefer a supported consumer upgrade over changing their major dependency
contract during this release.

### Reported moderate: decode-uri-component 0.2.2, fix backported

[GHSA-vcc3-ghjq-m6fr](https://github.com/SamVerschueren/decode-uri-component/security/advisories/GHSA-vcc3-ghjq-m6fr)
affects malformed percent-encoded input. Expo Router 57.0.19 installs it through
`query-string` 7.1.3. Without the patch, untrusted deep links could exhaust the
mobile navigation decoder.

The fix is 0.5.0, which is ESM-only. `query-string` 7.1.3 requires the CommonJS
0.2.x API, so replacing it with 0.5.0 as a transitive override is incompatible.
The committed pnpm patch instead backports the maintainer's
[iterative UTF-8 decoder](https://github.com/SamVerschueren/decode-uri-component/commit/fa479dafeede7bedf04e5c89aa78f2a78c664005),
retaining the CommonJS export, 0.2.x plus-to-space behavior, and MIT license.
The lockfile records its content hash; every Docker install context includes the
patch directory. Deterministic regression tests exercise the exact query parser
resolved from Expo Router with malformed UTF-8 and a long hostile query string.
Remove this backport when an upstream Expo Router release supports a patched
parser directly. A version-only audit will continue to report 0.2.2 meanwhile.

## Verification

- Frozen lockfile installation with the project's declared pnpm 9.15.0 and
  lifecycle scripts disabled.
- 57 focused SMTP/MCP and decoder tests, including real offline MIME generation
  through the mail adapter and rejection of unexpected raw message options.
- Adapter and mobile TypeScript checks, Expo dependency validation, and Prisma
  schema/config validation.
- Public advisory recheck with `pnpm audit --json`; no live mail, databases, or
  provider credentials used by the dependency checks.
