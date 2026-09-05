# Computer runtime

Rakazo keeps the agent runtime and the computer runtime separate:

```text
chat/API -> one Pi agent session -> Rakazo computer tools -> SandboxProvider -> E2B / Daytona / Box
                                                   |-> Docker
                                                   |-> desktop/fake

SandboxProvider workspace <-> AgentHomeStore <-> Rakazo-owned DATA_DIR
```

Pi runs in the Rakazo API/worker process. It is not installed in, or executed by, E2B. The built-in tools are ordinary Pi tools, not Claude- or MCP-specific tools, so any model exposed through Pi can call them. Screen operation still requires a model that can accept image tool results and reason about screenshots.

## Computer contract

Each workspace gets one Team Computer by default, so bots share its browser sessions and installed tools. Each Team bot starts in `bots/<bot-id>/`, while deliberately shared work belongs in `shared/`. These folders organize work but are not security boundaries: every Team bot can access the full Team workspace. A bot can instead use a Private Computer, where the whole workspace is its home. Team Computer runs use a fenced per-bot database lease, so two Team bots can work at the same time on distinct screens. One bot still runs only one computer-use task on its own screen. When a provider cannot spawn another display, that bot's graphical tools fail with `MULTI_SCREEN_UNAVAILABLE` instead of queueing behind a single computer lock.

`SandboxProvider.describe().capabilities.multiScreen` tells clients whether the backend can allocate distinct Team screens. Fake and Docker providers spawn extra Xvfb stacks inside one machine. E2B and Daytona keep the vendor's primary desktop stream on index 0 and spawn extra Xvfb + x11vnc + preview ports for additional Team bots on the same sandbox. Box exposes its primary desktop but does not ship the secondary-display stack, so its adapter reports `multiScreen: false`. If a provider cannot allocate another display, graphical tools for that bot return `MULTI_SCREEN_UNAVAILABLE` while shell and file tools keep working.

`SandboxProvider` is the provider boundary. A backend must implement:

- lifecycle: provision/reconnect, stop, and destroy;
- desktop: observe, ordered batched actions, user input, and a live screen session;
- execution: commands inside the machine;
- files: list/read/write plus complete workspace import/export.

The model gets `computer_observe`, batched `computer_act`, `open_path`, `launch_app`, `shell`, and file tools. An action can settle and return the resulting screenshot in one call. Identical consecutive frames keep their metadata but omit duplicate image bytes from model context.

Human input and agent input may coexist on distinct Team screens. “Take control” grants the user an exclusive control lease on that bot’s screen so the embedded viewer accepts input. For a Team bot, takeover is refused with HTTP 409 (“Stop the bot first”) while that bot holds a live computer execution lease or an active run, unless the run is `waiting_takeover` (the bot asked for protected input). Stop the bot first, then take control; after release, the agent may continue. `request_takeover` remains available when the model explicitly needs protected input or human judgment.

## E2B backend

The first cloud implementation uses `@e2b/desktop` directly. Rakazo provisions or reconnects the desktop, maintains its authenticated live-view URL, captures PNG observations, performs mouse/keyboard/scroll/app actions, executes shell commands, and accesses files through the E2B SDK.

On Team Computers, bot index 0 uses an authenticated, permanently read-only primary view service and SDK screenshot/input APIs. Additional Team bots get their own Xvfb display, view port (`6080 + 2i`), and interactive control port (`6081 + 2i`) spawned inside the same sandbox via shell commands. Takeover opens a separate authenticated control service for that bot, including the primary display. Its password rotates between leases; revocation must confirm that its listeners closed. New E2B machines deny public traffic at the provider boundary. The screen proxy supplies the provider traffic token only upstream, while the authorized client receives only its scoped VNC password. Legacy public machines are normalized before uncached reconnect returns; rollout must also checkpoint/pause or normalize untouched running machines before public signup.

## Daytona backend

The database stores the provider kind and opaque `providerRef`. That reference is an acceleration path, not durable data. It is passed back only to the same provider kind. A missing machine or a provider-kind change creates a replacement and restores its workspace through the provider-neutral contract.

## Box backend

The Box adapter uses ASCII's official TypeScript SDK for lifecycle, command, desktop, and file operations. It creates and resumes boxes with `noEnv: true`, as required when a third party supplies the API key, and keeps a two-hour TTL refreshed while the computer is active. The provider's authenticated noVNC page is kept behind Rakazo's encrypted screen capability proxy, which binds the view/control policy and keeps the Box desktop secret out of browser-visible URLs; observations and model actions use the same primary `DISPLAY=:0` through ImageMagick and `xdotool`.

Box stop archives the machine and resume reconnects the same opaque box id. Browser profiles live under the portable workspace and are linked into the machine's Chrome/Firefox config, so normal checkpoint/export behavior includes them. Box has one desktop stream per machine, and the Box emulator reproduces that single-screen constraint for deterministic tests.

## Persistence

The portable computer workspace is the durable boundary. E2B uses `/home/user/rakazo-home`; Docker and local providers expose the equivalent home. Browser profiles are rooted under `.browser-profiles` in that workspace on E2B. Rakazo checkpoints transferred workspaces into `AgentHomeStore` at run completion or failure, before explicit stop, and before idle suspension. Docker mounts the Rakazo-owned home directly and only advances its revision marker at those boundaries. New or replacement machines import the latest stored workspace before use.

`LocalAgentHomeStore` currently keeps the latest workspace under `DATA_DIR/homes/<computer-home-key>` and checkpoint metadata separately under `DATA_DIR/home-revisions`. Replacements are staged before the current copy is swapped, and checkpoints are serialized per computer. This implementation is latest-only rather than an immutable revision archive. Production deployments must put `DATA_DIR` on a Rakazo-owned persistent volume, encrypt that volume at rest, and include it in off-host backups. The storage interface is deliberately independent of E2B so an object-store-backed implementation can replace the local volume without changing agent tools or sandbox providers.

Before exporting a remote workspace, remote backends quiesce desktop browsers so profile databases and login state are copied consistently. They exclude only transient cache/lock files inside `.browser-profiles`; similarly named project files remain durable.

The disposable OS image is not a portable disk snapshot. System packages installed outside the workspace are lost when moving to another provider; durable machine customization should be represented by a reproducible image or setup recipe. This is what makes a future backend switch practical instead of trying to translate vendor-specific VM snapshots.

## Verification

Offline tests cover tool-result images, action parsing, provider conformance, workspace checkpoint/restore, provider SDK translation, lifecycle integration, and the Box single-screen emulator. They never call a model or live sandbox.

The bounded provider probe requires only `E2B_API_KEY` in the process environment:

```bash
pnpm test:canary --provider=e2b
```

It provisions one synthetic desktop with a fixed three-minute expiry and checks shell output, a real screen image, and private networking. Through an isolated loopback screen proxy, a minimal RFB client requires password authentication, verifies that view-only input is ignored during takeover, and verifies that control input works. Revocation must close the old stream, and a replacement lease must reject the old password. The probe then checks file preservation across pause/resume and destroys the machine. A missing resource fails the probe instead of allocating a replacement. No model or database is used, and no customer account is created. Cleanup errors fail the command.

The full acceptance test requires Docker (for temporary Postgres), `E2B_API_KEY`, `OPENROUTER_API_KEY`, and a vision-capable OpenRouter model id. An explicit loopback `TEST_DATABASE_URL` ending in `_test` can replace Docker. Supply keys in the process environment; these live commands never load `.env` or reuse an inherited `DATABASE_URL`:

```bash
COMPUTER_E2E_MODEL=<vision-capable-openrouter-model-id> pnpm test:computer
```

It starts the full API, provisions a real E2B desktop, serves a deterministic page inside the sandbox, and asks a real model to observe and click a button. The button creates a server-side marker; the test then requires the model to use terminal and file tools and verifies both the marker and recorded tool calls. Finally, it destroys the provider machine, boots a replacement through the stale provider reference, and verifies that the external checkpoint restored the model-created file. The command is opt-in and is not run by `pnpm test` or CI unless invoked explicitly.
