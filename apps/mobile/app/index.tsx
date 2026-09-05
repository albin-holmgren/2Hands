import type { RunActivityRow, SearchHit, SpaceBot, SpaceGroup } from "@rakazo/contracts";
import { groupBotsForSidebar } from "@rakazo/core";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useMemo as useThemeMemo,
} from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BotAvatar } from "../components/bot-avatar";
import { BotOrganizeModal } from "../components/bot-organize-modal";
import { GroupAvatar } from "../components/group-avatar";
import { NativeSymbol } from "../components/native-symbol";
import { WorkspacePicker } from "../components/workspace-picker";
import {
  activityStatusLabel,
  fetchSpaceActivity,
  formatActivityRelativeTime,
} from "../lib/activity";
import { loadActivityMode, saveActivityMode } from "../lib/activity-mode";
import {
  currentApiBase,
  loadSessionToken,
  type MobileBot,
  type MobileBotSection,
  type MobileGroup,
  type MobileMe,
  type MobileSpace,
  type MobileSpaceNavigation,
  rpc,
  selectedSpaceId,
  selectInitialSpace,
  selectSpace,
} from "../lib/api";
import { botTag, filterBots, formatThreadTime, userInitials } from "../lib/inbox";
import { dismissThreadNotifications, resumeLiveNotifications } from "../lib/live-notifications";
import { previewSnippet } from "../lib/preview";
import { registerPushToken } from "../lib/push";
import { querySpaceSearch } from "../lib/search";
import { mobileSearchDestination } from "../lib/search-destination";
import { type NativeTheme, useNativeTheme } from "../lib/theme";

const FALLBACK_COLOR = "#9B5CF6";

type InboxItem =
  | { type: "bot"; bot: MobileBot | SpaceBot }
  | { type: "group"; group: MobileGroup | SpaceGroup }
  | { type: "search"; hit: SearchHit }
  | { type: "heading"; key: string; title: string };

async function openMobileSpace(spaceId: string | undefined, open: () => void) {
  if (spaceId && !(await selectSpace(spaceId))) {
    Alert.alert("Could not switch spaces", "Try again.");
    return;
  }
  open();
}

export default function Home() {
  const native = useNativeTheme();
  const styles = useThemeMemo(() => makeStyles(native), [native]);
  const [bots, setBots] = useState<MobileBot[]>([]);
  const [groups, setGroups] = useState<MobileGroup[]>([]);
  const [botSections, setBotSections] = useState<MobileBotSection[]>([]);
  const [spaces, setSpaces] = useState<MobileSpace[]>([]);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [me, setMe] = useState<MobileMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [organizeTarget, setOrganizeTarget] = useState<{
    kind: "bot" | "group";
    id: string;
  } | null>(null);
  const [activityMode, setActivityMode] = useState(false);
  const [activity, setActivity] = useState<{ active: RunActivityRow[]; recent: RunActivityRow[] }>({
    active: [],
    recent: [],
  });
  const activityRequestId = useRef(0);
  const inboxRequestId = useRef(0);

  useEffect(() => {
    void loadActivityMode().then(setActivityMode);
  }, []);

  const toggleActivityMode = useCallback(() => {
    setActivityMode((on) => {
      const next = !on;
      void saveActivityMode(next);
      return next;
    });
  }, []);

  const loadBots = useCallback(async () => {
    const requestId = ++inboxRequestId.current;
    setError(null);
    try {
      const [navigation, nextMe] = await Promise.all([
        rpc<MobileSpaceNavigation>("spaces/list"),
        rpc<MobileMe>("me"),
      ]);
      if (requestId !== inboxRequestId.current) return;
      if (!(await selectInitialSpace(nextMe.spaceId))) {
        throw new Error("Could not save the default space");
      }
      if (requestId !== inboxRequestId.current) return;
      setBots(navigation.current.bots);
      setBotSections(navigation.current.botSections);
      setGroups(navigation.current.groups);
      setSpaces(navigation.spaces);
      setMe(nextMe);
    } catch (err) {
      if (requestId !== inboxRequestId.current) return;
      setError(err instanceof Error ? err.message : "Could not load bots");
    }
  }, []);

  const refreshBots = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadBots();
    } finally {
      setRefreshing(false);
    }
  }, [loadBots]);

  useEffect(() => {
    void loadSessionToken().then((token) => {
      setHasSession(Boolean(token));
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!hasSession) return;
    void registerPushToken().catch(() => undefined);
  }, [hasSession]);

  useFocusEffect(
    useCallback(() => {
      if (!hasSession) return;
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const tick = async () => {
        if (AppState.currentState === "active") await loadBots();
        if (!cancelled) timer = setTimeout(() => void tick(), 5_000);
      };
      void tick();
      return () => {
        cancelled = true;
        if (timer !== undefined) clearTimeout(timer);
      };
    }, [hasSession, loadBots]),
  );

  const loadActivity = useCallback(async () => {
    if (!hasSession || !activityMode || searching || query.trim()) {
      activityRequestId.current += 1;
      setActivity({ active: [], recent: [] });
      return;
    }
    const requestId = ++activityRequestId.current;
    try {
      const next = await fetchSpaceActivity();
      if (requestId !== activityRequestId.current) return;
      setActivity(next);
    } catch {
      // Keep the last good snapshot on transient RPC failures; only drop stale responses.
      if (requestId !== activityRequestId.current) return;
    }
  }, [activityMode, hasSession, query, searching]);

  useFocusEffect(
    useCallback(() => {
      if (!hasSession || !activityMode || searching || query.trim()) return;
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const tick = async () => {
        await loadActivity();
        if (!cancelled) {
          timer = setTimeout(() => void tick(), 15_000);
        }
      };

      void tick();
      return () => {
        cancelled = true;
        activityRequestId.current += 1;
        if (timer !== undefined) clearTimeout(timer);
      };
    }, [activityMode, hasSession, loadActivity, query, searching]),
  );

  useEffect(() => {
    const trimmed = query.trim();
    if (!searching || !trimmed) {
      setSearchHits([]);
      setSearchLoading(false);
      return;
    }
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setSearchLoading(true);
      void querySpaceSearch(trimmed)
        .then((hits) => {
          if (!abort.signal.aborted) setSearchHits(hits);
        })
        .catch(() => {
          if (!abort.signal.aborted) setSearchHits([]);
        })
        .finally(() => {
          if (!abort.signal.aborted) setSearchLoading(false);
        });
    }, 200);
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [query, searching]);

  const visible = useMemo(() => filterBots(bots, query), [bots, query]);
  const visibleGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return groups;
    return groups.filter((group) =>
      `${group.name} ${group.preview}`.toLowerCase().includes(needle),
    );
  }, [groups, query]);
  const listData = useMemo((): InboxItem[] => {
    if (query.trim() && searching) {
      return searchHits.map((hit) => ({ type: "search", hit }));
    }
    const chats = [
      ...visible.map((chat) => ({ type: "bot" as const, bot: chat, ...chat })),
      ...visibleGroups.map((chat) => ({ type: "group" as const, group: chat, ...chat })),
    ];
    return groupBotsForSidebar(chats, botSections).flatMap((group) => [
      ...(group.title ? [{ type: "heading" as const, key: group.key, title: group.title }] : []),
      ...group.bots,
    ]);
  }, [botSections, query, searching, searchHits, visible, visibleGroups]);
  const initials = userInitials(me?.name ?? "");
  const organizeChat = organizeTarget
    ? organizeTarget.kind === "bot"
      ? bots.find((bot) => bot.id === organizeTarget.id)
      : groups.find((group) => group.id === organizeTarget.id)
    : null;
  const insets = useSafeAreaInsets();
  const router = useRouter();

  if (!ready) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={native.secondaryLabel} />
      </View>
    );
  }
  if (!hasSession) return <Redirect href="/sign-in" />;

  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top, 20) }]}>
      <View style={styles.header}>
        <CircleButton accessibilityLabel="Account" onPress={() => router.push("/account")}>
          <Text style={styles.profileInitials}>{initials}</Text>
        </CircleButton>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Switch workspace"
          onPress={() => setWorkspaceOpen(true)}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 44,
            paddingHorizontal: 12,
            justifyContent: "center",
          }}
        >
          <Text numberOfLines={1} style={{ color: native.label, fontSize: 18, fontWeight: "600" }}>
            {spaces.find((space) => space.id === me?.spaceId)?.name ?? "Personal"} ⌄
          </Text>
        </Pressable>
        <View style={styles.headerActions}>
          <CircleButton
            accessibilityLabel="Activity"
            active={activityMode}
            accent
            onPress={toggleActivityMode}
          >
            <NativeSymbol
              ios={activityMode ? "bell.fill" : "bell"}
              android={activityMode ? "notifications" : "notifications-outline"}
              size={17}
              color={activityMode ? native.ink : native.muted}
            />
          </CircleButton>
          <CircleButton
            accessibilityLabel="Search"
            active={searching}
            onPress={() =>
              setSearching((open) => {
                if (open) setQuery("");
                return !open;
              })
            }
          >
            <NativeSymbol ios="magnifyingglass" android="search" size={17} />
          </CircleButton>
          <CircleButton
            accessibilityLabel="Create"
            onPress={() =>
              Alert.alert("Create", undefined, [
                { text: "New bot", onPress: () => router.push("/new") },
                { text: "New group", onPress: () => router.push("/new-group") },
                { text: "New workspace", onPress: () => router.push("/new-space") },
                { text: "Cancel", style: "cancel" },
              ])
            }
          >
            <NativeSymbol ios="plus" android="add" size={18} />
          </CircleButton>
        </View>
      </View>

      {searching ? (
        <TextInput
          autoFocus
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor={native.muted}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          keyboardAppearance={native.theme}
          clearButtonMode="while-editing"
          style={styles.searchField}
        />
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList<InboxItem>
        data={listData}
        keyExtractor={(item) => {
          if (item.type === "heading") return `heading-${item.key}`;
          if (item.type === "bot") return item.bot.id;
          if (item.type === "group") return `group-${item.group.id}`;
          const hit = item.hit;
          return `${hit.kind}-${hit.botId ?? hit.groupId}-${hit.messageId ?? hit.artifactId ?? hit.routineId ?? hit.url}`;
        }}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        indicatorStyle="white"
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void refreshBots();
              void loadActivity();
            }}
            tintColor={native.secondaryLabel}
            colors={["#8E8E93"]}
            progressBackgroundColor={native.surface2}
          />
        }
        ListHeaderComponent={
          activityMode &&
          !searching &&
          !query.trim() &&
          (activity.active.length > 0 || activity.recent.length > 0) ? (
            <ActivitySection activity={activity} />
          ) : null
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {query.trim() && searching
              ? searchLoading
                ? "Searching…"
                : "No results"
              : query.trim()
                ? "No matching bots"
                : searching
                  ? "Search conversations, files, and routines"
                  : "Tap + to create a bot"}
          </Text>
        }
        renderItem={({ item }) =>
          item.type === "search" ? (
            <SearchRow
              hit={item.hit}
              onPress={() => {
                setQuery("");
                setSearchHits([]);
                router.push(mobileSearchDestination(item.hit));
              }}
            />
          ) : item.type === "heading" ? (
            <Text style={styles.sectionHeading}>{item.title}</Text>
          ) : item.type === "group" ? (
            <GroupRow
              group={item.group}
              onPress={() => {
                void openMobileSpace(item.group.spaceId, () =>
                  router.push({
                    pathname: "/group-thread",
                    params: { groupId: item.group.id, name: item.group.name },
                  }),
                );
              }}
              onLongPress={
                item.group.spaceId === me?.spaceId
                  ? () => setOrganizeTarget({ kind: "group", id: item.group.id })
                  : undefined
              }
            />
          ) : (
            <BotRow
              bot={item.bot}
              onPress={() => {
                void openMobileSpace(item.bot.spaceId, () =>
                  router.push({
                    pathname: "/thread",
                    params: { botId: item.bot.id, name: item.bot.name },
                  }),
                );
              }}
              onLongPress={
                item.bot.spaceId === me?.spaceId
                  ? () => setOrganizeTarget({ kind: "bot", id: item.bot.id })
                  : undefined
              }
            />
          )
        }
      />
      {workspaceOpen ? (
        <WorkspacePicker
          spaces={spaces}
          selectedId={me?.spaceId}
          onClose={() => setWorkspaceOpen(false)}
          onCreate={() => {
            setWorkspaceOpen(false);
            router.push("/new-space");
          }}
          onSelect={async (id) => {
            if (id === selectedSpaceId()) return;
            inboxRequestId.current += 1;
            activityRequestId.current += 1;
            if (!(await selectSpace(id)))
              throw new Error("Could not save workspace selection. Try again.");
            setQuery("");
            setSearching(false);
            setSearchHits([]);
            setOrganizeTarget(null);
            setActivity({ active: [], recent: [] });
            const cached = spaces.find((space) => space.id === id);
            setBots([]);
            setGroups([]);
            setBotSections(cached?.botSections ?? []);
            setMe((current) => (current ? { ...current, spaceId: id } : current));
            await loadBots();
          }}
        />
      ) : null}
      {organizeChat && organizeTarget ? (
        <BotOrganizeModal
          bot={organizeChat}
          sections={botSections}
          onClose={() => setOrganizeTarget(null)}
          onUpdate={async (update) => {
            await rpc(`${organizeTarget.kind}s/update`, {
              [`${organizeTarget.kind}Id`]: organizeChat.id,
              ...update,
            });
            if (organizeTarget.kind === "bot" && update.notifyOnFinish !== undefined) {
              await resumeLiveNotifications(
                currentApiBase(),
                await loadSessionToken(),
                selectedSpaceId() ?? "",
              ).catch(() => undefined);
              if (!update.notifyOnFinish && "threadId" in organizeChat) {
                await dismissThreadNotifications({ threadId: organizeChat.threadId }).catch(
                  () => undefined,
                );
              }
            }
            await loadBots();
          }}
          onCreateSection={async (name) => {
            await rpc("botSections/create", {
              [`${organizeTarget.kind}Id`]: organizeChat.id,
              name,
            });
            await loadBots();
          }}
        />
      ) : null}
    </View>
  );
}

function ActivitySection({
  activity,
}: {
  activity: { active: RunActivityRow[]; recent: RunActivityRow[] };
}) {
  const native = useNativeTheme();
  const styles = useThemeMemo(() => makeStyles(native), [native]);
  const router = useRouter();
  const openRun = (run: RunActivityRow) => {
    if (run.groupId) {
      router.push({
        pathname: "/group-thread",
        params: { groupId: run.groupId, name: run.groupName ?? "Group" },
      });
      return;
    }
    router.push({ pathname: "/thread", params: { botId: run.botId, name: run.botName } });
  };

  return (
    <View style={styles.activitySection}>
      {activity.active.length > 0 ? (
        <>
          <Text style={styles.sectionHeading}>Now</Text>
          {activity.active.map((run) => (
            <ActivityRow key={run.runId} run={run} onPress={() => openRun(run)} />
          ))}
        </>
      ) : null}
      {activity.recent.length > 0 ? (
        <>
          <Text style={[styles.sectionHeading, activity.active.length > 0 && styles.activityGap]}>
            Recent
          </Text>
          {activity.recent.map((run) => (
            <ActivityRow key={run.runId} run={run} onPress={() => openRun(run)} />
          ))}
        </>
      ) : null}
    </View>
  );
}

function ActivityRow({ run, onPress }: { run: RunActivityRow; onPress: () => void }) {
  const native = useNativeTheme();
  const styles = useThemeMemo(() => makeStyles(native), [native]);
  const title = run.groupName ? `${run.botName} · ${run.groupName}` : run.botName;
  const status = activityStatusLabel(run.status);
  const preview = run.promptSnippet ? `${run.promptSnippet} · ${status}` : status;
  const activityLabel = `${title}, ${status}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={activityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.activityDot} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.name} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.time}>{formatActivityRelativeTime(run.updatedAt)}</Text>
        </View>
        <Text style={styles.preview} numberOfLines={1}>
          {preview}
        </Text>
      </View>
    </Pressable>
  );
}

function CircleButton({
  children,
  onPress,
  accessibilityLabel,
  active = false,
  accent = false,
}: {
  children: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  active?: boolean;
  accent?: boolean;
}) {
  const native = useNativeTheme();
  const styles = useThemeMemo(() => makeStyles(native), [native]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.circleButton,
        accent && active ? styles.circleAccent : (active || pressed) && styles.circlePressed,
      ]}
    >
      {children}
    </Pressable>
  );
}

function SearchRow({ hit, onPress }: { hit: SearchHit; onPress: () => void }) {
  const native = useNativeTheme();
  const styles = useThemeMemo(() => makeStyles(native), [native]);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.name} numberOfLines={1}>
            {hit.title}
          </Text>
          <Text style={styles.time}>{hit.kind}</Text>
        </View>
        <Text style={styles.preview} numberOfLines={2}>
          {hit.groupName ?? hit.botName} · {hit.snippet}
        </Text>
      </View>
    </Pressable>
  );
}

function BotRow({
  bot,
  onPress,
  onLongPress,
}: {
  bot: MobileBot | SpaceBot;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const native = useNativeTheme();
  const styles = useThemeMemo(() => makeStyles(native), [native]);
  const preview = previewSnippet(bot.preview, 40) || bot.title || "No messages yet";
  const time = bot.updatedAt ? formatThreadTime(bot.updatedAt) : "";
  const tag = botTag(bot.title, bot.name);
  // Spelled out because an explicit label replaces the one built from the row's children.
  const label = [
    bot.name,
    tag,
    bot.notifyOnFinish ? null : "notifications silenced",
    bot.unread ? "unread" : null,
    time,
    preview,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityHint={
        onLongPress ? "Long press to pin, move, or silence notifications" : undefined
      }
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <BotAvatar
        color={bot.color || FALLBACK_COLOR}
        identity={bot.id}
        status={bot.status}
        muted={!bot.notifyOnFinish}
      />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
              {bot.name}
            </Text>
            {tag ? (
              <View style={styles.tag}>
                <Text style={styles.tagLabel} numberOfLines={1} ellipsizeMode="tail">
                  {tag}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.rowMeta}>
            {time ? <Text style={styles.time}>{time}</Text> : null}
            {bot.unread ? <View accessibilityElementsHidden style={styles.unreadDot} /> : null}
          </View>
        </View>
        <Text
          style={[styles.preview, bot.unread && styles.unreadPreview]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {preview}
        </Text>
      </View>
    </Pressable>
  );
}

function GroupRow({
  group,
  onPress,
  onLongPress,
}: {
  group: MobileGroup | SpaceGroup;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const native = useNativeTheme();
  const styles = useThemeMemo(() => makeStyles(native), [native]);
  const preview =
    previewSnippet(group.preview, 40) || group.members.map((member) => member.name).join(", ");
  const time = group.updatedAt ? formatThreadTime(group.updatedAt) : "";
  return (
    <Pressable
      accessibilityLabel={[group.name, group.unread ? "unread" : null, time, preview]
        .filter(Boolean)
        .join(", ")}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityHint={onLongPress ? "Long press to pin or move to a section" : undefined}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <GroupAvatar members={group.members} size={54} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.name} numberOfLines={1}>
            {group.name}
          </Text>
          <View style={styles.rowMeta}>
            {time ? <Text style={styles.time}>{time}</Text> : null}
            {group.unread ? <View accessibilityElementsHidden style={styles.unreadDot} /> : null}
          </View>
        </View>
        <Text style={[styles.preview, group.unread && styles.unreadPreview]} numberOfLines={1}>
          {preview}
        </Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (native: NativeTheme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: native.page,
    },
    centered: {
      alignItems: "center",
      justifyContent: "center",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 10,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    circleButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: native.surface2,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    circlePressed: {
      backgroundColor: native.fillPressed,
    },
    circleAccent: {
      backgroundColor: native.accent,
    },
    profileInitials: {
      color: native.label,
      fontSize: 15,
      fontWeight: "600",
    },
    searchField: {
      marginHorizontal: 16,
      marginBottom: 8,
      height: 36,
      borderRadius: 10,
      backgroundColor: native.fill,
      color: native.label,
      paddingHorizontal: 12,
      fontSize: 17,
      writingDirection: "auto",
    },
    error: {
      color: native.secondaryLabel,
      paddingHorizontal: 20,
      paddingBottom: 8,
    },
    list: {
      flexGrow: 1,
      paddingBottom: 32,
    },
    empty: {
      color: native.secondaryLabel,
      fontSize: 16,
      paddingHorizontal: 20,
      paddingTop: 28,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 12,
    },
    rowPressed: {
      opacity: 0.55,
    },
    rowBody: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    rowTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    titleRow: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    rowMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },
    name: {
      flexShrink: 1,
      color: native.label,
      fontSize: 17,
      fontWeight: "600",
      writingDirection: "auto",
    },
    tag: {
      flexShrink: 1,
      borderRadius: 999,
      backgroundColor: native.fill,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    tagLabel: {
      color: native.secondaryLabel,
      fontSize: 11,
      fontWeight: "500",
      writingDirection: "auto",
    },
    time: {
      color: native.secondaryLabel,
      fontSize: 15,
    },
    preview: {
      color: native.secondaryLabel,
      fontSize: 15,
      lineHeight: 20,
      writingDirection: "auto",
    },
    unreadPreview: {
      color: native.label,
      fontWeight: "600",
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: "#8B5CF6",
    },
    sectionHeading: {
      color: native.secondaryLabel,
      fontSize: 14,
      fontWeight: "600",
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 4,
    },
    activitySection: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: native.hairlineStrong,
      marginBottom: 4,
      paddingBottom: 4,
    },
    activityGap: {
      paddingTop: 16,
    },
    activityDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: "#8B5CF6",
      marginTop: 6,
    },
    groupAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: "#E6E4DA",
      alignItems: "center",
      justifyContent: "center",
    },
    groupAvatarLabel: {
      color: native.muted,
      fontSize: 16,
      fontWeight: "600",
    },
  });
