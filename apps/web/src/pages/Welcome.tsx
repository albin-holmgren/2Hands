import { Trans } from "@lingui/react/macro";
import { BrandMark } from "@rakazo/ui-web";
import { Link } from "react-router-dom";
import { useAuthCapabilities } from "../lib/auth-capabilities";
import { WindowChrome } from "./WindowChrome";

export function WelcomePage() {
  const { capabilities, unavailable, retry } = useAuthCapabilities();
  const registrationClosed = capabilities?.signupsEnabled === false;
  return (
    <div
      data-rakazo-route-ready="true"
      className="flex min-h-full flex-col bg-[var(--rk-page)] text-[var(--rk-ink)]"
    >
      <div className="app-drag flex gap-2 px-5 py-[18px]">
        <WindowChrome />
      </div>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <div className="mb-8 flex items-center gap-2.5">
          <BrandMark size={48} />
          <span className="text-2xl font-semibold tracking-tight">2hands</span>
        </div>
        <h1 className="max-w-lg text-4xl font-medium leading-tight tracking-tight sm:text-5xl">
          <Trans>A workspace for your AI.</Trans>
        </h1>
        <p className="mt-5 max-w-md text-[16px] leading-relaxed text-[var(--rk-muted)]">
          <Trans>Choose your model. Give it real work. Pick up anywhere.</Trans>
        </p>
        {capabilities ? (
          <Link
            to={registrationClosed ? "/sign-in" : "/sign-up"}
            className="mt-9 rounded-xl bg-[var(--rk-cream)] px-7 py-3.5 text-[15px] font-medium text-[var(--rk-cream-ink)] transition-opacity hover:opacity-90"
          >
            {registrationClosed ? <Trans>Sign in</Trans> : <Trans>Start free</Trans>}
          </Link>
        ) : (
          <button
            type="button"
            disabled={!unavailable}
            onClick={retry}
            className="mt-9 min-h-12 rounded-xl border border-[var(--rk-hairline-strong)] px-7 text-[15px] text-[var(--rk-muted)]"
          >
            {unavailable ? <Trans>Try again</Trans> : <Trans>Loading…</Trans>}
          </button>
        )}
        {capabilities && !registrationClosed ? (
          <p className="mt-3 text-xs text-[var(--rk-muted)]">
            <Trans>No card or API key needed</Trans>
          </p>
        ) : null}
        {!registrationClosed ? (
          <Link
            to="/sign-in"
            className="mt-8 rounded-lg px-4 py-2 text-sm text-[var(--rk-muted)] hover:text-[var(--rk-ink)]"
          >
            <Trans>Sign in</Trans>
          </Link>
        ) : null}
      </main>
    </div>
  );
}
