#!/usr/bin/env bash
#
# Submit the latest iOS build to TestFlight.
#
# Why this script exists instead of plain `eas submit`:
#
#   * `eas submit --non-interactive` needs the App Store Connect API key, and
#     the only place eas-cli reads it from is eas.json — the EXPO_ASC_* env
#     vars are honoured by the credentials service, not by submit.
#   * Storing the key on EAS servers (`eas credentials` → App Store Connect)
#     requires an interactive Apple ID password + 2FA, so it cannot be
#     automated.
#   * eas.json is committed to a public repo, so the key path, key id and
#     issuer id must not live there.
#
# So: inject the fields into eas.json just for the duration of the submit, and
# restore the committed file on the way out (including on failure or Ctrl-C).
#
# Prerequisites:
#   * The .p8 exists at ASC_KEY_PATH below.
#   * An app record exists in App Store Connect for the bundle id. Apple's API
#     cannot create one — do it once at https://appstoreconnect.apple.com/apps
#     ("+" → New App). ASC_APP_ID is then resolved automatically.
set -euo pipefail

export ASC_KEY_ID="${ASC_KEY_ID:-US8ZF56A95}"
export ASC_ISSUER_ID="${ASC_ISSUER_ID:-51697330-d623-4658-b51e-44fc95af576d}"
export ASC_KEY_PATH="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8}"
export BUNDLE_ID="${BUNDLE_ID:-com.2hands.app}"
export PROFILE="${PROFILE:-production}"

cd "$(dirname "$0")/.."

[ -f "$ASC_KEY_PATH" ] || { echo "No App Store Connect key at $ASC_KEY_PATH" >&2; exit 1; }

# Resolve the numeric App Store Connect app id from the bundle id, so a stale
# ascAppId in eas.json can never send the build to the wrong app.
# Assign first, export second: `export X="$(cmd)"` takes export's exit status,
# which is always 0, so a failing lookup would sail past `set -e`.
APP_ID="$(node scripts/asc-app-id.mjs)"
export APP_ID

echo "Submitting $BUNDLE_ID → App Store Connect app $APP_ID"

restore() { git checkout -- eas.json 2>/dev/null || true; }
trap restore EXIT INT TERM

node -e '
  const fs = require("fs")
  const j = JSON.parse(fs.readFileSync("eas.json", "utf8"))
  const ios = j.submit[process.env.PROFILE].ios
  ios.ascAppId = process.env.APP_ID
  ios.ascApiKeyPath = process.env.ASC_KEY_PATH
  ios.ascApiKeyId = process.env.ASC_KEY_ID
  ios.ascApiKeyIssuerId = process.env.ASC_ISSUER_ID
  fs.writeFileSync("eas.json", JSON.stringify(j, null, 2) + "\n")
'

eas submit --platform ios --profile "$PROFILE" --latest --non-interactive
