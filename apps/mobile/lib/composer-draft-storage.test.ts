import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeComposerDraftStorage } from "./composer-draft-storage";
import {
  clearComposerDrafts,
  composerDraftKey,
  composerSessionEpoch,
  flushComposerDrafts,
  loadComposerDraft,
  saveComposerDraft,
  setComposerAccount,
} from "./composer-drafts";

const fixture = vi.hoisted(() => ({ files: new Map<string, string>(), readBytes: [] as string[] }));
vi.mock("expo-file-system", () => ({
  Paths: {
    document: { uri: "file:///private/app/documents" },
    cache: { uri: "file:///private/app/cache" },
  },
  File: class {
    uri: string;
    constructor(parent: string | { uri: string }, name?: string) {
      this.uri = `${typeof parent === "string" ? parent : parent.uri}${name ? `/${name}` : ""}`;
    }
    get exists() {
      return fixture.files.has(this.uri);
    }
    async text() {
      return fixture.files.get(this.uri)!;
    }
    write(text: string) {
      fixture.files.set(this.uri, text);
    }
    delete() {
      fixture.files.delete(this.uri);
    }
    info() {
      return { size: 3 };
    }
    async base64() {
      fixture.readBytes.push(this.uri);
      return fixture.files.get(this.uri)!;
    }
  },
}));
const key = composerDraftKey("https://example.test", "account", "workspace", "conversation");
const metadata = "file:///private/app/documents/2hands-composer-drafts-v1.json";
const draft = (text: string) => ({ text, reply: null, mentions: [], skill: null, attachments: [] });
beforeEach(async () => {
  vi.useFakeTimers();
  await clearComposerDrafts();
  fixture.files.clear();
  fixture.readBytes.length = 0;
  await initializeComposerDraftStorage();
  setComposerAccount("https://example.test", "account", composerSessionEpoch());
});
afterEach(async () => {
  await clearComposerDrafts();
  vi.useRealTimers();
});

describe("private native draft storage", () => {
  it("recovers the last complete draft when termination interrupts a native file write", async () => {
    saveComposerDraft(key, draft("Last complete draft"));
    await flushComposerDrafts();
    saveComposerDraft(key, draft("Newer edit"));
    await flushComposerDrafts();
    fixture.files.set(metadata, '{"version":1,"drafts":[');
    await initializeComposerDraftStorage();
    expect((await loadComposerDraft(key)).text).toBe("Last complete draft");
    await clearComposerDrafts();
    expect([...fixture.files.keys()]).toEqual([]);
    await initializeComposerDraftStorage();
    expect((await loadComposerDraft(key)).text).toBe("");
  });
  it("rehydrates only app-private attachment bytes and excludes bytes from metadata", async () => {
    const privateUri = "file:///private/app/cache/image.png";
    fixture.files.set(privateUri, "aGk=");
    const file = {
      id: "image",
      name: "image.png",
      mimeType: "image/png" as const,
      threadKey: "conversation",
      contentBase64: "aGk=",
    };
    saveComposerDraft(key, {
      ...draft("Review this"),
      attachments: [
        { ...file, fileUri: privateUri, previewUri: privateUri },
        { ...file, id: "outside", fileUri: "file:///outside/file.png" },
        { ...file, id: "remote", fileUri: "https://example.test/file.png" },
      ],
    });
    await flushComposerDrafts();
    expect(fixture.files.get(metadata)).not.toContain("contentBase64");
    await initializeComposerDraftStorage();
    const restored = await loadComposerDraft(key);
    expect(restored.attachments).toHaveLength(1);
    expect(restored.attachments[0]).toMatchObject({ contentBase64: "aGk=", fileUri: privateUri });
    expect(restored.unavailableAttachments).toBe(2);
    expect(fixture.readBytes).toEqual([privateUri]);
  });
});
