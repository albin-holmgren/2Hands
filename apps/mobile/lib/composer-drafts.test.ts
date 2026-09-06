import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ComposerDraft,
  type ComposerDraftStorage,
  clearComposerDrafts,
  composerAccountId,
  composerDraftKey,
  composerSessionEpoch,
  configureComposerDraftStorage,
  createComposerDraftStore,
  readComposerDraft,
  saveComposerDraft,
  setComposerAccount,
} from "./composer-drafts";

const draft = (text: string): ComposerDraft => ({
  text,
  attachments: [],
  reply: null,
  mentions: [],
  skill: null,
});
const key = composerDraftKey("https://example.test", "account-a", "work", "assistant");
const file = {
  id: "file",
  name: "draft.txt",
  mimeType: "text/plain" as const,
  contentBase64: "aGk=",
  fileUri: "file:///private/app/cache/draft.txt",
  threadKey: "assistant",
};
function disk(initial: string | null = null) {
  let value = initial;
  const storage: ComposerDraftStorage = {
    read: vi.fn(async () => value),
    write: vi.fn(async (next: string) => {
      value = next;
    }),
    clear: vi.fn(async () => {
      value = null;
    }),
    restoreAttachment: vi.fn(async (ref) => ({ ...ref, contentBase64: "aGk=" })),
  };
  return { storage, value: () => value };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("native conversation draft lifecycle", () => {
  it("restores text, reply, and private attachment references after a fresh app instance", async () => {
    const saved = disk();
    const first = createComposerDraftStore(saved.storage);
    const reply = {
      id: "message",
      role: "bot" as const,
      blocks: [{ kind: "text" as const, text: "Previous answer" }],
    };
    first.save(key, { ...draft("Finish this later"), reply, attachments: [file] });
    await first.flush();
    expect(saved.value()).not.toContain("contentBase64");
    expect(saved.value()).not.toContain("aGk=");
    const restarted = createComposerDraftStore(saved.storage);
    expect(await restarted.load(key)).toMatchObject({
      text: "Finish this later",
      reply,
      attachments: [file],
    });
    for (const other of [
      composerDraftKey("https://example.test", "account-b", "work", "assistant"),
      composerDraftKey("https://example.test", "account-a", "personal", "assistant"),
      composerDraftKey("https://example.test", "account-a", "work", "another"),
      composerDraftKey("https://other.test", "account-a", "work", "assistant"),
    ])
      expect(await restarted.load(other)).toEqual(draft(""));
    expect(saved.storage.restoreAttachment).toHaveBeenCalledOnce();
  });
  it("keeps text and reply when a cache file is removed by the operating system", async () => {
    const saved = disk();
    const first = createComposerDraftStore(saved.storage);
    first.save(key, { ...draft("Keep the text"), attachments: [file] });
    await first.flush();
    vi.mocked(saved.storage.restoreAttachment).mockResolvedValue(null);
    expect(await createComposerDraftStore(saved.storage).load(key)).toMatchObject({
      text: "Keep the text",
      attachments: [],
      unavailableAttachments: 1,
    });
  });
  it("clears a sent draft durably without deleting another conversation", async () => {
    const saved = disk();
    const first = createComposerDraftStore(saved.storage);
    first.save(key, draft("First"));
    first.save("another", draft("Second"));
    await first.flush();
    const restarted = createComposerDraftStore(saved.storage);
    // Clear before asynchronous startup hydration has completed.
    restarted.save(key, draft(""));
    await restarted.flush();
    const next = createComposerDraftStore(saved.storage);
    expect(await next.load(key)).toEqual(draft(""));
    expect((await next.load("another")).text).toBe("Second");
  });
  it("cannot resurrect a draft when signout races a pending write or attachment read", async () => {
    const saved = disk();
    const store = createComposerDraftStore(saved.storage);
    let finishWrite!: () => void;
    const diskWrite = saved.storage.write;
    saved.storage.write = vi.fn(async (value) => {
      await new Promise<void>((resolve) => {
        finishWrite = resolve;
      });
      await diskWrite(value);
    });
    store.save(key, draft("Private draft"));
    const flush = store.flush();
    await vi.waitFor(() => expect(finishWrite).toBeTypeOf("function"));
    const clear = store.clear();
    finishWrite();
    await Promise.all([flush, clear]);
    expect(saved.storage.clear).toHaveBeenCalledOnce();
    expect(saved.value()).toBeNull();
    expect(store.read(key)).toEqual(draft(""));

    const seed = createComposerDraftStore(saved.storage);
    // Restore the regular writer for the next phase.
    saved.storage.write = diskWrite;
    seed.save(key, { ...draft("Attachment draft"), attachments: [file] });
    await seed.flush();
    let finishRead!: (attachment: typeof file | null) => void;
    saved.storage.restoreAttachment = vi.fn(
      () =>
        new Promise<typeof file | null>((resolve) => {
          finishRead = resolve;
        }),
    );
    const reopened = createComposerDraftStore(saved.storage);
    const loading = reopened.load(key);
    await vi.waitFor(() => expect(finishRead).toBeTypeOf("function"));
    await reopened.clear();
    finishRead(file);
    expect(await loading).toEqual(draft(""));
    expect(reopened.read(key)).toEqual(draft(""));
    expect(saved.value()).toBeNull();
  });
  it("debounces typing and flushes the latest draft before app suspension", async () => {
    const saved = disk();
    const store = createComposerDraftStore(saved.storage);
    store.save(key, draft("H"));
    store.save(key, draft("Hello"));
    expect(saved.storage.write).not.toHaveBeenCalled();
    await store.flush();
    expect(saved.storage.write).toHaveBeenCalledOnce();
    expect((await createComposerDraftStore(saved.storage).load(key)).text).toBe("Hello");
  });
  it("ignores malformed disk records and keeps new edits", async () => {
    const saved = disk('{"version":1,"drafts":[["bad",{"text":42}],null]}');
    const store = createComposerDraftStore(saved.storage);
    expect(await store.load("bad")).toEqual(draft(""));
    store.save(key, draft("New draft"));
    await store.flush();
    expect((await createComposerDraftStore(saved.storage).load(key)).text).toBe("New draft");
  });
  it("rejects stale account responses and stale screen writes after signout", async () => {
    const saved = disk();
    await clearComposerDrafts();
    await configureComposerDraftStorage(saved.storage);
    const epoch = composerSessionEpoch();
    setComposerAccount("https://example.test", "account-a", epoch);
    saveComposerDraft(key, draft("Private"));
    await clearComposerDrafts();
    setComposerAccount("https://example.test", "account-a", epoch);
    saveComposerDraft(key, draft("Late screen effect"));
    expect(composerAccountId("https://example.test")).toBeNull();
    expect(readComposerDraft(key)).toEqual(draft(""));
    expect(saved.value()).toBeNull();
  });
  it("does not collide when identifiers contain separators", () => {
    expect(composerDraftKey("server:a", "account", "b", "c")).not.toBe(
      composerDraftKey("server", "account", "a:b", "c"),
    );
  });
});
