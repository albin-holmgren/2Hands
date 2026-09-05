import type { Routine } from "@rakazo/contracts";
import {
  CRON_FREQS,
  type CronPreset,
  cronFromPreset,
  formatCron,
  presetFromCron,
} from "@rakazo/core";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeSheet } from "../components/native-sheet";
import { captureApiRequestContext, rpc } from "../lib/api";
import { useNativeTheme } from "../lib/theme";

export default function RoutineDetail() {
  const native = useNativeTheme();
  const { botId, botName, routineId } = useLocalSearchParams<{
    botId?: string;
    botName?: string;
    routineId?: string;
  }>();
  const router = useRouter();
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [timezone, setTimezone] = useState("");
  const [schedules, setSchedules] = useState<CronPreset[]>([]);
  const [notify, setNotify] = useState(false);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!botId || !routineId) {
        setError("Routine link is incomplete");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const routines = await rpc<Routine[]>("routines/list", { botId }, { signal });
        if (signal?.aborted) return;
        const match = routines.find((item) => item.id === routineId);
        if (!match) throw new Error("This routine no longer exists");
        setRoutine(match);
      } catch (cause) {
        if (!signal?.aborted)
          setError(cause instanceof Error ? cause.message : "Could not load routine");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [botId, routineId],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  function openEditor() {
    if (!routine) return;
    setName(routine.name);
    setPrompt(routine.prompt);
    setTimezone(routine.timezone);
    setSchedules(routine.crons.map(presetFromCron));
    setNotify(routine.notify);
    setError(null);
    setEditing(true);
  }
  async function update(
    patch: Partial<Pick<Routine, "name" | "prompt" | "crons" | "timezone" | "active" | "notify">>,
  ) {
    if (pending || !routine) return;
    setPending(true);
    setError(null);
    try {
      setRoutine(await rpc<Routine>("routines/update", { routineId: routine.id, ...patch }));
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update routine");
    } finally {
      setPending(false);
    }
  }
  async function runNow() {
    if (pending || !routine) return;
    setPending(true);
    setError(null);
    try {
      const requestContext = await captureApiRequestContext();
      await rpc("routines/testRun", { routineId: routine.id }, { requestContext });
      router.push({
        pathname: "/thread",
        params: { botId: botId ?? "", name: botName ?? "Assistant" },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not run routine");
    } finally {
      setPending(false);
    }
  }
  const field = {
    color: native.ink,
    backgroundColor: native.surface2,
    padding: 14,
    borderRadius: 12,
    fontSize: 16,
  };
  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: native.page }}>
      <Stack.Screen options={{ title: routine?.name ?? "Routine" }} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
        {loading ? <ActivityIndicator color={native.muted} /> : null}
        {error && !editing ? (
          <View>
            <Text accessibilityRole="alert" style={{ color: native.danger }}>
              {error}
            </Text>
            {!routine ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void load()}
                style={{ minHeight: 44, justifyContent: "center" }}
              >
                <Text style={{ color: native.ink }}>Retry</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {routine ? (
          <>
            <View
              style={{ borderRadius: 18, backgroundColor: native.surface, padding: 18, gap: 12 }}
            >
              <Text style={{ color: native.ink, fontSize: 22, fontWeight: "600" }}>
                {routine.name}
              </Text>
              <Text style={{ color: native.muted, fontSize: 14 }}>
                {routine.crons.map(formatCron).join(" · ")} · {routine.timezone}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ color: routine.active ? native.success : native.muted }}>
                  {routine.active ? "Active" : "Paused"}
                </Text>
                <Switch
                  accessibilityLabel="Routine active"
                  value={routine.active}
                  disabled={pending}
                  onValueChange={(active) => void update({ active })}
                  trackColor={{ true: native.accent }}
                />
              </View>
            </View>
            <Text selectable style={{ color: native.body, fontSize: 16, lineHeight: 25 }}>
              {routine.prompt}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void runNow()}
              disabled={pending}
              style={{
                minHeight: 48,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 13,
                backgroundColor: native.cream,
                opacity: pending ? 0.5 : 1,
              }}
            >
              <Text style={{ color: native.creamInk, fontWeight: "600", fontSize: 16 }}>
                {pending ? "Working…" : "Run now"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={openEditor}
              disabled={pending}
              style={{
                minHeight: 48,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 13,
                backgroundColor: native.surface2,
              }}
            >
              <Text style={{ color: native.ink, fontSize: 16 }}>Edit routine</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: "/thread",
                  params: { botId: botId ?? "", name: botName ?? "Assistant" },
                })
              }
              style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ color: native.muted }}>Open conversation</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={pending}
              onPress={() =>
                Alert.alert("Delete routine?", "Future scheduled runs will stop.", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => {
                      setPending(true);
                      void rpc("routines/remove", { routineId: routine.id })
                        .then(() => router.back())
                        .catch((cause) =>
                          setError(
                            cause instanceof Error ? cause.message : "Could not delete routine",
                          ),
                        )
                        .finally(() => setPending(false));
                    },
                  },
                ])
              }
              style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ color: native.danger }}>Delete routine</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
      {editing ? (
        <NativeSheet
          title="Edit routine"
          onClose={() => {
            if (!pending) setEditing(false);
          }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ padding: 20, gap: 16 }}
          >
            {error ? (
              <Text accessibilityRole="alert" style={{ color: native.danger }}>
                {error}
              </Text>
            ) : null}
            <TextInput
              accessibilityLabel="Routine name"
              value={name}
              onChangeText={setName}
              placeholder="Routine name"
              placeholderTextColor={native.muted}
              keyboardAppearance={native.theme}
              style={field}
            />
            <TextInput
              accessibilityLabel="Routine prompt"
              value={prompt}
              onChangeText={setPrompt}
              multiline
              placeholder="What should this routine do?"
              placeholderTextColor={native.muted}
              keyboardAppearance={native.theme}
              style={{ ...field, minHeight: 140, textAlignVertical: "top" }}
            />
            {schedules.map((schedule, index) => (
              <View key={index} style={{ gap: 10 }}>
                <Text style={{ color: native.muted }}>
                  Schedule {schedules.length > 1 ? index + 1 : ""}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {CRON_FREQS.map((freq) => (
                    <Pressable
                      key={freq}
                      accessibilityRole="button"
                      accessibilityState={{ selected: schedule.freq === freq }}
                      onPress={() =>
                        setSchedules((items) =>
                          items.map((item, i) => (i === index ? { ...item, freq } : item)),
                        )
                      }
                      style={{
                        minHeight: 44,
                        paddingHorizontal: 12,
                        justifyContent: "center",
                        borderRadius: 12,
                        backgroundColor: schedule.freq === freq ? native.cream : native.surface2,
                      }}
                    >
                      <Text
                        style={{ color: schedule.freq === freq ? native.creamInk : native.ink }}
                      >
                        {freq}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {schedule.freq === "Advanced" ? (
                  <TextInput
                    accessibilityLabel={`Schedule ${index + 1} expression`}
                    value={schedule.cron}
                    onChangeText={(cron) =>
                      setSchedules((items) =>
                        items.map((item, i) => (i === index ? { ...item, cron } : item)),
                      )
                    }
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardAppearance={native.theme}
                    style={field}
                  />
                ) : schedule.freq === "Interval" ? (
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <Text style={{ color: native.ink }}>Every</Text>
                    <TextInput
                      accessibilityLabel="Interval amount"
                      value={String(schedule.n)}
                      keyboardType="number-pad"
                      keyboardAppearance={native.theme}
                      onChangeText={(value) =>
                        setSchedules((items) =>
                          items.map((item, i) =>
                            i === index ? { ...item, n: Number(value) || 1 } : item,
                          ),
                        )
                      }
                      style={{ ...field, width: 64 }}
                    />
                    {(["minutes", "hours", "days"] as const).map((unit) => (
                      <Pressable
                        key={unit}
                        accessibilityRole="button"
                        accessibilityState={{ selected: schedule.unit === unit }}
                        onPress={() =>
                          setSchedules((items) =>
                            items.map((item, i) => (i === index ? { ...item, unit } : item)),
                          )
                        }
                        style={{ minHeight: 44, justifyContent: "center" }}
                      >
                        <Text
                          style={{ color: schedule.unit === unit ? native.accent : native.muted }}
                        >
                          {unit}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : schedule.freq !== "Every hour" ? (
                  <TextInput
                    accessibilityLabel={`Schedule ${index + 1} time`}
                    placeholder="9:00 AM"
                    value={schedule.time}
                    onChangeText={(time) =>
                      setSchedules((items) =>
                        items.map((item, i) => (i === index ? { ...item, time } : item)),
                      )
                    }
                    keyboardAppearance={native.theme}
                    style={field}
                  />
                ) : null}
              </View>
            ))}
            <TextInput
              accessibilityLabel="Timezone"
              value={timezone}
              onChangeText={setTimezone}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardAppearance={native.theme}
              style={field}
            />
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ color: native.ink }}>Notify when finished</Text>
              <Switch
                accessibilityLabel="Notify when finished"
                value={notify}
                onValueChange={setNotify}
                trackColor={{ true: native.accent }}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={pending || !name.trim() || !prompt.trim()}
              onPress={() =>
                void update({
                  name: name.trim(),
                  prompt: prompt.trim(),
                  crons: schedules.map(cronFromPreset),
                  timezone: timezone.trim(),
                  notify,
                })
              }
              style={{
                minHeight: 48,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 13,
                backgroundColor: native.cream,
                opacity: pending || !name.trim() || !prompt.trim() ? 0.5 : 1,
              }}
            >
              <Text style={{ color: native.creamInk, fontWeight: "600" }}>
                {pending ? "Saving…" : "Save changes"}
              </Text>
            </Pressable>
          </ScrollView>
        </NativeSheet>
      ) : null}
    </SafeAreaView>
  );
}
