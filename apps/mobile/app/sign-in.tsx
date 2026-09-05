import { Redirect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  apiBaseWarning,
  currentApiBase,
  defaultApiBase,
  displayApiHost,
  loadSessionToken,
  type MobileBot,
  type MobileMe,
  normalizeApiBase,
  type PasswordResetCapabilities,
  passwordResetCapabilities,
  probeApiBase,
  requestPasswordReset,
  resetApiBase,
  rpc,
  saveApiBase,
  signIn,
  signUp,
  usesCustomApiBase,
} from "../lib/api";
import { useNativeTheme } from "../lib/theme";

export default function SignIn() {
  const native = useNativeTheme();
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up" | "forgot">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [apiBase, setApiBase] = useState(() => currentApiBase());
  const [serverOpen, setServerOpen] = useState(false);
  const [reset, setReset] = useState<PasswordResetCapabilities | null>(null);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    void loadSessionToken().then((token) => {
      setHasSession(Boolean(token));
      setReady(true);
    });
  }, []);

  useEffect(() => {
    let active = true;
    setReset(null);
    void passwordResetCapabilities()
      .then((capabilities) => {
        if (active) setReset(capabilities);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [apiBase]);

  if (!ready) {
    return (
      <View
        style={{ flex: 1, backgroundColor: native.page, justifyContent: "center", padding: 24 }}
      >
        <Text style={{ color: native.muted, textAlign: "center" }}>Loading…</Text>
      </View>
    );
  }
  if (hasSession) return <Redirect href="/" />;

  async function submit() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      if (mode === "forgot") {
        if (!reset?.passwordReset || !reset.resetUrl) {
          throw new Error("Password recovery is not configured for this server");
        }
        await requestPasswordReset(email.trim(), reset.resetUrl);
        setResetSent(true);
        return;
      }
      if (mode === "up") {
        const trimmedEmail = email.trim();
        await signUp(trimmedEmail, password, name.trim() || trimmedEmail.split("@")[0] || "User");
        // Account creation succeeded. A transient onboarding failure must not ask
        // the user to sign up again; the home screen can recover the session.
        try {
          const me = await rpc<MobileMe>("me");
          if (!me.needsModel) {
            const bot = await rpc<MobileBot>("onboarding/ensureChiefOfStaff");
            router.replace({
              pathname: "/thread",
              params: { botId: bot.id, name: bot.name, spaceId: me.spaceId },
            });
            return;
          }
        } catch {
          /* Continue into the signed-in workspace. */
        }
      } else {
        await signIn(email.trim(), password);
      }
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not continue");
    } finally {
      setPending(false);
    }
  }

  const custom = usesCustomApiBase(apiBase);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: native.page }}>
      <StatusBar style={native.theme === "dark" ? "light" : "dark"} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={{ flex: 1 }}>
            <ScrollView
              contentContainerStyle={{
                flexGrow: 1,
                justifyContent: "center",
                paddingHorizontal: 24,
                paddingVertical: 24,
              }}
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              keyboardShouldPersistTaps="handled"
            >
              <Text
                style={{
                  color: native.ink,
                  fontSize: 32,
                  fontWeight: "500",
                  textAlign: "center",
                }}
              >
                {mode === "in"
                  ? "Sign in to 2hands"
                  : mode === "up"
                    ? "Sign up for 2hands"
                    : "Reset your password"}
              </Text>
              {mode === "up" && !usesCustomApiBase(apiBase) ? (
                <Text style={{ color: native.muted, textAlign: "center", marginTop: 12 }}>
                  Start free. No card or API key.
                </Text>
              ) : null}
              {resetSent ? (
                <View style={{ alignItems: "center", marginTop: 28 }}>
                  <Text style={{ color: native.ink, fontSize: 17 }}>Check your email</Text>
                  <Text
                    style={{
                      color: native.muted,
                      fontSize: 15,
                      marginTop: 10,
                      textAlign: "center",
                    }}
                  >
                    If an account exists for that address, we sent a password reset link.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setMode("in");
                      setResetSent(false);
                    }}
                    style={{ marginTop: 22 }}
                  >
                    <Text style={{ color: native.ink, fontSize: 15, fontWeight: "600" }}>
                      Back to sign in
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  {mode === "up" ? (
                    <TextInput
                      autoComplete="name"
                      placeholder="Name"
                      placeholderTextColor={native.muted2}
                      value={name}
                      onChangeText={setName}
                      style={{
                        marginTop: 28,
                        backgroundColor: native.surface,
                        borderRadius: 13,
                        padding: 16,
                        color: native.ink,
                      }}
                    />
                  ) : null}
                  <TextInput
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    placeholder="Email"
                    placeholderTextColor={native.muted2}
                    value={email}
                    onChangeText={setEmail}
                    style={{
                      marginTop: mode === "up" ? 12 : 28,
                      backgroundColor: native.surface,
                      borderRadius: 13,
                      padding: 16,
                      color: native.ink,
                    }}
                  />
                  {mode === "in" && reset?.passwordReset && reset.resetUrl ? (
                    <Pressable
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => {
                        setMode("forgot");
                        setError(null);
                      }}
                      style={{ alignSelf: "flex-end", marginTop: 10 }}
                    >
                      <Text style={{ color: native.ink, fontSize: 14, fontWeight: "600" }}>
                        Forgot password?
                      </Text>
                    </Pressable>
                  ) : null}
                  {mode !== "forgot" ? (
                    <TextInput
                      autoComplete={mode === "in" ? "current-password" : "new-password"}
                      placeholder="Password"
                      placeholderTextColor={native.muted2}
                      returnKeyType="go"
                      secureTextEntry
                      value={password}
                      onChangeText={setPassword}
                      onSubmitEditing={() => void submit()}
                      style={{
                        marginTop: 12,
                        backgroundColor: native.surface,
                        borderRadius: 13,
                        padding: 16,
                        color: native.ink,
                      }}
                    />
                  ) : null}
                  {error ? (
                    <Text style={{ color: native.danger, marginTop: 12 }}>{error}</Text>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    testID="auth-submit"
                    onPress={() => void submit()}
                    disabled={pending}
                    style={{
                      marginTop: 16,
                      backgroundColor: native.cream,
                      borderRadius: 10,
                      paddingVertical: 12,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: native.creamInk, fontSize: 15, fontWeight: "600" }}>
                      {pending
                        ? "Working…"
                        : mode === "in"
                          ? "Sign in"
                          : mode === "up"
                            ? "Sign up"
                            : "Send reset link"}
                    </Text>
                  </Pressable>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "center",
                      alignItems: "center",
                      marginTop: 24,
                    }}
                  >
                    <Text style={{ color: native.muted2, fontSize: 15 }}>
                      {mode === "in"
                        ? "Don’t have an account?"
                        : mode === "up"
                          ? "Already have an account?"
                          : ""}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => {
                        setMode((current) => (current === "in" ? "up" : "in"));
                        setError(null);
                      }}
                      style={{ marginLeft: 5 }}
                    >
                      <Text style={{ color: native.ink, fontSize: 15, fontWeight: "600" }}>
                        {mode === "in" ? "Sign up" : mode === "up" ? "Sign in" : "Back to sign in"}
                      </Text>
                    </Pressable>
                  </View>
                </>
              )}
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                custom ? `Custom server ${displayApiHost(apiBase)}` : "Use a custom server"
              }
              hitSlop={12}
              onPress={() => setServerOpen(true)}
              style={{
                alignItems: "center",
                paddingHorizontal: 24,
                paddingBottom: 12,
                paddingTop: 8,
              }}
            >
              {custom ? (
                <>
                  <Text style={{ color: native.muted, fontSize: 12 }}>Custom server</Text>
                  <Text style={{ color: native.muted, fontSize: 13, marginTop: 2 }}>
                    {displayApiHost(apiBase)}
                  </Text>
                </>
              ) : (
                <Text style={{ color: native.muted, fontSize: 13 }}>Use a custom server</Text>
              )}
            </Pressable>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
      <ServerSheet
        visible={serverOpen}
        current={apiBase}
        onClose={() => setServerOpen(false)}
        onSaved={(url) => {
          setApiBase(url);
          setServerOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

function ServerSheet({
  visible,
  current,
  onClose,
  onSaved,
}: {
  visible: boolean;
  current: string;
  onClose: () => void;
  onSaved: (url: string) => void;
}) {
  const native = useNativeTheme();
  const [draft, setDraft] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDraft(current);
    setError(null);
    setPending(false);
  }, [visible, current]);

  const parsedDraft = normalizeApiBase(draft);
  const warning = parsedDraft.ok ? apiBaseWarning(parsedDraft.url) : null;

  async function save() {
    setPending(true);
    setError(null);
    try {
      const probed = await probeApiBase(draft);
      if (!probed.ok) {
        setError(probed.error);
        return;
      }
      const saved = await saveApiBase(probed.url);
      if (!saved.ok) {
        setError(saved.error);
        return;
      }
      onSaved(saved.url);
    } finally {
      setPending(false);
    }
  }

  async function restoreDefault() {
    setPending(true);
    setError(null);
    try {
      const saved = await resetApiBase();
      if (!saved.ok) {
        setError(saved.error);
        return;
      }
      onSaved(saved.url);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: native.page }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <SafeAreaView style={{ flex: 1, paddingHorizontal: 24, paddingTop: 12 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={{ color: native.muted, fontSize: 17 }}>Cancel</Text>
            </Pressable>
            <Text style={{ color: native.ink, fontSize: 17, fontWeight: "600" }}>Server</Text>
            <Pressable onPress={() => void save()} disabled={pending} hitSlop={8}>
              <Text style={{ color: native.ink, fontSize: 17, fontWeight: "600" }}>
                {pending ? "Checking…" : "Save"}
              </Text>
            </Pressable>
          </View>
          <Text style={{ color: native.muted, marginTop: 28, fontSize: 15, lineHeight: 22 }}>
            Point this app at your self-hosted 2hands origin — the same HTTPS URL you open in a
            browser.
          </Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            keyboardType="url"
            textContentType="URL"
            returnKeyType="go"
            onSubmitEditing={() => void save()}
            placeholder={defaultApiBase()}
            placeholderTextColor={native.muted2}
            value={draft}
            onChangeText={(value) => {
              setDraft(value);
              setError(null);
            }}
            style={{
              marginTop: 20,
              backgroundColor: native.surface,
              borderRadius: 13,
              padding: 16,
              color: native.ink,
              fontSize: 16,
            }}
          />
          {warning ? (
            <Text style={{ color: native.muted2, marginTop: 12, fontSize: 13 }}>{warning}</Text>
          ) : null}
          {error ? <Text style={{ color: native.danger, marginTop: 12 }}>{error}</Text> : null}
          {usesCustomApiBase(current) || draft.trim() !== current ? (
            <Pressable
              onPress={() => void restoreDefault()}
              disabled={pending}
              style={{ marginTop: 28, alignItems: "center" }}
            >
              <Text style={{ color: native.muted, fontSize: 15 }}>Use default server</Text>
            </Pressable>
          ) : null}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
