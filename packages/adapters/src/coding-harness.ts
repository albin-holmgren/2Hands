import type { AdapterContext, ComputerRef, SandboxProvider } from "@rakazo/adapter-kit";
import type { CodingHarness } from "@rakazo/core";

export type CodingHarnessRunInput = {
  harness: Exclude<CodingHarness, "none">;
  prompt: string;
  repoUrl?: string;
  cwd?: string;
};
export type CodingHarnessRunResult = {
  ok: boolean;
  harness: Exclude<CodingHarness, "none">;
  summary: string;
  code?: "HARNESS_UNAVAILABLE" | "HARNESS_FAILED" | "CANCELED";
};
export type HarnessExecution = {
  sandbox?: SandboxProvider;
  computer?: ComputerRef;
  context?: AdapterContext;
  /** Resolve a lazy computer before checking the actual isolation boundary. */
  prepareComputer?: () => Promise<void>;
  /** Only a user-owned key may enter their sandbox. Never pass deployment credentials. */
  credential?: { provider: string; apiKey: string };
};
const MAX_OUTPUT_BYTES = 256 * 1024;
const RUN_TIMEOUT_MS = 10 * 60 * 1000;
const isHostComputer = (computer: ComputerRef): boolean => computer.kind === "desktop";

/** Coding agents execute only inside the user's computer, never in the API/worker process. */
export async function runCodingHarness(
  input: CodingHarnessRunInput,
  execution: HarnessExecution = {},
): Promise<CodingHarnessRunResult> {
  const fail = (summary: string, code: CodingHarnessRunResult["code"] = "HARNESS_UNAVAILABLE") => ({
    ok: false,
    harness: input.harness,
    summary,
    code,
  });
  const prompt = input.prompt.trim();
  if (!prompt) return fail("A coding prompt is required.");
  const { sandbox, computer, context, credential } = execution;
  if (!sandbox || !computer || !context || !input.cwd) {
    return fail("This coding agent needs an available workspace computer.");
  }
  if (isHostComputer(computer)) {
    return fail("Coding agents require an isolated workspace computer.");
  }
  if (input.harness === "cursor") {
    return fail(
      "Cursor handoff needs a workspace-scoped Cursor connection. Use the workspace coding tools meanwhile.",
    );
  }
  if (context.signal.aborted) return fail("Coding task canceled.", "CANCELED");
  const env: Record<string, string> = {};
  if (credential) {
    if (input.harness === "claude" && credential.provider === "anthropic")
      env.ANTHROPIC_API_KEY = credential.apiKey;
    if (input.harness === "codex" && credential.provider === "openai")
      env.OPENAI_API_KEY = credential.apiKey;
  }
  const controller = new AbortController();
  const signal = AbortSignal.any([context.signal, controller.signal]);
  const argv =
    input.harness === "claude"
      ? ["claude", "-p", prompt, "--output-format", "text"]
      : ["codex", "exec", "--skip-git-repo-check", prompt];
  let output = "";
  let bytes = 0;
  let exitCode: number | undefined;
  try {
    await execution.prepareComputer?.();
    const preparedComputer = { ...computer };
    if (isHostComputer(preparedComputer)) {
      return fail("Coding agents require an isolated workspace computer.");
    }
    if (context.signal.aborted) return fail("Coding task canceled.", "CANCELED");
    for await (const event of sandbox.execute(
      preparedComputer,
      {
        argv,
        cwd: input.cwd,
        env,
        timeoutMs: RUN_TIMEOUT_MS,
      },
      { ...context, signal },
    )) {
      if (event.type === "exit") {
        exitCode = event.code;
        continue;
      }
      bytes += new TextEncoder().encode(event.data).byteLength;
      if (bytes > MAX_OUTPUT_BYTES) {
        controller.abort();
        return fail(
          "Coding agent exceeded the output limit. Review the workspace files before retrying.",
          "HARNESS_FAILED",
        );
      }
      output += event.data;
    }
    if (context.signal.aborted) return fail("Coding task canceled.", "CANCELED");
    if (exitCode === 127)
      return fail(
        `Install and sign in to ${input.harness === "claude" ? "Claude Code" : "Codex"} on this workspace computer first.`,
      );
    if (exitCode !== 0)
      return fail(
        output.trim() || "The coding agent did not finish successfully.",
        "HARNESS_FAILED",
      );
    return {
      ok: true,
      harness: input.harness,
      summary: output.trim() || "Coding agent finished. Review the workspace changes.",
    };
  } catch {
    return fail(
      context.signal.aborted
        ? "Coding task canceled."
        : "The workspace coding agent could not run. Check its installation and sign-in.",
      context.signal.aborted ? "CANCELED" : "HARNESS_FAILED",
    );
  }
}
