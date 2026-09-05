import { afterEach, describe, expect, it, vi } from "vitest";
import { clearWorkspaceViews, threadView, workspaceView } from "./workspace-state";

afterEach(() => {
  clearWorkspaceViews();
  vi.unstubAllGlobals();
});
describe("workspace view isolation", () => {
  it("restores drafts, reply state, panels and scroll only in the original thread and workspace", () => {
    vi.stubGlobal("window", { location: { origin: "https://app.example.test" } });
    const personal = workspaceView("user-a", "personal");
    const draft = threadView(personal, "bot:assistant");
    draft.draft.text = "Unsent personal work";
    draft.scrollTop = 340;
    draft.following = false;
    draft.panel = "files";
    const work = workspaceView("user-a", "work");
    expect(threadView(work, "bot:assistant").draft.text).toBe("");
    expect(threadView(personal, "bot:other").draft.text).toBe("");
    expect(threadView(workspaceView("user-a", "personal"), "bot:assistant")).toMatchObject({
      draft: { text: "Unsent personal work" },
      panel: "files",
      scrollTop: 340,
      following: false,
    });
  });
  it("clears private cached state and releases attachment URLs when the account changes", () => {
    vi.stubGlobal("window", { location: { origin: "https://app.example.test" } });
    const revoke = vi.fn();
    vi.stubGlobal("URL", { revokeObjectURL: revoke });
    const first = workspaceView("user-a", "personal");
    threadView(first, "bot:assistant").draft.text = "Unsent draft";
    first.attachments.push({
      id: "a",
      threadKey: "assistant",
      file: {} as File,
      previewUrl: "blob:fixture",
    });
    expect(threadView(workspaceView("user-b", "personal"), "bot:assistant").draft.text).toBe("");
    expect(revoke).toHaveBeenCalledWith("blob:fixture");
    expect(threadView(workspaceView("user-a", "personal"), "bot:assistant").draft.text).toBe("");
  });
});
