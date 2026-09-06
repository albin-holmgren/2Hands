import type {
  AgentSkillCatalogEntry,
  Bot,
  BotSection,
  Group,
  Me,
  Space,
  ThreadMessage,
  ThreadSnapshot,
} from "@rakazo/contracts";
import type { ComposerMention } from "@rakazo/core";

export type ComposerDraft = {
  text: string;
  mentions: ComposerMention[];
  skill: AgentSkillCatalogEntry | null;
};
export type PendingWorkspaceAttachment = {
  id: string;
  threadKey: string;
  file: File;
  previewUrl?: string;
};
export type ThreadView = {
  draft: ComposerDraft;
  reply: ThreadMessage | null;
  scrollTop?: number;
  following?: boolean;
  panel: string | null;
  snapshot: ThreadSnapshot | null;
};
export type WorkspaceView = {
  bots: Bot[];
  groups: Group[];
  sections: BotSection[];
  spaces: Space[];
  me: Me | null;
  attachments: PendingWorkspaceAttachment[];
  threads: Map<string, ThreadView>;
  path: string;
};
const workspaces = new Map<string, WorkspaceView>();
let account: string | null = null;
export function workspaceViewKey(userId: string, spaceId: string | null) {
  return JSON.stringify([window.location.origin, userId, spaceId]);
}
export function clearWorkspaceViews() {
  for (const view of workspaces.values())
    for (const attachment of view.attachments) {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    }
  workspaces.clear();
  account = null;
}
export function workspaceView(userId: string, spaceId: string | null): WorkspaceView {
  if (account !== userId) {
    clearWorkspaceViews();
    account = userId;
  }
  const key = workspaceViewKey(userId, spaceId);
  let view =
    workspaces.get(key) ??
    [...workspaces.values()].find((item) => spaceId !== null && item.me?.spaceId === spaceId);
  if (!view) {
    const known = [...workspaces.values()].find((item) => item.spaces.length)?.spaces ?? [];
    const space = known.find((item) => item.id === spaceId);
    view = {
      bots: (space?.bots ?? []) as Bot[],
      groups: (space?.groups ?? []) as Group[],
      sections: space?.botSections ?? [],
      spaces: known,
      me: null,
      attachments: [],
      threads: new Map(),
      path: "/app",
    };
    workspaces.set(key, view);
  }
  return view;
}
export function threadView(workspace: WorkspaceView, id: string): ThreadView {
  let view = workspace.threads.get(id);
  if (!view) {
    view = {
      draft: { text: "", mentions: [], skill: null },
      reply: null,
      panel: null,
      snapshot: null,
    };
    workspace.threads.set(id, view);
  }
  return view;
}
