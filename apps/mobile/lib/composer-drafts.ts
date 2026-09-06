import {
  type AgentSkillCatalogEntry,
  AgentSkillCatalogEntrySchema,
  MessageBlock,
} from "@rakazo/contracts";
import { COMPOSER_MENTION_KINDS, type ComposerMention } from "@rakazo/core";
import type { MobileMessage } from "./api";
import type { PickedAttachment } from "./pick-attachments-filter";

export type ComposerDraft = {
  text: string;
  attachments: Array<PickedAttachment & { threadKey: string }>;
  reply: MobileMessage | null;
  mentions: ComposerMention[];
  skill: AgentSkillCatalogEntry | null;
  unavailableAttachments?: number;
};
export type DraftAttachmentReference = Omit<
  ComposerDraft["attachments"][number],
  "contentBase64"
> & { fileUri: string };
type StoredDraft = Omit<ComposerDraft, "attachments"> & { attachments: DraftAttachmentReference[] };
export type ComposerDraftStorage = {
  read: () => Promise<string | null>;
  write: (value: string) => Promise<void>;
  clear: () => Promise<void>;
  restoreAttachment: (value: DraftAttachmentReference) => Promise<PickedAttachment | null>;
};
const emptyDraft = (): ComposerDraft => ({
  text: "",
  attachments: [],
  reply: null,
  mentions: [],
  skill: null,
});
export const composerDraftKey = (
  server: string,
  account: string,
  workspace: string,
  thread: string,
) => JSON.stringify([server, account, workspace, thread]);

/** Persist metadata only. Attachment bytes remain in the app's private cache. */
export function createComposerDraftStore(storage?: ComposerDraftStorage) {
  const drafts = new Map<string, ComposerDraft>();
  const stored = new Map<string, StoredDraft>();
  const edited = new Set<string>();
  let loading: Promise<void> | undefined;
  let epoch = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writes = Promise.resolve();
  const initialize = () => {
    const started = epoch;
    loading ??= (async () => {
      const raw = await storage?.read();
      if (!raw || started !== epoch) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("version" in parsed) ||
        parsed.version !== 1 ||
        !("drafts" in parsed) ||
        !Array.isArray(parsed.drafts)
      )
        return;
      for (const entry of parsed.drafts) {
        if (!Array.isArray(entry) || typeof entry[0] !== "string") continue;
        const value = parseStoredDraft(entry[1]);
        if (value && !edited.has(entry[0])) stored.set(entry[0], value);
      }
    })();
    return loading;
  };
  const flush = async () => {
    clearTimeout(timer);
    timer = undefined;
    await initialize();
    const started = epoch;
    const value = JSON.stringify({ version: 1, drafts: [...stored] });
    writes = writes
      .catch(() => undefined)
      .then(async () => {
        if (started === epoch) await storage?.write(value);
      });
    return writes;
  };
  return {
    initialize,
    read: (key: string) => drafts.get(key) ?? emptyDraft(),
    async load(key: string): Promise<ComposerDraft> {
      const started = epoch;
      await initialize();
      if (started !== epoch) return emptyDraft();
      if (drafts.has(key)) return drafts.get(key)!;
      const saved = stored.get(key);
      if (!saved || started !== epoch) return emptyDraft();
      const restored = await Promise.all(
        saved.attachments.map(async (ref) => {
          const file = await storage?.restoreAttachment(ref).catch(() => null);
          return file ? { ...file, threadKey: ref.threadKey } : null;
        }),
      );
      if (started !== epoch) return emptyDraft();
      if (drafts.has(key)) return drafts.get(key)!;
      const attachments = restored.filter(
        (file): file is NonNullable<typeof file> => file !== null,
      );
      const value: ComposerDraft = {
        ...saved,
        attachments,
        unavailableAttachments: saved.attachments.length - attachments.length,
      };
      drafts.set(key, value);
      return value;
    },
    save(key: string, value: ComposerDraft) {
      edited.add(key);
      if (
        !value.text &&
        !value.attachments.length &&
        !value.reply &&
        !value.mentions.length &&
        !value.skill
      ) {
        drafts.delete(key);
        stored.delete(key);
      } else {
        drafts.set(key, value);
        stored.set(key, {
          text: value.text,
          reply: value.reply,
          mentions: value.mentions,
          skill: value.skill,
          attachments: value.attachments.flatMap(({ contentBase64: _bytes, ...file }) =>
            file.fileUri ? [{ ...file, fileUri: file.fileUri }] : [],
          ),
        });
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        void flush().catch(() => undefined);
      }, 200);
    },
    flush,
    async clear() {
      epoch++;
      clearTimeout(timer);
      timer = undefined;
      drafts.clear();
      stored.clear();
      edited.clear();
      loading = Promise.resolve();
      writes = writes.catch(() => undefined).then(() => storage?.clear());
      await writes;
    },
  };
}

function parseStoredDraft(value: unknown): StoredDraft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Record<string, unknown>;
  if (typeof draft.text !== "string" || !Array.isArray(draft.attachments)) return null;
  const attachments = draft.attachments.flatMap((file: unknown) => {
    if (!file || typeof file !== "object") return [];
    const ref = file as Record<string, unknown>;
    if (
      !["id", "name", "mimeType", "fileUri", "threadKey"].every(
        (key) => typeof ref[key] === "string",
      )
    )
      return [];
    return [
      {
        id: ref.id as string,
        name: ref.name as string,
        mimeType: ref.mimeType as PickedAttachment["mimeType"],
        fileUri: ref.fileUri as string,
        threadKey: ref.threadKey as string,
        ...(typeof ref.previewUri === "string" ? { previewUri: ref.previewUri } : {}),
      },
    ];
  });
  let reply: MobileMessage | null = null;
  if (draft.reply && typeof draft.reply === "object") {
    const saved = draft.reply as Record<string, unknown>;
    const blocks = MessageBlock.array().safeParse(saved.blocks);
    if (
      typeof saved.id === "string" &&
      ["user", "bot", "system"].includes(String(saved.role)) &&
      blocks.success
    )
      reply = { id: saved.id, role: saved.role as MobileMessage["role"], blocks: blocks.data };
  }
  const skill = AgentSkillCatalogEntrySchema.safeParse(draft.skill);
  const mentions = Array.isArray(draft.mentions)
    ? (draft.mentions.filter((mention: unknown) => {
        if (!mention || typeof mention !== "object") return false;
        const m = mention as Record<string, unknown>;
        return (
          typeof m.id === "string" &&
          typeof m.name === "string" &&
          COMPOSER_MENTION_KINDS.includes(m.kind as ComposerMention["kind"])
        );
      }) as ComposerMention[])
    : [];
  return {
    text: draft.text,
    attachments,
    reply,
    mentions,
    skill: skill.success ? skill.data : null,
  };
}

let store = createComposerDraftStore();
let account: { server: string; id: string } | undefined;
let sessionEpoch = 0;
export const composerSessionEpoch = () => sessionEpoch;
export function setComposerAccount(server: string, id: string, expectedEpoch: number) {
  if (expectedEpoch === sessionEpoch) account = { server, id };
}
export const composerAccountId = (server: string) =>
  account?.server === server ? account.id : null;
export async function configureComposerDraftStorage(storage: ComposerDraftStorage) {
  store = createComposerDraftStore(storage);
  await store.initialize();
}
export const loadComposerDraft = (key: string) => store.load(key);
export const readComposerDraft = (key: string) => store.read(key);
export function saveComposerDraft(key: string, value: ComposerDraft) {
  const [server, id] = JSON.parse(key) as string[];
  if (account && account.server === server && account.id === id) store.save(key, value);
}
export const flushComposerDrafts = () => store.flush();
export async function clearComposerDrafts() {
  sessionEpoch++;
  account = undefined;
  await store.clear();
}
