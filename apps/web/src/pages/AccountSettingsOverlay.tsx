import { Trans, useLingui } from "@lingui/react/macro";
import type { AvatarStyle, Billing } from "@rakazo/contracts";
import { BotAvatar } from "@rakazo/ui-web";
import { ArrowDownToLine, ChevronDown, Gauge, Monitor, Settings, X } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { ApprovalRulesSettings } from "../components/ApprovalRulesSettings";
import { BuiButton, SuccessPop } from "../components/beautiful-ui/primitives";
import {
  ComputersUnavailableHint,
  computersAreUnavailable,
} from "../components/ComputersUnavailableHint";
import { SoftwareUpdateSection } from "../components/SoftwareUpdateSection";
import { authClient } from "../lib/auth";
import { getActiveUiLocale, setUiLocale } from "../lib/i18n";
import { UI_LOCALE_LABELS, UI_LOCALES, type UiLocale } from "../lib/ui-locale";
import {
  applyUiThemePreference,
  readUiThemePreference,
  type UiThemePreference,
} from "../lib/ui-theme";
import { useWorkspaceRpc } from "../lib/workspace-context";

export function AccountSettingsOverlay({
  email,
  name,
  usage,
  focusUsage,
  avatarStyle,
  onAvatarStyleChange,
  isDeploymentOwner = false,
  sandboxProvider,
  messagingEnabled = false,
  onOpenMessaging,
  onClose,
}: {
  email?: string | null;
  name: string;
  usage?: { runs: number; inputTokens: number; outputTokens: number } | null;
  focusUsage?: boolean;
  avatarStyle: AvatarStyle;
  onAvatarStyleChange: (style: AvatarStyle) => Promise<void>;
  isDeploymentOwner?: boolean;
  sandboxProvider?: string | null;
  messagingEnabled?: boolean;
  onOpenMessaging?: () => void;
  onClose: () => void;
}) {
  const rpc = useWorkspaceRpc();
  const { t } = useLingui();
  const panelRef = useRef<HTMLDivElement>(null);
  const usageRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [locale, setLocale] = useState<UiLocale>(() => getActiveUiLocale());
  const localeRequestRef = useRef(0);
  const [avatarPending, setAvatarPending] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingBusy, setBillingBusy] = useState<"plus" | "pro" | "ultra" | "portal" | null>(null);
  const [themePreference, setThemePreference] = useState<UiThemePreference>(readUiThemePreference);
  const [section, setSection] = useState<"general" | "computer" | "usage" | "updates">(
    focusUsage ? "usage" : "general",
  );

  useEffect(() => {
    void rpc.billing
      .get()
      .then(setBilling)
      .catch(() => setBillingError(t`Could not load your plan. Reopen settings to retry.`));
  }, []);

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Tab") {
        const items = [
          ...(panelRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]',
          ) ?? []),
        ].filter((item) => item.getClientRects().length > 0);
        const first = items[0],
          last = items.at(-1);
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === panelRef.current)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
        return;
      }
      if (event.key !== "Escape") return;
      const localeOpen = panelRef.current?.querySelector(
        '[data-testid="ui-locale-select"][aria-expanded="true"]',
      );
      if (localeOpen) return;
      onCloseRef.current();
    }
    window.addEventListener("keydown", handleKeyDown);
    if (focusUsage) {
      setSection("usage");
      usageRef.current?.focus();
    } else panelRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [focusUsage]);

  function chooseLocale(next: UiLocale) {
    if (next === locale) return;
    const requestId = ++localeRequestRef.current;
    setLocale(next);
    void setUiLocale(next).then((activated) => {
      if (requestId !== localeRequestRef.current) return;
      setLocale(activated);
    });
  }

  async function chooseAvatarStyle(next: AvatarStyle) {
    if (avatarPending || next === avatarStyle) return;
    setAvatarPending(true);
    setAvatarError(null);
    try {
      await onAvatarStyleChange(next);
    } catch {
      setAvatarError(t`Couldn't update avatars`);
    } finally {
      setAvatarPending(false);
    }
  }

  const nav = [
    { id: "general" as const, label: t`General`, icon: Settings },
    { id: "computer" as const, label: t`Computer`, icon: Monitor },
    { id: "usage" as const, label: t`Usage`, icon: Gauge },
    { id: "updates" as const, label: t`Updates`, icon: ArrowDownToLine },
  ];
  const card =
    "rounded-[14px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-panel)] px-4 py-4";

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(4,4,5,.62)] p-4 sm:p-10">
      <div
        ref={panelRef}
        data-testid="user-settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-settings-title"
        tabIndex={-1}
        className="flex max-h-[min(720px,100%)] w-[min(860px,100%)] overflow-hidden rounded-[20px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-surface)] shadow-[0_40px_90px_rgba(0,0,0,.45)]"
      >
        <nav
          aria-label={t`Settings`}
          className="hidden w-[220px] shrink-0 flex-col gap-1 border-e border-[var(--rk-hairline)] bg-[var(--rk-sidebar)] p-3 sm:flex"
        >
          {nav.map((item) => {
            const Icon = item.icon;
            const current = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={current}
                onClick={() => setSection(item.id)}
                className={`flex min-h-11 items-center gap-2.5 rounded-[12px] px-3 text-start text-[14px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rk-accent)] ${
                  current
                    ? "bg-[var(--rk-surface-2)] text-[var(--rk-ink)]"
                    : "text-[var(--rk-muted)] hover:bg-[var(--rk-surface-2)] hover:text-[var(--rk-ink)]"
                }`}
              >
                <Icon size={16} strokeWidth={1.7} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="rk-scroll min-w-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-7">
          <div className="mb-5 flex items-start justify-between gap-6">
            <h2 id="account-settings-title" className="text-2xl font-medium text-[var(--rk-ink)]">
              <Trans>Settings</Trans>
            </h2>
            <button
              type="button"
              aria-label={t`Close user settings`}
              onClick={onClose}
              className="grid size-9 place-items-center rounded-full text-[var(--rk-muted)] hover:bg-[var(--rk-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rk-accent)]"
            >
              <X size={16} strokeWidth={1.8} />
            </button>
          </div>
          <div className="mb-5 flex gap-1 sm:hidden">
            {nav.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`min-h-9 rounded-full px-3 text-[13px] ${
                  section === item.id
                    ? "bg-[var(--rk-surface-2)] text-[var(--rk-ink)]"
                    : "text-[var(--rk-muted)]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {section === "general" ? (
            <>
              <section className={card}>
                <h3 className="text-[12px] font-medium uppercase tracking-wide text-[var(--rk-muted-2)]">
                  <Trans>Account</Trans>
                </h3>
                <p className="mt-3 text-[14px] text-[var(--rk-ink)]">{name}</p>
                {email ? <p className="mt-1 text-[13px] text-[var(--rk-muted)]">{email}</p> : null}
              </section>
              <section className={`mt-4 ${card}`}>
                <h3 className="text-[12px] font-medium uppercase tracking-wide text-[var(--rk-muted-2)]">
                  <Trans>Appearance</Trans>
                </h3>
                <p className="mt-3 text-[14px] text-[var(--rk-ink)]">
                  <Trans>Theme</Trans>
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(
                    [
                      { id: "system", label: t`Follow system` },
                      { id: "dark", label: t`Dark` },
                      { id: "light", label: t`Light` },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={themePreference === option.id}
                      onClick={() => {
                        setThemePreference(option.id);
                        applyUiThemePreference(option.id);
                      }}
                      className={`min-h-9 rounded-full px-3.5 text-[13.5px] ${
                        themePreference === option.id
                          ? "bg-[var(--rk-cream)] text-[var(--rk-cream-ink)]"
                          : "bg-[var(--rk-surface-2)] text-[var(--rk-ink)]"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <h3 className="mt-5 text-[15px] font-medium text-[var(--rk-ink)]">
                  <Trans>Language</Trans>
                </h3>
                <UiLocalePicker value={locale} onChange={chooseLocale} />
                <h3 className="mt-5 text-[15px] font-medium text-[var(--rk-ink)]">
                  <Trans>Avatars</Trans>
                </h3>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {(["robot", "organic"] as const).map((style) => {
                    const selected = style === avatarStyle;
                    return (
                      <button
                        key={style}
                        type="button"
                        aria-pressed={selected}
                        disabled={avatarPending}
                        onClick={() => void chooseAvatarStyle(style)}
                        className={`flex min-h-11 items-center gap-3 rounded-[12px] border px-3.5 py-3 text-start text-[14px] text-[var(--rk-ink)] disabled:opacity-50 ${
                          selected
                            ? "border-[var(--rk-hairline-strong)] bg-[var(--rk-surface-2)]"
                            : "border-[var(--rk-hairline)] hover:border-[var(--rk-hairline-strong)]"
                        }`}
                      >
                        <BotAvatar
                          color="#D9508A"
                          identity="avatar-style-preview"
                          size={32}
                          variant={style}
                        />
                        <span>
                          {style === "robot" ? <Trans>Robot</Trans> : <Trans>Organic</Trans>}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {avatarError ? (
                  <p role="alert" className="mt-3 text-[12.5px] text-[var(--rk-danger)]">
                    {avatarError}
                  </p>
                ) : null}
              </section>
              <ChangePasswordSection />
              {messagingEnabled && onOpenMessaging ? (
                <section className={`mt-4 ${card}`}>
                  <h3 className="text-[15px] font-medium text-[var(--rk-ink)]">
                    <Trans>Messaging</Trans>
                  </h3>
                  <button
                    type="button"
                    onClick={onOpenMessaging}
                    className="mt-3 min-h-9 rounded-full bg-[var(--rk-surface-2)] px-4 text-[13.5px] font-medium text-[var(--rk-ink)]"
                  >
                    <Trans>Manage messaging settings</Trans>
                  </button>
                </section>
              ) : null}
              <details data-testid="advanced-settings" className={`group mt-4 ${card} px-0 py-0`}>
                <summary className="flex min-h-11 list-none items-center justify-between gap-4 px-4 py-4 text-[14px] text-[var(--rk-muted)]">
                  <span>
                    <span className="block text-[15px] text-[var(--rk-ink)]">
                      <Trans>Advanced</Trans>
                    </span>
                    <span className="mt-1 block text-[12.5px] text-[var(--rk-muted-2)]">
                      <Trans>Optional controls most people never need</Trans>
                    </span>
                  </span>
                  <span aria-hidden="true" className="transition-transform group-open:rotate-90">
                    ›
                  </span>
                </summary>
                <div className="border-t border-[var(--rk-hairline)] px-4 pb-5">
                  <ApprovalRulesSettings />
                </div>
              </details>
            </>
          ) : null}

          {section === "computer" ? (
            <div data-testid="computers-setup-settings" className={card}>
              <h3 className="text-[15px] font-medium text-[var(--rk-ink)]">
                <Trans>Computers</Trans>
              </h3>
              {isDeploymentOwner && computersAreUnavailable(sandboxProvider) ? (
                <ComputersUnavailableHint
                  showSetup
                  className="mt-3 text-[13px] leading-relaxed text-[var(--rk-muted)]"
                />
              ) : null}
            </div>
          ) : null}

          {section === "usage" ? (
            <>
              <section className={card}>
                <h3 className="text-[15px] font-medium text-[var(--rk-ink)]">
                  <Trans>Plan</Trans>
                </h3>
                <p className="mt-3 text-[14px] text-[var(--rk-body)]">
                  {billing
                    ? `${billing.planName} · $${billing.priceUsd}/mo`
                    : billingError
                      ? t`Plan unavailable`
                      : t`Loading plan…`}
                </p>
                {billing ? (
                  <p className="mt-2 text-[13px] text-[var(--rk-muted)]">
                    {billing.legacyUntil
                      ? t`Your current included usage continues until ${new Date(billing.legacyUntil).toLocaleDateString()}`
                      : billing.remainingUsd != null && billing.allowanceUsd != null
                        ? t`$${billing.remainingUsd.toFixed(2)} of $${billing.allowanceUsd.toFixed(2)} remaining`
                        : t`${billing.tokensUsed.toLocaleString()} tokens used this period`}
                  </p>
                ) : null}
                {billing?.allowanceUsd != null &&
                billing.remainingUsd != null &&
                !billing.legacyUntil ? (
                  <meter
                    className="rk-balance-meter mt-3 h-1.5 w-full"
                    aria-label={t`Included balance remaining`}
                    min={0}
                    max={Math.max(billing.allowanceUsd, 0.01)}
                    value={billing.remainingUsd}
                  />
                ) : null}
                {billing?.resetAt && !billing.legacyUntil ? (
                  <p className="mt-2 text-xs text-[var(--rk-muted)]">{t`Renews ${new Date(billing.resetAt).toLocaleDateString()}`}</p>
                ) : null}
                {billing?.exhausted && !billing.legacyUntil ? (
                  <p className="mt-2 text-[13px] text-[var(--rk-danger)]">
                    <Trans>
                      Your included balance is used. Upgrade, connect your own model, or wait for
                      renewal.
                    </Trans>
                  </p>
                ) : null}
                {billingError ? (
                  <p className="mt-2 text-[13px] text-[var(--rk-danger)]">{billingError}</p>
                ) : null}
                {billing?.checkoutEnabled ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(["plus", "pro", "ultra"] as const).map((plan) => (
                      <button
                        key={plan}
                        type="button"
                        disabled={billingBusy !== null || billing.plan === plan}
                        onClick={() => {
                          setBillingBusy(plan);
                          setBillingError(null);
                          void rpc.billing
                            .checkout({ plan })
                            .then((result) => {
                              window.location.href = result.url;
                            })
                            .catch((error) => {
                              setBillingError(
                                error instanceof Error
                                  ? error.message
                                  : t`Could not start checkout`,
                              );
                              setBillingBusy(null);
                            });
                        }}
                        className="min-h-9 rounded-full bg-[var(--rk-surface-2)] px-4 text-[13.5px] font-medium capitalize text-[var(--rk-ink)] disabled:opacity-40"
                      >
                        {plan === "plus"
                          ? t`Plus $20`
                          : plan === "pro"
                            ? t`Pro $60`
                            : t`Ultra $200`}
                      </button>
                    ))}
                    {billing.plan !== "free" ? (
                      <button
                        type="button"
                        disabled={billingBusy !== null}
                        onClick={() => {
                          setBillingBusy("portal");
                          setBillingError(null);
                          void rpc.billing
                            .portal()
                            .then((result) => {
                              window.location.href = result.url;
                            })
                            .catch((error) => {
                              setBillingError(
                                error instanceof Error
                                  ? error.message
                                  : t`Could not open billing portal`,
                              );
                              setBillingBusy(null);
                            });
                        }}
                        className="min-h-9 rounded-full px-4 text-[13.5px] font-medium text-[var(--rk-muted)]"
                      >
                        <Trans>Manage billing</Trans>
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-2 text-[13px] text-[var(--rk-muted)]">
                    <Trans>Billing is not configured on this deployment.</Trans>
                  </p>
                )}
              </section>
              <div
                ref={usageRef}
                tabIndex={-1}
                data-testid="usage-settings"
                className={`mt-4 outline-none ${card}`}
              >
                <h3 className="text-[15px] font-medium text-[var(--rk-ink)]">
                  <Trans>Usage</Trans>
                </h3>
                {usage ? (
                  <p className="mt-3 text-[14px] text-[var(--rk-body)]">
                    <Trans>
                      {usage.runs} runs · {usage.inputTokens + usage.outputTokens} tokens
                    </Trans>
                  </p>
                ) : null}
                <p className={`text-[12.5px] text-[var(--rk-muted-2)] ${usage ? "mt-2" : "mt-3"}`}>
                  {billing?.legacyUntil
                    ? t`${billing.tokensUsed.toLocaleString()} of ${billing.monthlyTokens.toLocaleString()} included tokens used`
                    : billing?.spentUsd != null
                      ? t`$${billing.spentUsd.toFixed(2)} spent · $${(billing.reservedUsd ?? 0).toFixed(2)} reserved for running work`
                      : t`Usage is unavailable right now.`}
                </p>
              </div>
            </>
          ) : null}

          {section === "updates" ? (
            <SoftwareUpdateSection isDeploymentOwner={isDeploymentOwner} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ChangePasswordSection() {
  const { t } = useLingui();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changePassword() {
    if (pending) return;
    if (newPassword !== confirmation) {
      setError(t`Passwords do not match`);
      return;
    }
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (result.error) {
        setError(result.error.message ?? t`Could not change password`);
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      setSaved(true);
    } catch {
      setError(t`Could not reach the server`);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-4 rounded-[14px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-panel)] px-4 py-4">
      <h3 className="text-[15px] font-medium text-[var(--rk-ink)]">
        <Trans>Password</Trans>
      </h3>
      <div className="mt-3 grid gap-3">
        <SettingsPasswordInput
          label={t`Current password`}
          autoComplete="current-password"
          value={currentPassword}
          onChange={setCurrentPassword}
        />
        <SettingsPasswordInput
          label={t`New password`}
          autoComplete="new-password"
          value={newPassword}
          onChange={setNewPassword}
        />
        <SettingsPasswordInput
          label={t`Confirm password`}
          autoComplete="new-password"
          value={confirmation}
          onChange={setConfirmation}
        />
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-[12.5px] text-[var(--rk-danger)]">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex items-center gap-3">
        <BuiButton
          tone="accent"
          disabled={pending || currentPassword.length < 8 || newPassword.length < 8}
          onClick={() => void changePassword()}
        >
          {pending ? <Trans>Changing…</Trans> : <Trans>Change password</Trans>}
        </BuiButton>
        {saved ? <SuccessPop label={t`Password updated`} /> : null}
      </div>
    </section>
  );
}

function SettingsPasswordInput({
  label,
  autoComplete,
  value,
  onChange,
}: {
  label: string;
  autoComplete: "current-password" | "new-password";
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-[12.5px] text-[var(--rk-muted)]">
      {label}
      <input
        aria-label={label}
        type="password"
        autoComplete={autoComplete}
        minLength={8}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-[11px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-surface-2)] px-3.5 py-2.5 text-[14px] text-[var(--rk-ink)] outline-none focus-visible:border-[var(--rk-accent)]"
      />
    </label>
  );
}

function UiLocalePicker({
  value,
  onChange,
}: {
  value: UiLocale;
  onChange: (locale: UiLocale) => void;
}) {
  const { t } = useLingui();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const selectedIndex = Math.max(0, UI_LOCALES.indexOf(value));
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(selectedIndex);

  useEffect(() => {
    setHighlightedIndex(selectedIndex);
    setOpen(false);
  }, [selectedIndex, value]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[highlightedIndex]?.focus();
  }, [highlightedIndex, open]);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  function choose(index: number) {
    const next = UI_LOCALES[index];
    if (!next) return;
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveHighlight(index: number) {
    setHighlightedIndex((index + UI_LOCALES.length) % UI_LOCALES.length);
  }

  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setHighlightedIndex(UI_LOCALES.length - 1);
    }
  }

  function onOptionKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHighlight(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setHighlightedIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setHighlightedIndex(UI_LOCALES.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(index);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  return (
    <div ref={rootRef} className="relative mt-3">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        data-testid="ui-locale-select"
        aria-label={t`Language`}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex min-h-11 w-full items-center justify-between rounded-full border border-[var(--rk-hairline-strong)] bg-[var(--rk-surface-2)] px-3.5 py-3 text-start text-[var(--rk-ink)] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rk-accent)]"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="min-w-0 truncate">{UI_LOCALE_LABELS[value]}</span>
        <span className="ml-3 shrink-0 text-[var(--rk-muted)]" aria-hidden="true">
          <ChevronDown size={16} strokeWidth={1.8} />
        </span>
      </button>
      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={t`Language`}
          className="rk-scroll absolute left-0 right-0 top-full z-20 mt-2 overflow-y-auto rounded-[12px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-surface)] p-1 shadow-[0_20px_45px_rgba(0,0,0,.35)]"
        >
          {UI_LOCALES.map((code, index) => (
            <button
              key={code}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              type="button"
              role="option"
              aria-selected={code === value}
              tabIndex={index === highlightedIndex ? 0 : -1}
              className={`w-full rounded-[8px] px-3 py-2 text-start text-[13.5px] text-[var(--rk-ink)] outline-none hover:bg-[var(--rk-surface-2)] focus-visible:bg-[var(--rk-surface-2)] ${
                code === value ? "bg-[var(--rk-surface-2)]" : ""
              }`}
              onClick={() => choose(index)}
              onKeyDown={(event) => onOptionKeyDown(event, index)}
            >
              {UI_LOCALE_LABELS[code]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
