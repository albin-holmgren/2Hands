import { Trans } from "@lingui/react/macro";
import { Link } from "react-router-dom";
import { WindowChrome } from "./WindowChrome";

export function WelcomePage() {
  return (
    <div className="flex min-h-full flex-col bg-[var(--rk-page)] text-[var(--rk-ink)]">
      <div className="app-drag flex gap-2 px-5 py-[18px]">
        <WindowChrome />
      </div>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <div className="mb-8 flex items-center gap-4">
          <div
            aria-hidden
            className="flex size-14 items-center justify-center gap-2 rounded-2xl bg-[var(--rk-cream)]"
          >
            <span className="h-5 w-2 rounded-full bg-[var(--rk-cream-ink)]" />
            <span className="h-5 w-2 rounded-full bg-[var(--rk-cream-ink)]" />
          </div>
          <span className="text-3xl font-medium tracking-tight">2hands</span>
        </div>
        <h1 className="max-w-lg text-4xl font-medium leading-tight tracking-tight sm:text-5xl">
          <Trans>A workspace for your AI.</Trans>
        </h1>
        <p className="mt-5 max-w-md text-[16px] leading-relaxed text-[var(--rk-muted)]">
          <Trans>Choose your model. Give it real work. Pick up anywhere.</Trans>
        </p>
        <Link
          to="/sign-up"
          className="mt-9 rounded-full bg-[var(--rk-cream)] px-7 py-3.5 text-[15px] font-medium text-[var(--rk-cream-ink)] transition-transform hover:-translate-y-0.5"
        >
          <Trans>Start free</Trans>
        </Link>
        <p className="mt-3 text-xs text-[var(--rk-muted)]">
          <Trans>No card or API key needed</Trans>
        </p>
        <Link
          to="/sign-in"
          className="mt-8 rounded-lg px-4 py-2 text-sm text-[var(--rk-muted)] hover:text-[var(--rk-ink)]"
        >
          <Trans>Sign in</Trans>
        </Link>
      </main>
    </div>
  );
}
