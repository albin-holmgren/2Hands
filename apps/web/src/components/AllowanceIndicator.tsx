import { Trans, useLingui } from "@lingui/react/macro";
import type { Billing } from "@rakazo/contracts";
import { useEffect, useState } from "react";
import { useWorkspaceRpc } from "../lib/workspace-context";

export function AllowanceIndicator({
  running,
  onManage,
}: {
  running: boolean;
  onManage: () => void;
}) {
  const { t } = useLingui();
  const rpc = useWorkspaceRpc();
  const [billing, setBilling] = useState<Billing | null>(null);
  useEffect(() => {
    let live = true;
    const refresh = () => {
      void rpc.billing
        .get()
        .then((next) => {
          if (live) setBilling(next);
        })
        .catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      live = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [running, rpc]);
  if (!billing || billing.remainingUsd == null) return null;
  const remaining = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(billing.remainingUsd);
  return (
    <button
      type="button"
      data-testid="allowance-indicator"
      onClick={onManage}
      aria-label={t`Usage and plan`}
      className={`min-h-9 shrink-0 rounded-full px-3 text-[11.5px] tabular-nums hover:bg-[var(--rk-surface-2)] ${billing.exhausted && !billing.legacyUntil ? "text-[var(--rk-danger)]" : "text-[var(--rk-muted)]"}`}
    >
      {billing.legacyUntil ? (
        t`${billing.planName} plan`
      ) : billing.exhausted ? (
        <Trans>Balance used · View options</Trans>
      ) : (
        t`${remaining} remaining`
      )}
    </button>
  );
}
