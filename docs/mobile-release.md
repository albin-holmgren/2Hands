# Mobile builds and store releases

2hands' public repository does not contain production App Store Connect,
Google Play, Apple team, or private EAS submission identifiers. Those values
belong in the release operator's private configuration.

Self-hosters normally do not need to publish their own mobile app: the 2hands
client can select a compatible server from the sign-in screen. If you distribute
your own branded build, use your own Expo and store accounts.

## Configure a build

1. Create an Expo project owned by your account. Set `EAS_OWNER` and `EAS_PROJECT_ID` for local
   EAS commands and each EAS build environment. The repository intentionally has no upstream
   Expo owner, project, or update URL. Unlinked local builds disable OTA updates.
2. Set `EAS_IOS_BUNDLE_IDENTIFIER` and `EAS_ANDROID_PACKAGE` to store application identifiers
   owned by your account. Production builds require both; local builds keep `com.rakazo.app`.
3. Configure `EXPO_PUBLIC_API_URL` in the EAS build environment. Production
   builds require a valid HTTPS URL.
4. Keep store application IDs, team IDs, signing credentials, API keys, and
   review-account credentials out of Git.
5. Before a native iOS or Android build, run
   `pnpm --filter @rakazo/mobile exec expo install --check`. Attachment pickers
   and other Expo native modules must match the SDK (SDK 57 needs
   `expo-image-picker@~57.0.16`, not 17.x). Use `pnpm exec expo install --fix`
   from `apps/mobile` if that check fails.

From `apps/mobile`:

```sh
export EAS_OWNER=your-expo-account
export EAS_PROJECT_ID=your-project-uuid
export EAS_IOS_BUNDLE_IDENTIFIER=com.example.twohands
export EAS_ANDROID_PACKAGE=com.example.twohands
eas env:create --environment production --name EXPO_PUBLIC_API_URL --value https://app.example.com --visibility plaintext
eas build --platform ios --profile production
eas submit --platform ios --profile production --latest
```

EAS can prompt for store identity interactively. For automated submission, add
the required identifiers through a private CI configuration or a short-lived
local change that is never committed.

Before submission, verify the production API, account deletion, sign-in,
notifications, store privacy answers, age rating, screenshots, support page,
and review account on a physical device.

## Over-the-air updates

Production and preview builds include `expo-updates` and use the corresponding
EAS Update channel. The runtime version follows the public app version, so bump
`expo.version` whenever native code, config plugins, permissions, or native
dependencies change, then create and submit new store builds.

After the full GitHub Actions test suite passes on `main`, CI publishes a
production OTA update when the revision only changes the mobile JavaScript,
TypeScript, or bundled CSS. CI deliberately skips OTA publishing when native
configuration, modules, dependencies, assets, or the update workflow changed.
The repository needs an `EXPO_TOKEN` Actions secret with access to the linked Expo project,
and repository variables `MOBILE_EAS_OWNER`, `MOBILE_EAS_PROJECT_ID`, `MOBILE_API_URL`,
`MOBILE_IOS_BUNDLE_IDENTIFIER`, and `MOBILE_ANDROID_PACKAGE` matching the store builds.
Only set `MOBILE_RELEASE_ENABLED=true` after the native release gates pass. Production OTA
publishing also validates the Expo identity and API origin before bundling.

To publish a compatible update manually from `apps/mobile`:

```sh
eas update --platform all --channel production --environment production --message "Short description"
```

Installed release builds download a compatible update in the background on
launch and apply it after the next restart. Builds created before
`expo-updates` was configured cannot receive OTA updates and must be replaced
with a new iOS and Android build once.

## Native workflow verification

Run the local native flow suite described in
[`apps/mobile/.maestro/README.md`](../apps/mobile/.maestro/README.md) before a store submission.
It covers workspace switching, model controls, sending, computer control, and isolated drafts.
Check light, dark, and system appearance on both platforms. Native screenshots must come from a
simulator or device; a web screenshot does not validate native layouts or keyboard behavior.
