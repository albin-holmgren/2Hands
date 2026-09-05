import { Trans, useLingui } from "@lingui/react/macro";
import type { Space } from "@rakazo/contracts";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function WorkspaceSwitcher({
  spaces,
  selectedId,
  onSelect,
  onCreate,
}: {
  spaces: Space[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const current = spaces.find((space) => space.id === selectedId);
  const filtered = spaces.filter((space) => space.name.toLowerCase().includes(query.toLowerCase()));
  function close() {
    setOpen(false);
    setQuery("");
    trigger.current?.focus();
  }
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div ref={root} className="app-no-drag relative mx-3 mb-3">
      <button
        ref={trigger}
        type="button"
        data-testid="workspace-switcher"
        aria-label={t`Switch workspace`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2.5 py-2 text-start hover:bg-[var(--rk-surface-2)]"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-[var(--rk-cream)] text-sm font-semibold text-[var(--rk-cream-ink)]">
          {(current?.name ?? "Personal").slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-[var(--rk-ink)]">
          {current?.name ?? t`Personal`}
        </span>
        <ChevronsUpDown size={14} className="text-[var(--rk-muted)]" />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={t`Workspaces`}
          className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-2xl border border-[var(--rk-hairline-strong)] bg-[var(--rk-panel)] p-1.5 shadow-xl"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              close();
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              const buttons = [
                ...(event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button:not(:disabled)",
                ) ?? []),
              ];
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              const next =
                event.key === "ArrowDown"
                  ? (index + 1) % buttons.length
                  : (index - 1 + buttons.length) % buttons.length;
              event.preventDefault();
              buttons[next]?.focus();
            }
          }}
        >
          <label className="mb-1 flex items-center gap-2 border-b border-[var(--rk-hairline)] px-2 py-2.5">
            <Search size={14} className="text-[var(--rk-muted)]" />
            <input
              ref={input}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label={t`Search workspaces`}
              placeholder={t`Search workspaces`}
              className="min-w-0 flex-1 rounded-md bg-transparent text-[13px] text-[var(--rk-ink)] outline-none"
            />
          </label>
          <div className="rk-scroll max-h-72 overflow-y-auto">
            {filtered.map((space) => {
              const unread =
                space.bots.filter((bot) => bot.unread).length +
                space.groups.filter((group) => group.unread).length;
              const working = space.bots.some((bot) =>
                ["running", "queued", "leased", "waiting_input", "waiting_takeover"].includes(
                  bot.status,
                ),
              );
              return (
                <button
                  type="button"
                  key={space.id}
                  aria-current={space.id === selectedId ? "true" : undefined}
                  onClick={() => {
                    close();
                    onSelect(space.id);
                  }}
                  className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-start text-[13.5px] text-[var(--rk-body)] hover:bg-[var(--rk-surface-2)]"
                >
                  <span className="min-w-0 flex-1 truncate">{space.name}</span>
                  {working ? (
                    <span
                      role="img"
                      className="size-1.5 rounded-full bg-[var(--rk-accent)]"
                      aria-label={t`Active work`}
                    />
                  ) : null}
                  {unread > 0 ? (
                    <span className="rounded-full bg-[var(--rk-surface-2)] px-1.5 text-xs tabular-nums text-[var(--rk-muted)]">
                      {unread}
                      <span className="sr-only">{t` unread`}</span>
                    </span>
                  ) : null}
                  {space.id === selectedId ? (
                    <Check size={14} className="text-[var(--rk-accent)]" />
                  ) : null}
                </button>
              );
            })}
            {!filtered.length ? (
              <p className="px-3 py-4 text-[13px] text-[var(--rk-muted)]">
                <Trans>No workspaces found</Trans>
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              close();
              onCreate();
            }}
            className="mt-1 flex min-h-11 w-full items-center gap-2 rounded-xl border-t border-[var(--rk-hairline)] px-3 text-[13.5px] text-[var(--rk-ink)] hover:bg-[var(--rk-surface-2)]"
          >
            <Plus size={15} />
            <Trans>New workspace</Trans>
          </button>
        </div>
      ) : null}
    </div>
  );
}
