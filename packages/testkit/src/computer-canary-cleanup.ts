/** Stop execution before destroying its computer, and make either cleanup failure fail the gate. */
export async function cleanupComputerCanary(actions: {
  stopApp?: () => Promise<void>;
  destroyComputer?: () => Promise<void>;
}) {
  const failures: unknown[] = [];
  for (const cleanup of [actions.stopApp, actions.destroyComputer]) {
    try {
      await cleanup?.();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, "Computer canary cleanup failed");
}
