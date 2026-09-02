import { spawn } from "node:child_process";
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
  url?: string;
};

const RUN_TIMEOUT_MS = 10 * 60 * 1000;

export async function runCodingHarness(
  input: CodingHarnessRunInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CodingHarnessRunResult> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    return { ok: false, harness: input.harness, summary: "A coding prompt is required." };
  }
  if (input.harness === "cursor") return runCursor(input, env);
  if (input.harness === "claude") return runClaude(input, env);
  return runCodex(input, env);
}

async function runCursor(
  input: CodingHarnessRunInput,
  env: NodeJS.ProcessEnv,
): Promise<CodingHarnessRunResult> {
  const apiKey = env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      harness: "cursor",
      summary: "CURSOR_API_KEY is not configured on this 2hands deployment.",
    };
  }
  const body: Record<string, unknown> = {
    prompt: { text: input.prompt },
  };
  if (input.repoUrl) {
    body.source = { repository: input.repoUrl, ref: "main" };
  }
  try {
    const response = await fetch("https://api.cursor.com/v0/agents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        harness: "cursor",
        summary: `Cursor Cloud Agents returned ${response.status}: ${text.slice(0, 800)}`,
      };
    }
    const parsed = parseJsonObject(text);
    const url =
      stringField(parsed, "target", "url") ??
      stringField(parsed, "url") ??
      stringField(parsed, "id");
    return {
      ok: true,
      harness: "cursor",
      summary: `Handed the task to Cursor Cloud Agents.${url ? ` Follow at ${url}.` : ""}`,
      url,
    };
  } catch (error) {
    return {
      ok: false,
      harness: "cursor",
      summary: `Cursor Cloud Agents request failed: ${errorMessage(error)}`,
    };
  }
}

async function runClaude(
  input: CodingHarnessRunInput,
  env: NodeJS.ProcessEnv,
): Promise<CodingHarnessRunResult> {
  const cli = await runCli(
    "claude",
    ["-p", input.prompt, "--output-format", "text"],
    input.cwd,
    env,
  );
  if (cli) return { ...cli, harness: "claude" };

  const apiKey = env.ANTHROPIC_API_KEY?.trim() || env.AI_GATEWAY_API_KEY?.trim();
  const baseUrl = env.ANTHROPIC_API_KEY?.trim()
    ? "https://api.anthropic.com/v1/messages"
    : `${(env.VERCEL_AI_GATEWAY_URL?.trim() || "https://ai-gateway.vercel.sh/v1").replace(/\/+$/, "")}/messages`;
  if (!apiKey) {
    return {
      ok: false,
      harness: "claude",
      summary:
        "Neither the Claude Code CLI nor ANTHROPIC_API_KEY / AI_GATEWAY_API_KEY is available.",
    };
  }
  try {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        model: env.CLAUDE_CODE_MODEL?.trim() || "claude-opus-4-6",
        max_tokens: 4096,
        system:
          "You are Claude Code running as a 2hands coding harness. Implement the requested change. Return a concise summary of files changed and remaining risk. Do not claim you pushed unless you did.",
        messages: [{ role: "user", content: withRepo(input) }],
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const text = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        harness: "claude",
        summary: `Claude harness returned ${response.status}: ${text.slice(0, 800)}`,
      };
    }
    return { ok: true, harness: "claude", summary: extractAnthropicText(text) };
  } catch (error) {
    return {
      ok: false,
      harness: "claude",
      summary: `Claude harness failed: ${errorMessage(error)}`,
    };
  }
}

async function runCodex(
  input: CodingHarnessRunInput,
  env: NodeJS.ProcessEnv,
): Promise<CodingHarnessRunResult> {
  const cli = await runCli("codex", ["exec", "--skip-git-repo-check", input.prompt], input.cwd, env);
  if (cli) return { ...cli, harness: "codex" };

  const apiKey =
    env.OPENAI_API_KEY?.trim() || env.AI_GATEWAY_API_KEY?.trim() || env.VERCEL_AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      harness: "codex",
      summary: "Neither the Codex CLI nor OPENAI_API_KEY / AI_GATEWAY_API_KEY is available.",
    };
  }
  const baseUrl = `${(env.VERCEL_AI_GATEWAY_URL?.trim() || "https://ai-gateway.vercel.sh/v1").replace(/\/+$/, "")}/chat/completions`;
  try {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.CODEX_MODEL?.trim() || "openai/gpt-5",
        messages: [
          {
            role: "system",
            content:
              "You are Codex running as a 2hands coding harness. Produce a concrete implementation plan and the code changes. Be concise.",
          },
          { role: "user", content: withRepo(input) },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const text = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        harness: "codex",
        summary: `Codex harness returned ${response.status}: ${text.slice(0, 800)}`,
      };
    }
    return { ok: true, harness: "codex", summary: extractChatCompletionText(text) };
  } catch (error) {
    return {
      ok: false,
      harness: "codex",
      summary: `Codex harness failed: ${errorMessage(error)}`,
    };
  }
}

function withRepo(input: CodingHarnessRunInput): string {
  const parts = [input.prompt];
  if (input.repoUrl) parts.push(`Repository: ${input.repoUrl}`);
  if (input.cwd) parts.push(`Workspace: ${input.cwd}`);
  return parts.join("\n");
}

async function runCli(
  command: string,
  args: string[],
  cwd: string | undefined,
  env: NodeJS.ProcessEnv,
): Promise<Omit<CodingHarnessRunResult, "harness"> | null> {
  const result = await new Promise<{ code: number | null; stdout: string; stderr: string } | null>(
    (resolve) => {
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(command, args, {
          cwd,
          env,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch {
        resolve(null);
        return;
      }
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
      }, RUN_TIMEOUT_MS);
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", () => {
        clearTimeout(timer);
        resolve(null);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
    },
  );
  if (!result) return null;
  const output = (result.stdout || result.stderr).trim();
  if (result.code !== 0) {
    return {
      ok: false,
      summary: output.slice(0, 4000) || `${command} exited ${result.code}`,
    };
  }
  return { ok: true, summary: output.slice(0, 8000) || `${command} finished.` };
}

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function stringField(record: Record<string, unknown>, ...path: string[]): string | undefined {
  let current: unknown = record;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" && current.trim() ? current : undefined;
}

function extractAnthropicText(text: string): string {
  const parsed = parseJsonObject(text);
  const content = parsed.content;
  if (Array.isArray(content)) {
    const joined = content
      .map((block) =>
        block && typeof block === "object" && "text" in block
          ? String((block as { text?: unknown }).text ?? "")
          : "",
      )
      .join("\n")
      .trim();
    if (joined) return joined.slice(0, 8000);
  }
  return text.slice(0, 8000);
}

function extractChatCompletionText(text: string): string {
  const parsed = parseJsonObject(text);
  const choices = parsed.choices;
  if (Array.isArray(choices)) {
    const message = choices[0] && typeof choices[0] === "object" ? choices[0] : null;
    const content =
      message && typeof message === "object" && "message" in message
        ? (message as { message?: { content?: unknown } }).message?.content
        : undefined;
    if (typeof content === "string" && content.trim()) return content.slice(0, 8000);
  }
  return text.slice(0, 8000);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
