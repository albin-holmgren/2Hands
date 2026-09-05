import type { Billing } from "@rakazo/contracts";
import { PLANS, type PlanId } from "@rakazo/core";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { rpc } from "../lib/api";
import { useNativeTheme } from "../lib/theme";

const usd = (value: number) => `$${value.toFixed(2)}`;
export default function Usage() {
  const native = useNativeTheme();
  const [billing, setBilling] = useState<Billing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setBilling(await rpc<Billing>("billing/get"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load usage");
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  async function checkout(plan: Exclude<PlanId, "free">) {
    if (pending) return;
    setPending(plan);
    setError(null);
    try {
      const { url } = await rpc<{ url: string }>("billing/checkout", { plan });
      if (!url.startsWith("https://")) throw new Error("Checkout is unavailable. Try again later.");
      await Linking.openURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open checkout");
    } finally {
      setPending(null);
    }
  }
  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: native.page }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        {error ? (
          <View style={{ gap: 8 }}>
            <Text accessibilityRole="alert" style={{ color: native.danger }}>
              {error}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void load()}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <Text style={{ color: native.ink }}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
        {!billing && !error ? <ActivityIndicator color={native.muted} /> : null}
        {billing ? (
          <>
            <View
              style={{ backgroundColor: native.surface, borderRadius: 18, padding: 20, gap: 12 }}
            >
              <Text style={{ color: native.muted, fontSize: 14 }}>
                {billing.billingEnabled ? billing.planName : "Self-hosted"}
              </Text>
              {billing.billingEnabled && billing.legacyUntil ? (
                <>
                  <Text style={{ color: native.ink, fontSize: 18, fontWeight: "600" }}>
                    Current included usage
                  </Text>
                  <Text style={{ color: native.muted, fontSize: 14 }}>
                    {billing.tokensUsed.toLocaleString()} of{" "}
                    {billing.monthlyTokens.toLocaleString()} tokens used
                  </Text>
                  <Text style={{ color: native.muted, fontSize: 14 }}>
                    {(billing.computerSecondsUsed / 3600).toFixed(1)} of {billing.computerHours}{" "}
                    computer hours used
                  </Text>
                  <Text style={{ color: native.muted, fontSize: 13 }}>
                    Continues until {new Date(billing.legacyUntil).toLocaleDateString()}
                  </Text>
                </>
              ) : billing.billingEnabled ? (
                <>
                  <Text style={{ color: native.ink, fontSize: 34, fontWeight: "600" }}>
                    {usd(billing.remainingUsd)}{" "}
                    <Text style={{ fontSize: 16, fontWeight: "400", color: native.muted }}>
                      remaining
                    </Text>
                  </Text>
                  <View
                    accessibilityRole="progressbar"
                    accessibilityValue={{
                      min: 0,
                      max: billing.allowanceUsd,
                      now: Math.min(billing.allowanceUsd, billing.spentUsd + billing.reservedUsd),
                      text: `${usd(billing.spentUsd)} used of ${usd(billing.allowanceUsd)}`,
                    }}
                    style={{
                      height: 5,
                      borderRadius: 3,
                      backgroundColor: native.surface2,
                      overflow: "hidden",
                    }}
                  >
                    <View
                      style={{
                        height: 5,
                        width: `${Math.min(100, Math.max(0, ((billing.spentUsd + billing.reservedUsd) / Math.max(billing.allowanceUsd, 0.01)) * 100))}%`,
                        backgroundColor: billing.exhausted ? native.danger : native.accent,
                      }}
                    />
                  </View>
                  <Text style={{ color: native.muted, fontSize: 13 }}>
                    {usd(billing.spentUsd)} used of {usd(billing.allowanceUsd)}
                    {billing.reservedUsd > 0 ? ` · ${usd(billing.reservedUsd)} in progress` : ""}
                  </Text>
                  <Text style={{ color: native.muted, fontSize: 13 }}>
                    Resets {new Date(billing.resetAt).toLocaleDateString()}
                  </Text>
                  {billing.exhausted ? (
                    <Text style={{ color: native.danger }}>
                      Included usage is used up. Choose a plan or use your own model connection.
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text style={{ color: native.ink, fontSize: 16 }}>
                  Model usage is billed by your connected provider.
                </Text>
              )}
            </View>
            {billing.billingEnabled
              ? Object.values(PLANS).map((plan) => (
                  <View
                    key={plan.id}
                    style={{
                      padding: 18,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: plan.id === billing.plan ? native.accent : native.hairlineStrong,
                      gap: 8,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: native.ink, fontSize: 18, fontWeight: "600" }}>
                        {plan.name}
                      </Text>
                      <Text style={{ color: native.ink, fontSize: 18 }}>
                        {plan.priceUsd === 0 ? "Free" : `$${plan.priceUsd}/month`}
                      </Text>
                    </View>
                    <Text style={{ color: native.muted, fontSize: 14 }}>
                      ${plan.allowanceUsd} included model usage / month
                    </Text>
                    {plan.id === billing.plan ? (
                      <Text style={{ color: native.accent, fontSize: 13 }}>Current plan</Text>
                    ) : plan.id !== "free" && billing.checkoutEnabled ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Choose ${plan.name}`}
                        disabled={Boolean(pending)}
                        onPress={() => void checkout(plan.id as Exclude<PlanId, "free">)}
                        style={{
                          marginTop: 4,
                          minHeight: 44,
                          borderRadius: 12,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: native.cream,
                          opacity: pending ? 0.5 : 1,
                        }}
                      >
                        <Text style={{ color: native.creamInk, fontWeight: "600" }}>
                          {pending === plan.id ? "Opening…" : `Choose ${plan.name}`}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))
              : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
