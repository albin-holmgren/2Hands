import { Trans, useLingui } from "@lingui/react/macro";
import type { Billing, BillingPlanChangeStatus } from "@rakazo/contracts";
import { PLANS } from "@rakazo/core";
import { useEffect, useRef, useState } from "react";
import { useWorkspaceRpc } from "../lib/workspace-context";
import { BuiButton, BuiCard } from "./beautiful-ui/primitives";

type PaidPlan = "plus" | "pro" | "ultra";
type Confirmation = { plan: PaidPlan; effectiveAt: string } | { cancel: true; effectiveAt: string };

export function BillingPlanSettings({ className }: { className?: string }) {
  const rpc = useWorkspaceRpc();
  const { t } = useLingui();
  const [billing, setBilling] = useState<Billing | null>(null);
  const [status, setStatus] = useState<BillingPlanChangeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const confirmationRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    const request = ++generation.current;
    pending.current = false;
    setBusy(false);
    setBilling(null);
    setStatus(null);
    setError(null);
    setConfirmation(null);
    void (async () => {
      try {
        const next = await rpc.billing.get();
        if (request !== generation.current) return;
        setBilling(next);
        if (next.checkoutEnabled) {
          const nextStatus = await rpc.billing.planChangeStatus();
          if (request === generation.current) setStatus(nextStatus);
        }
      } catch (cause) {
        if (request === generation.current) {
          setError(cause instanceof Error ? cause.message : t`Could not load your plan.`);
        }
      }
    })();
    return () => {
      generation.current++;
    };
  }, [rpc, revision, t]);

  useEffect(() => {
    if (confirmation) confirmationRef.current?.focus();
    else if (!busy && restoreFocus.current) {
      restoreFocus.current = false;
      sectionRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    }
  }, [confirmation, busy]);

  async function act(action: () => Promise<BillingPlanChangeStatus | { url: string }>) {
    if (pending.current) return;
    const request = generation.current;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (request !== generation.current) return;
      if ("url" in result) window.location.assign(result.url);
      else {
        restoreFocus.current = true;
        setStatus(result);
        setConfirmation(null);
      }
    } catch (cause) {
      if (request === generation.current) {
        restoreFocus.current = true;
        setError(cause instanceof Error ? cause.message : t`Could not update billing. Try again.`);
        // A timeout can follow a successful provider write. Refresh before another change.
        setStatus(null);
        setConfirmation(null);
      }
    } finally {
      if (request === generation.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }

  const hasSubscription = status
    ? status.currentPeriodEnd !== null || status.currentPlan !== "free"
    : !!billing &&
      (billing.plan !== "free" || ["past_due", "unpaid", "incomplete"].includes(billing.status));
  const date = (value: string) =>
    new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  const renewalDate = status?.currentPeriodEnd;
  const canChange = !busy && !!status && (!hasSubscription || (status.canChange && renewalDate));

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      className={`${className ?? ""} outline-none [&_button]:min-h-11`}
      aria-busy={busy}
      data-testid="billing-plan-settings"
    >
      <h3 className="text-[15px] font-medium text-[var(--rk-ink)]">
        <Trans>Plan</Trans>
      </h3>
      <p className="mt-3 text-[14px] text-[var(--rk-body)]">
        {billing
          ? `${billing.planName} · $${billing.priceUsd}/mo`
          : error
            ? t`Plan unavailable`
            : t`Loading plan…`}
      </p>
      {billing ? (
        <p className="mt-2 text-[13px] text-[var(--rk-muted)]">
          {billing.legacyUntil
            ? t`Your current included usage continues until ${date(billing.legacyUntil)}`
            : billing.remainingUsd != null && billing.allowanceUsd != null
              ? t`$${billing.remainingUsd.toFixed(2)} of $${billing.allowanceUsd.toFixed(2)} remaining`
              : t`${billing.tokensUsed.toLocaleString()} tokens used this period`}
        </p>
      ) : null}
      {billing?.allowanceUsd != null && billing.remainingUsd != null && !billing.legacyUntil ? (
        <meter
          className="rk-balance-meter mt-3 h-1.5 w-full"
          aria-label={t`Included balance remaining`}
          min={0}
          max={Math.max(billing.allowanceUsd, 0.01)}
          value={billing.remainingUsd}
        />
      ) : null}
      {billing ? (
        <p className="mt-2 text-xs text-[var(--rk-muted-2)]">
          {billing.legacyUntil
            ? t`${billing.tokensUsed.toLocaleString()} of ${billing.monthlyTokens.toLocaleString()} included tokens used`
            : billing.spentUsd != null
              ? t`$${billing.spentUsd.toFixed(2)} spent · $${(billing.reservedUsd ?? 0).toFixed(2)} reserved for running work`
              : null}
        </p>
      ) : null}
      {billing?.resetAt && !billing.legacyUntil && !status?.cancelAtPeriodEnd ? (
        <p className="mt-2 text-xs text-[var(--rk-muted)]">{t`Renews ${date(billing.resetAt)}`}</p>
      ) : null}
      {billing?.exhausted && !billing.legacyUntil ? (
        <p className="mt-2 text-[13px] text-[var(--rk-danger)]">
          <Trans>Your included balance is used. Connect your own model or wait for renewal.</Trans>
        </p>
      ) : null}
      {status?.pendingChange ? (
        <div className="mt-4 rounded-xl border border-[var(--rk-hairline)] p-3" role="status">
          <p className="text-[13px] text-[var(--rk-ink)]">
            {t`${PLANS[status.pendingChange.plan].name} · $${status.pendingChange.priceUsd}/month from ${date(status.pendingChange.effectiveAt)}`}
          </p>
          <div className="mt-2">
            <BuiButton
              disabled={busy || !status.canManageCancellation}
              onClick={() => void act(() => rpc.billing.cancelPlanChange())}
            >
              <Trans>Undo change</Trans>
            </BuiButton>
          </div>
        </div>
      ) : null}
      {status?.cancelAtPeriodEnd && renewalDate ? (
        <div className="mt-4 rounded-xl border border-[var(--rk-hairline)] p-3" role="status">
          <p className="text-[13px] text-[var(--rk-ink)]">{t`Subscription ends ${date(renewalDate)}. Your account continues on Free.`}</p>
          <div className="mt-2">
            <BuiButton
              disabled={busy || !status.canManageCancellation}
              onClick={() =>
                void act(() =>
                  rpc.billing.setCancelAtPeriodEnd({
                    cancel: false,
                    expectedPeriodEnd: renewalDate,
                  }),
                )
              }
            >
              <Trans>Keep subscription</Trans>
            </BuiButton>
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="mt-3" role="alert">
          <p className="text-[13px] text-[var(--rk-danger)]">{error}</p>
          <div className="mt-2">
            <BuiButton
              disabled={busy}
              onClick={() => {
                sectionRef.current?.focus();
                setRevision((value) => value + 1);
              }}
            >
              <Trans>Refresh billing</Trans>
            </BuiButton>
          </div>
        </div>
      ) : null}
      {hasSubscription && status?.unavailableReason ? (
        <p className="mt-3 text-[13px] text-[var(--rk-muted)]">{status.unavailableReason}</p>
      ) : null}
      {billing?.checkoutEnabled ? (
        <>
          {!confirmation ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {(["plus", "pro", "ultra"] as const).map((plan) => (
                <BuiButton
                  key={plan}
                  disabled={
                    !canChange ||
                    billing.plan === plan ||
                    status?.pendingChange?.plan === plan ||
                    !!status?.cancelAtPeriodEnd
                  }
                  onClick={() => {
                    if (hasSubscription && renewalDate)
                      setConfirmation({ plan, effectiveAt: renewalDate });
                    else if (!hasSubscription) void act(() => rpc.billing.checkout({ plan }));
                  }}
                >
                  {PLANS[plan].name} ${PLANS[plan].priceUsd}
                </BuiButton>
              ))}
            </div>
          ) : (
            <div
              ref={confirmationRef}
              tabIndex={-1}
              className="mt-4 outline-none"
              data-testid="billing-confirmation"
            >
              <BuiCard className="border border-[var(--rk-hairline-strong)] p-4">
                <h4 className="text-[14px] font-medium text-[var(--rk-ink)]">
                  {"plan" in confirmation
                    ? t`Switch to ${PLANS[confirmation.plan].name}?`
                    : t`Cancel subscription?`}
                </h4>
                <p className="mt-2 text-[13px] leading-relaxed text-[var(--rk-body)]">
                  {"plan" in confirmation
                    ? t`$${PLANS[confirmation.plan].priceUsd}/month starting ${date(confirmation.effectiveAt)}, including $${PLANS[confirmation.plan].allowanceUsd} of usage each month.`
                    : t`Subscription ends ${date(confirmation.effectiveAt)}. Any scheduled plan change will be removed.`}
                </p>
                {"plan" in confirmation ? (
                  <p className="mt-2 text-xs text-[var(--rk-muted)]">
                    <Trans>Your current plan and balance stay in place until then.</Trans>
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <BuiButton
                    tone="accent"
                    disabled={busy}
                    onClick={() =>
                      void act(() =>
                        "plan" in confirmation
                          ? rpc.billing.schedulePlanChange({
                              plan: confirmation.plan,
                              expectedPeriodEnd: confirmation.effectiveAt,
                            })
                          : rpc.billing.setCancelAtPeriodEnd({
                              cancel: true,
                              expectedPeriodEnd: confirmation.effectiveAt,
                            }),
                      )
                    }
                  >
                    {busy
                      ? t`Saving…`
                      : "plan" in confirmation
                        ? t`Schedule change`
                        : t`Cancel at renewal`}
                  </BuiButton>
                  <BuiButton
                    disabled={busy}
                    onClick={() => {
                      restoreFocus.current = true;
                      setConfirmation(null);
                    }}
                  >
                    <Trans>Back</Trans>
                  </BuiButton>
                </div>
              </BuiCard>
            </div>
          )}
          {hasSubscription ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <BuiButton disabled={busy} onClick={() => void act(() => rpc.billing.portal())}>
                <Trans>Manage billing</Trans>
              </BuiButton>
              {status?.canManageCancellation &&
              renewalDate &&
              !status.cancelAtPeriodEnd &&
              !confirmation ? (
                <BuiButton
                  disabled={busy}
                  onClick={() => setConfirmation({ cancel: true, effectiveAt: renewalDate })}
                >
                  <Trans>Cancel subscription</Trans>
                </BuiButton>
              ) : null}
            </div>
          ) : null}
        </>
      ) : billing ? (
        <p className="mt-2 text-[13px] text-[var(--rk-muted)]">
          <Trans>Billing is not configured on this deployment.</Trans>
        </p>
      ) : null}
    </section>
  );
}
