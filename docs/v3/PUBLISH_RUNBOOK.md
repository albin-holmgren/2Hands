# Go-public runbook

**Status: the history problem is solved.** The original repository (with
161 secret leaks in old commits — gitleaks 8.30.1 across 862 pre-v3
commits) was renamed to the private `2Hands-old`; this repository was
recreated empty and receives a fresh, scan-clean history. Step 1 (credential
rotation) is still REQUIRED — the leaked keys sat in a GitHub-hosted repo
for months and remain in `2Hands-old`'s history.

## 1. Rotate every leaked credential (MANDATORY, before anything else)

Found in history (mostly commit `93898ce2`, files `.env.production`,
`apps/web/.env.production`, `apps/web/.env.preview`, plus committed `.next/`
build output):

| Credential | Where to rotate |
|---|---|
| **Stripe LIVE secret key** (`sk_live_…`) | Stripe Dashboard → Developers → API keys → roll |
| **Stripe webhook secret** (`whsec_…`) | Stripe Dashboard → Webhooks → roll signing secret |
| Stripe publishable key (`pk_live_…`) | rolls together with the secret key |
| **Supabase service-role JWT** (long `eyJ…`, ~1054 chars) | Supabase Dashboard → Settings → API → rotate JWT secret (invalidates anon + service role) |
| Supabase anon JWT (`eyJ…`, ~212 chars) | same rotation |
| Vercel token (`vck_…`) | Vercel → Settings → Tokens → revoke |
| Two 64-hex keys (encryption/signing) | regenerate (`openssl rand -hex 32`) and update the deploy env |
| 30-char and 23-char app secrets (`2hands_cron…`, etc.) | regenerate in the deploy env |
| Anything else in those env files | assume compromised; rotate |

Rotation is required **even if history is rewritten** — the keys sat in a
GitHub-hosted repo and in every clone.

## 2. History strategy — DONE (fresh history)

Chosen by recreating the GitHub repo empty: `main` here is a fresh history
containing only the released tree. The granular development history remains
available locally (branch `v3/build`) and can be pushed to the private
`2Hands-old` for archival. The original Option A (git-filter-repo purge) is
kept below for reference only.

### (reference) Option A — purge history

**Option A — purge history (recommended).** Keeps commit history, removes
the secret files and the committed build output (also shrinks the ~474 MB
pack dramatically):

```bash
brew install git-filter-repo
git clone https://github.com/albin-holmgren/2Hands.git 2hands-clean && cd 2hands-clean
git filter-repo --invert-paths \
  --path .env.production --path apps/web/.env.production --path apps/web/.env.preview \
  --path-glob 'apps/web/.next/**' --path-glob '**/.next/**'
git remote add origin https://github.com/albin-holmgren/2Hands.git
git push --force --all origin && git push --force --tags origin
```

Then re-run the scan and expect zero: `gitleaks git --log-opts="--all" .`
(after a clean rewrite, `.gitleaksignore` can be emptied).
Force-pushing rewrites every SHA — re-clone all working copies afterwards.

**Option B — fresh history.** Squash the current tree into a new initial
commit on a new `main`. Simplest and smallest, loses per-commit history.

## 3. Push and merge (already prepared locally)

```bash
cd ~/Desktop/2Hands/repo
git push -u origin v3/build
gh pr create --base main --head v3/build \
  --title "2Hands v3: voice-first delegation OS — full build" \
  --body-file docs/v3/HANDOFF.md
gh pr merge --merge
```

## 4. Repo metadata (Hermes-style)

```bash
gh repo edit albin-holmgren/2Hands \
  --description "Voice in. Work happens. Proof out. — the voice-first AI delegation OS" \
  --homepage "https://2hands.ai" \
  --add-topic ai --add-topic ai-agent --add-topic ai-agents --add-topic agents \
  --add-topic voice --add-topic delegation --add-topic claude --add-topic codex \
  --add-topic anthropic --add-topic openai --add-topic nextjs --add-topic expo \
  --add-topic supabase --add-topic playwright --add-topic typescript \
  --add-topic open-source
```

## 5. Flip visibility (ONLY after steps 1–2)

```bash
gh repo edit albin-holmgren/2Hands --visibility public --accept-visibility-change-consequences
```

## 6. After going public

- Branch protection on `main` (require the CI + Secret Scan checks).
- Enable secret scanning + push protection (Settings → Code security).
- Tag `v3.0.0` and write a release using the handoff highlights.
- Optional Hermes-style extras: a banner image in `assets/`, README
  translations, Discord/community link in the badge row.
