# Native workflow checks

Run these flows against a development build configured for a local fixture API and a dedicated test
account. They create test conversations and can start the fixture computer. Do not point this suite
at a production account. These local fixture builds use `com.rakazo.app`; production builds use
the operator's explicitly configured store identifiers.
The smoke flow clears app data and, on iOS, the simulator's Keychain so authentication starts fresh;
run it only on an isolated test device. Use English system language so Maestro can dismiss OS permission
prompts. For iOS Release simulator builds, keep Xcode simulator signing enabled
(`CODE_SIGN_IDENTITY=-`, `CODE_SIGNING_ALLOWED=YES`): disabling it removes simulated Keychain
entitlements and prevents SecureStore from saving a session. This local signature does not qualify
the binary for App Store distribution.

For Android, generate the ignored native project with `expo prebuild --platform android --no-install`
and build a local Release APK with `./gradlew :app:assembleRelease`. The first build needs the SDK/NDK
versions requested by Expo and React Native. On memory-constrained hosts, build before booting the
emulator, limit Gradle to two workers, and allow enough JVM metadata memory for Kotlin and release lint
(the verified local build used `-Xmx2048m -XX:MaxMetaspaceSize=1536m`). Start the dedicated emulator
with `-no-window -no-audio -no-snapshot` and always pass its explicit device ID to adb and Maestro.
For an HTTP loopback fixture, Android reaches the host at `10.0.2.2`; permit that address only in the
generated test build's network-security configuration. Production builds continue to require HTTPS.

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
Flows wait for the signed-in inbox before sending a deep link, so the link reaches mounted navigation
on Android as well as iOS.

`preview-recovery.yaml` uses the same signed-in fixture and primary thread link with the fake sandbox's
unsupported screen URL. It checks the themed unavailable state, retry, and takeover/release controls.
This verifies failure recovery, not a live computer stream.

`appearance.yaml` captures Account, the conversation, both pickers, and creation dialogs. Pass the
primary thread link and `RAKAZO_E2E_APPEARANCE=light`, `dark`, or `system`. To verify Android system
appearance, set the isolated device to night mode, run with `system`, then run with `light` while
night mode stays enabled; inspect the screenshots to verify the explicit preference wins.

`composer.yaml` captures the writing area with the keyboard and model sheet, restores its draft
after opening the computer, then sends a follow-up while a scripted run is active and stops the run.
Use the primary thread link and the scripted fixture runtime: its “Keep working until I stop you”
prompt deliberately stays active until the Stop control is pressed.

`bot-actions.yaml` checks that Delete is available in the thread menu on both platforms, cancels
the deletion confirmation, and restarts the app to verify the bot remains. Pass the primary thread
link and its matching `RAKAZO_E2E_BOT_NAME`; the flow never confirms a deletion.

Run the flows in the light and dark appearance settings from Account. Native UI screenshots require
an iOS Simulator or Android emulator; web CI screenshots do not represent these screens.
