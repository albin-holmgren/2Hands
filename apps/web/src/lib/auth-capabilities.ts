import { useEffect, useState } from "react";

export type AuthCapabilities = {
  passwordReset: boolean;
  resetUrl: string | null;
  signupsEnabled?: boolean;
};

/** Capabilities are deployment state. Failed reads keep registration/recovery waiting. */
export function useAuthCapabilities() {
  const [capabilities, setCapabilities] = useState<AuthCapabilities | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setCapabilities(null);
    setUnavailable(false);
    void fetch("/api/auth/capabilities", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load account options");
        return (await response.json()) as AuthCapabilities;
      })
      .then((value) => {
        if (!controller.signal.aborted) setCapabilities(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setUnavailable(true);
      });
    return () => controller.abort();
  }, [attempt]);
  return { capabilities, unavailable, retry: () => setAttempt((value) => value + 1) };
}
