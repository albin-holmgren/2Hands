import { Trans } from "@lingui/react/macro";

/** Short path when computers are off (none) or Docker is misconfigured. */
export function ComputersUnavailableHint({
  className,
  showSetup = false,
}: {
  className?: string;
  showSetup?: boolean;
}) {
  return (
    <div data-testid="computers-unavailable-hint" className={className}>
      <p>
        <Trans>Computers are not available on this server. You can continue chatting.</Trans>
      </p>
      {showSetup ? (
        <details className="mt-3 text-start">
          <summary className="cursor-pointer">
            <Trans>Server setup</Trans>
          </summary>
          <p className="mt-2">
            <Trans>
              Configure a computer provider on the server, then restart it. See the deployment guide
              for Docker and hosted providers.
            </Trans>
          </p>
        </details>
      ) : null}
    </div>
  );
}

export function computersAreUnavailable(sandboxProvider: string | null | undefined) {
  return sandboxProvider === "none" || sandboxProvider === "";
}
