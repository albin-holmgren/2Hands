# Native workflow checks

Run these flows against a development build configured for a local fixture API and a dedicated test
account. They create test conversations and can start the fixture computer. Do not point this suite
at a production account. These local fixture builds use `com.rakazo.app`; production builds use
the operator's explicitly configured store identifiers.
The smoke flow clears the simulator's Keychain as well as app data so authentication starts fresh;
run it only on an isolated test simulator. Use English system language so Maestro can dismiss OS permission
prompts. For iOS Release simulator builds, keep Xcode simulator signing enabled
(`CODE_SIGN_IDENTITY=-`, `CODE_SIGNING_ALLOWED=YES`): disabling it removes simulated Keychain
entitlements and prevents SecureStore from saving a session. This local signature does not qualify
the binary for App Store distribution.

```sh
maestro test -e RAKAZO_E2E_EMAIL=test@example.test -e RAKAZO_E2E_PASSWORD=test-password \
  -e RAKAZO_E2E_BOT_NAME=Native-check -e RAKAZO_E2E_MESSAGE=Hello .maestro/smoke.yaml
```

`smoke.yaml` checks auth, the workspace sheet, composer model picker, message send, and computer
control. It captures screenshots of the native workspace sheet, models, and conversation.

`workspace-drafts.yaml` requires two bots in different workspaces in that local fixture, with no
existing composer text. Pass their deep links as `RAKAZO_E2E_PRIMARY_THREAD_LINK` and
`RAKAZO_E2E_SECONDARY_THREAD_LINK`, for example
`rakazo://thread?botId=test-bot&spaceId=test-workspace&name=Test`. The flow verifies text survives
navigation and an app restart, and never follows the user into the other workspace. Draft text,
reply metadata, and attachment references are saved in private app files scoped to the authenticated
account, server, workspace, and conversation. Attachment bytes stay in private picker caches; if the
OS clears a cache file, its draft asks the user to attach it again. Signing out removes draft records.
The restart sequence follows [Maestro's process-death guidance](https://docs.maestro.dev/reference/commands-available/killapp).

`preview-recovery.yaml` uses the same signed-in fixture and primary thread link with the fake sandbox's
unsupported screen URL. It checks the themed unavailable state, retry, and takeover/release controls.
This verifies failure recovery, not a live computer stream.

Run both flows in the light and dark appearance settings from Account. Native UI screenshots require
an iOS Simulator or Android emulator; web CI screenshots do not represent these screens.
