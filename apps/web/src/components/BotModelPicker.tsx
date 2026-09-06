import { t } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { Bot, Me, ModelCatalogEntry, ModelCredential, ThinkingLevel } from "@rakazo/contracts";
import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildPickerModelOptions,
  modelOptionKey,
  pickerProviderRail,
  providerMark,
  thinkingLevelsForModel,
  thinkingPatchForModelChange,
} from "../lib/bot-model-options";
import { useWorkspaceRpc } from "../lib/workspace-context";

export function BotModelPicker({
  bot,
  onChanged,
  onManage,
}: {
  bot: Bot;
  onChanged: () => void | Promise<void>;
  onManage: () => void;
}) {
  const { t } = useLingui();
  const rpc = useWorkspaceRpc();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [loading, setLoading] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [railId, setRailId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ModelCatalogEntry[]>([]);
  const [credentials, setCredentials] = useState<ModelCredential[]>([]);
  const [me, setMe] = useState<Me | null>(null);

  const options = useMemo(
    () => buildPickerModelOptions(credentials, catalog),
    [credentials, catalog],
  );
  const rail = useMemo(() => pickerProviderRail(options), [options]);
  const selectedKey =
    bot.modelProvider && bot.modelId ? modelOptionKey(bot.modelProvider, bot.modelId) : "";
  const selected = options.find((option) => option.key === selectedKey);
  const defaultLabel =
    catalog.find((entry) => entry.provider === me?.defaultProvider && entry.id === me?.defaultModel)
      ?.label ?? me?.defaultModel;
  const triggerLabel = selected?.label ?? defaultLabel ?? t`Default`;
  const triggerDetail = selected?.providerLabel;
  const thinkingOptions = thinkingLevelsForModel(
    catalog,
    selected?.provider ?? me?.defaultProvider,
    selected?.modelId ?? me?.defaultModel,
  );
  const thinkingTitle = bot.thinkingLevel ? thinkingLevelLabel(bot.thinkingLevel) : null;

  const activeRail = railId;
  const trimmedQuery = query.trim().toLowerCase();
  const shown = options.filter((option) => {
    if (!trimmedQuery && activeRail && option.provider !== activeRail) return false;
    if (!trimmedQuery) return true;
    return (
      option.label.toLowerCase().includes(trimmedQuery) ||
      option.modelId.toLowerCase().includes(trimmedQuery) ||
      option.providerLabel.toLowerCase().includes(trimmedQuery)
    );
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([rpc.models.credentials(), rpc.models.list(), rpc.me()])
      .then(([nextCredentials, nextCatalog, nextMe]) => {
        if (cancelled) return;
        setCredentials(nextCredentials);
        setCatalog(nextCatalog);
        setMe(nextMe);
      })
      .catch(() => {
        if (!cancelled) setError(t`Could not load models. Try reopening the picker.`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, bot.id]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setError(null);
      return;
    }
    searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", closeOnOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  async function pick(next: { modelProvider: string | null; modelId: string | null }) {
    setPending(true);
    setError(null);
    try {
      const nextLevels = thinkingLevelsForModel(
        catalog,
        next.modelProvider ?? me?.defaultProvider,
        next.modelId ?? me?.defaultModel,
      );
      await rpc.bots.update({
        botId: bot.id,
        modelProvider: next.modelProvider,
        modelId: next.modelId,
        ...thinkingPatchForModelChange(bot.thinkingLevel, nextLevels),
      });
      await onChanged();
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Could not switch model`);
    } finally {
      setPending(false);
    }
  }

  async function pickThinking(level: ThinkingLevel | null) {
    setPending(true);
    setError(null);
    try {
      await rpc.bots.update({ botId: bot.id, thinkingLevel: level });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Could not switch model`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        data-testid="bot-model-picker"
        aria-label={t`Choose model`}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={pending}
        title={[triggerDetail, triggerLabel, thinkingTitle].filter(Boolean).join(" · ")}
        onClick={() => {
          setRailId(null);
          setOpen((wasOpen) => !wasOpen);
        }}
        className="app-no-drag flex min-h-8 max-w-[220px] items-center gap-1.5 rounded-full border border-[var(--rk-hairline-strong)] bg-[var(--rk-surface-2)] py-1 pl-2 pr-2.5 text-[13px] text-[var(--rk-ink)] hover:bg-[var(--rk-surface)] disabled:opacity-60"
      >
        {selected || (defaultLabel && defaultLabel !== t`Default`) ? (
          <span className="grid h-4 w-4 shrink-0 place-items-center rounded-[4px] bg-[var(--rk-surface)] text-[8px] font-semibold text-[var(--rk-muted)]">
            {providerMark(triggerDetail ?? triggerLabel)}
          </span>
        ) : null}
        <span className="min-w-0 truncate">{triggerLabel}</span>
        <ChevronDown
          size={14}
          strokeWidth={1.8}
          className={`shrink-0 text-[var(--rk-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={t`Choose model`}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              const rows = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "[data-model-option]:not(:disabled)",
                ),
              ];
              if (!rows.length) return;
              const index = rows.indexOf(document.activeElement as HTMLButtonElement);
              event.preventDefault();
              rows[
                (index + (event.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length
              ]?.focus();
            }
          }}
          className="absolute start-0 bottom-full z-40 mb-2 flex max-h-[min(480px,calc(100dvh-7rem))] w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[var(--rk-hairline-strong)] bg-[var(--rk-surface)] shadow-[var(--rk-shadow-popover)]"
        >
          {rail.length > 0 ? (
            <div className="flex w-14 shrink-0 flex-col gap-1 overflow-y-auto border-e border-[var(--rk-hairline-strong)] bg-[var(--rk-panel)] p-2">
              <button
                type="button"
                aria-label={t`All providers`}
                aria-pressed={activeRail === null}
                onClick={() => {
                  setRailId(null);
                  setQuery("");
                }}
                className="grid size-9 place-items-center rounded-lg text-[10px] text-[var(--rk-ink)] hover:bg-[var(--rk-surface-2)]"
              >
                <Trans>All</Trans>
              </button>
              {rail.map((item) => {
                const selectedRail = item.provider === activeRail;
                return (
                  <button
                    key={item.provider}
                    type="button"
                    title={item.label}
                    aria-label={item.label}
                    aria-pressed={selectedRail}
                    onClick={() => {
                      setRailId(item.provider);
                      setQuery("");
                    }}
                    className={`grid size-9 place-items-center rounded-lg text-[11px] font-semibold ${
                      selectedRail
                        ? "bg-[var(--rk-surface-2)] text-[var(--rk-ink)] ring-1 ring-[var(--rk-hairline-strong)]"
                        : "text-[var(--rk-muted)] hover:bg-[var(--rk-surface-2)] hover:text-[var(--rk-ink)]"
                    }`}
                  >
                    {providerMark(item.label)}
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-[var(--rk-hairline-strong)] px-3 py-2.5">
              <Search size={13} strokeWidth={1.8} className="shrink-0 text-[var(--rk-muted-2)]" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t`Search`}
                aria-label={t`Search models`}
                className="min-w-0 flex-1 rounded-md bg-transparent text-[13px] text-[var(--rk-ink)] outline-none placeholder:text-[var(--rk-muted-2)]"
              />
            </div>
            <div className="rk-scroll min-h-0 flex-1 overflow-y-auto py-1">
              {loading ? (
                <p role="status" className="px-3 py-2 text-xs text-[var(--rk-muted)]">
                  <Trans>Loading models…</Trans>
                </p>
              ) : null}
              <button
                type="button"
                data-model-option="default"
                disabled={pending}
                onClick={() => void pick({ modelProvider: null, modelId: null })}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-[13px] hover:bg-[var(--rk-surface-2)] ${
                  !selectedKey ? "text-[var(--rk-ink)]" : "text-[var(--rk-body)]"
                }`}
              >
                <span className="min-w-0 truncate">
                  {defaultLabel ? t`Space default · ${defaultLabel}` : t`Space default`}
                </span>
                {!selectedKey ? (
                  <Check size={14} className="shrink-0 text-[var(--rk-accent)]" />
                ) : null}
              </button>
              {shown.map((option) => {
                const current = option.key === selectedKey;
                const entry = catalog.find(
                  (item) => item.provider === option.provider && item.id === option.modelId,
                );
                const rates =
                  entry?.inputUsdPerMillion != null && entry?.outputUsdPerMillion != null
                    ? t`$${entry.inputUsdPerMillion} in / $${entry.outputUsdPerMillion} out · 1M tokens`
                    : null;
                return (
                  <button
                    key={option.key}
                    data-model-option={option.key}
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      void pick({ modelProvider: option.provider, modelId: option.modelId })
                    }
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-[13px] hover:bg-[var(--rk-surface-2)] ${
                      current
                        ? "bg-[var(--rk-surface-2)] text-[var(--rk-ink)]"
                        : "text-[var(--rk-body)]"
                    }`}
                  >
                    <span className="min-w-0 text-start">
                      <span className="block truncate">{option.label}</span>
                      <span className="mt-0.5 block text-[10.5px] text-[var(--rk-muted)]">
                        {entry?.platform ? t`Included balance` : t`Your key`}
                        {rates ? ` · ${rates}` : ""}
                      </span>
                    </span>
                    {current ? (
                      <Check size={14} className="shrink-0 text-[var(--rk-accent)]" />
                    ) : null}
                  </button>
                );
              })}
              {trimmedQuery && shown.length === 0 ? (
                <p className="px-3 py-2 text-[13px] text-[var(--rk-muted)]">
                  <Trans>No matching models</Trans>
                </p>
              ) : null}
            </div>
            {error ? (
              <p role="alert" className="px-3 py-2 text-[12.5px] text-[var(--rk-danger-soft)]">
                {error}
              </p>
            ) : null}
            {thinkingOptions.length ? (
              <fieldset
                aria-label={t`Thinking`}
                className="flex flex-wrap gap-1 border-t border-[var(--rk-hairline-strong)] px-3 py-2"
              >
                <button
                  type="button"
                  disabled={pending}
                  aria-pressed={!bot.thinkingLevel}
                  onClick={() => void pickThinking(null)}
                  className={`rounded-full px-2.5 py-1 text-[12px] ${
                    !bot.thinkingLevel
                      ? "bg-[var(--rk-surface-2)] text-[var(--rk-ink)]"
                      : "text-[var(--rk-muted)] hover:bg-[var(--rk-surface-2)] hover:text-[var(--rk-ink)]"
                  }`}
                >
                  <Trans>Default</Trans>
                </button>
                {thinkingOptions.map((level) => {
                  const current = bot.thinkingLevel === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      disabled={pending}
                      aria-pressed={current}
                      onClick={() => void pickThinking(level)}
                      className={`rounded-full px-2.5 py-1 text-[12px] ${
                        current
                          ? "bg-[var(--rk-surface-2)] text-[var(--rk-ink)]"
                          : "text-[var(--rk-muted)] hover:bg-[var(--rk-surface-2)] hover:text-[var(--rk-ink)]"
                      }`}
                    >
                      {thinkingLevelLabel(level)}
                    </button>
                  );
                })}
              </fieldset>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onManage();
              }}
              className="border-t border-[var(--rk-hairline-strong)] px-3 py-2.5 text-start text-[13px] text-[var(--rk-muted)] hover:bg-[var(--rk-surface-2)] hover:text-[var(--rk-ink)]"
            >
              <Trans>Manage models</Trans>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function thinkingLevelLabel(level: ThinkingLevel) {
  if (level === "xhigh") return t`Extra high`;
  if (level === "low") return t`Low`;
  if (level === "medium") return t`Medium`;
  if (level === "high") return t`High`;
  if (level === "minimal") return t`Minimal`;
  if (level === "max") return t`Max`;
  return `${level.slice(0, 1).toUpperCase()}${level.slice(1)}`;
}
