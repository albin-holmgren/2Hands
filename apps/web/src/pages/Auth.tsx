import { Trans, useLingui } from "@lingui/react/macro";
import { BrandMark } from "@rakazo/ui-web";
import { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { authClient } from "../lib/auth";
import { useAuthCapabilities } from "../lib/auth-capabilities";
import { authReturnPath } from "../lib/auth-return-path";
import { clearSpaceSelection } from "../lib/rpc";

type AuthMode = "in" | "up" | "forgot";

export function AuthPage({ mode }: { mode: AuthMode }) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const { capabilities: reset, unavailable, retry } = useAuthCapabilities();
  const passwordFieldId = mode === "in" ? "current-password" : "new-password";
  const title =
    mode === "in" ? (
      <Trans>Sign in to 2hands</Trans>
    ) : mode === "up" ? (
      <Trans>Create your 2hands</Trans>
    ) : (
      <Trans>Reset your password</Trans>
    );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || ((mode === "up" || mode === "forgot") && !reset)) return;
    if (mode === "up" && reset?.signupsEnabled === false) return;
    setPending(true);
    setError(null);
    try {
      if (mode === "forgot") {
        if (!reset?.passwordReset || !reset.resetUrl) {
          setError(t`Password recovery is not configured for this server`);
          return;
        }
        const result = await authClient.requestPasswordReset({
          email: email.trim(),
          redirectTo: reset.resetUrl,
        });
        if (result.error) {
          setError(result.error.message ?? t`Could not send reset email`);
          return;
        }
        setSent(true);
        return;
      }
      const result =
        mode === "up"
          ? await authClient.signUp.email({
              email: email.trim(),
              password,
              name: name.trim() || email.trim().split("@")[0] || "User",
            })
          : await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) {
        setError(result.error.message ?? t`Could not continue`);
        return;
      }
      clearSpaceSelection();
      navigate(mode === "up" ? "/onboarding" : authReturnPath(location.state), { replace: true });
    } catch {
      setError(t`Could not reach the server`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      data-rakazo-route-ready="true"
      className="flex min-h-full items-center justify-center bg-[var(--rk-page)] px-6 py-16 text-[var(--rk-ink)]"
    >
      <form
        onSubmit={submit}
        aria-busy={pending}
        className="flex w-full max-w-[400px] flex-col items-center"
      >
        <BrandMark size={52} />
        <h1 className="mb-8 mt-6 text-[28px] font-medium tracking-[-0.025em]">{title}</h1>
        {unavailable && mode !== "in" ? (
          <div className="w-full text-center">
            <p role="alert" className="text-sm text-[var(--rk-muted)]">
              <Trans>Could not load account options.</Trans>
            </p>
            <button
              type="button"
              onClick={retry}
              className="mt-4 min-h-11 rounded-[10px] bg-[var(--rk-cream)] px-5 text-sm text-[var(--rk-cream-ink)]"
            >
              <Trans>Try again</Trans>
            </button>
            <Link to="/sign-in" className="mt-5 block text-sm">
              <Trans>Back to sign in</Trans>
            </Link>
          </div>
        ) : mode === "forgot" && reset && (!reset.passwordReset || !reset.resetUrl) ? (
          <div role="status" className="w-full text-center">
            <p className="text-[15px] text-[var(--rk-muted)]">
              <Trans>Password recovery is not available on this server.</Trans>
            </p>
            <Link to="/sign-in" className="mt-6 inline-block text-sm">
              <Trans>Back to sign in</Trans>
            </Link>
          </div>
        ) : mode === "up" && reset?.signupsEnabled === false ? (
          <div role="status" className="w-full text-center">
            <p className="text-[15px] text-[var(--rk-ink)]">
              <Trans>Registration is currently unavailable</Trans>
            </p>
            <Link
              to="/sign-in"
              className="mt-6 inline-block rounded-full bg-[var(--rk-cream)] px-6 py-3 font-medium text-[var(--rk-cream-ink)]"
            >
              <Trans>Sign in</Trans>
            </Link>
          </div>
        ) : sent ? (
          <div role="status" className="w-full text-center">
            <p className="text-[15px] text-[var(--rk-ink)]">
              <Trans>Check your email</Trans>
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-[var(--rk-muted)]">
              <Trans>If an account exists for that address, we sent a password reset link.</Trans>
            </p>
            <Link to="/sign-in" className="mt-6 inline-block font-medium text-[var(--rk-ink)]">
              <Trans>Back to sign in</Trans>
            </Link>
          </div>
        ) : (
          <>
            {mode === "up" ? (
              <label className="mb-4 w-full text-[14px] text-[var(--rk-muted)]">
                <Trans>Name</Trans>
                <input
                  id="name"
                  name="name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t`Your name`}
                  className="mt-2 w-full rounded-[10px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-surface)] px-3.5 py-3 text-[15px] text-[var(--rk-ink)] outline-none"
                />
              </label>
            ) : null}
            <label className="w-full text-[14px] text-[var(--rk-muted)]">
              <Trans>Email</Trans>
              <input
                id="email"
                name="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t`Your email address`}
                type="email"
                required
                className="mt-2 w-full rounded-[10px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-surface)] px-3.5 py-3 text-[15px] text-[var(--rk-ink)] outline-none"
              />
            </label>
            {mode !== "forgot" ? (
              <div className="mt-4 w-full text-[14px] text-[var(--rk-muted)]">
                <label htmlFor={passwordFieldId}>
                  <Trans>Password</Trans>
                </label>
                <div className="relative mt-2">
                  <input
                    id={passwordFieldId}
                    name="password"
                    autoComplete={mode === "in" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t`Password`}
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={mode === "in" ? undefined : 8}
                    maxLength={mode === "up" ? 128 : undefined}
                    aria-describedby={mode === "up" ? "password-hint" : undefined}
                    className="w-full rounded-[10px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-surface)] py-3 pl-3.5 pr-[52px] text-[15px] text-[var(--rk-ink)] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((shown) => !shown)}
                    aria-label={showPassword ? t`Hide password` : t`Show password`}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 flex items-center px-3.5 text-[var(--rk-muted)] hover:text-[var(--rk-ink)]"
                  >
                    {showPassword ? (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                        <line x1="2" y1="2" x2="22" y2="22" />
                      </svg>
                    ) : (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                {mode === "up" ? (
                  <p id="password-hint" className="mt-2 text-xs text-[var(--rk-muted)]">
                    <Trans>At least 8 characters</Trans>
                  </p>
                ) : null}
                {mode === "in" && reset?.passwordReset ? (
                  <div className="mt-2 text-right text-[14px]">
                    <Link to="/forgot-password" className="font-medium text-[var(--rk-ink)]">
                      <Trans>Forgot password?</Trans>
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}
            {error ? (
              <p role="alert" className="mt-3 w-full text-sm text-[var(--rk-danger)]">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={pending || ((mode === "up" || mode === "forgot") && reset === null)}
              className="mt-3 w-full rounded-[10px] bg-[var(--rk-cream)] py-3 text-center text-[15px] font-medium text-[var(--rk-cream-ink)] hover:opacity-90 disabled:opacity-50"
            >
              {pending ? (
                <Trans>Working…</Trans>
              ) : mode === "in" ? (
                <Trans>Continue with email</Trans>
              ) : mode === "forgot" ? (
                <Trans>Send reset link</Trans>
              ) : (
                <Trans>Create account</Trans>
              )}
            </button>
            <p className="mt-[30px] text-[14px] text-[var(--rk-muted)]">
              {mode === "in" && reset?.signupsEnabled !== false ? (
                <>
                  <Trans>Don’t have an account?</Trans>{" "}
                  <Link
                    to="/sign-up"
                    state={location.state}
                    className="font-medium text-[var(--rk-ink)]"
                  >
                    <Trans>Sign up</Trans>
                  </Link>
                </>
              ) : mode === "up" ? (
                <>
                  <Trans>Already have an account?</Trans>{" "}
                  <Link to="/sign-in" className="font-medium text-[var(--rk-ink)]">
                    <Trans>Sign in</Trans>
                  </Link>
                </>
              ) : mode === "forgot" ? (
                <Link to="/sign-in" className="font-medium text-[var(--rk-ink)]">
                  <Trans>Back to sign in</Trans>
                </Link>
              ) : null}
            </p>
          </>
        )}
      </form>
    </div>
  );
}

export function PasswordResetPage() {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [rejectedLink, setRejectedLink] = useState(false);
  const invalidLink = rejectedLink || Boolean(params.get("error")) || !params.get("token");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const token = params.get("token");
    if (!token || invalidLink || pending) return;
    if (password !== confirmation) {
      setError(t`Passwords do not match`);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) {
        if (result.error.code === "INVALID_TOKEN") setRejectedLink(true);
        setError(result.error.message ?? t`Could not reset password`);
        return;
      }
      setComplete(true);
    } catch {
      setError(t`Could not reach the server`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      data-rakazo-route-ready="true"
      className="flex min-h-full items-center justify-center bg-[var(--rk-page)] px-6 py-16 text-[var(--rk-ink)]"
    >
      <form
        onSubmit={submit}
        aria-busy={pending}
        className="flex w-full max-w-[400px] flex-col items-center"
      >
        <BrandMark size={52} />
        <h1 className="mb-8 mt-6 text-[28px] font-medium tracking-[-0.025em]">
          <Trans>Choose a new password</Trans>
        </h1>
        {invalidLink ? (
          <div className="w-full text-center">
            <p role="alert" className="text-[15px] text-[var(--rk-danger)]">
              <Trans>This reset link is invalid or expired.</Trans>
            </p>
            <Link
              to="/forgot-password"
              className="mt-6 inline-flex min-h-11 items-center rounded-[10px] bg-[var(--rk-cream)] px-5 text-sm font-medium text-[var(--rk-cream-ink)]"
            >
              <Trans>Request a new link</Trans>
            </Link>
            <Link to="/sign-in" className="mt-4 block text-sm">
              <Trans>Back to sign in</Trans>
            </Link>
          </div>
        ) : complete ? (
          <div role="status" className="w-full text-center">
            <p className="text-[15px]">
              <Trans>Password updated</Trans>
            </p>
            <Link to="/sign-in" className="mt-6 inline-block font-medium">
              <Trans>Sign in</Trans>
            </Link>
          </div>
        ) : (
          <>
            <PasswordField
              id="new-password"
              label={t`New password`}
              value={password}
              onChange={setPassword}
            />
            <PasswordField
              id="confirm-password"
              label={t`Confirm password`}
              value={confirmation}
              onChange={setConfirmation}
              className="mt-4"
            />
            {error ? (
              <p role="alert" className="mt-3 w-full text-sm text-[var(--rk-danger)]">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={pending || !params.get("token")}
              className="mt-4 w-full rounded-[10px] bg-[var(--rk-cream)] py-3 text-[15px] font-medium text-[var(--rk-cream-ink)] disabled:opacity-60"
            >
              {pending ? <Trans>Working…</Trans> : <Trans>Reset password</Trans>}
            </button>
            <Link to="/sign-in" className="mt-6 font-medium">
              <Trans>Back to sign in</Trans>
            </Link>
          </>
        )}
      </form>
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  className = "",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label htmlFor={id} className={`w-full text-[14px] text-[var(--rk-muted)] ${className}`}>
      {label}
      <input
        id={id}
        name={id}
        autoComplete="new-password"
        type="password"
        required
        minLength={8}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-[10px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-surface)] px-3.5 py-3 text-[15px] text-[var(--rk-ink)] outline-none"
      />
    </label>
  );
}
