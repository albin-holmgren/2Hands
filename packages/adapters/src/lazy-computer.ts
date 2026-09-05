import type { ComputerRef, SandboxProvider } from "@rakazo/adapter-kit";

/** Delay allocation until the first computer operation, renewing only through the lifecycle. */
export function lazyComputer(
  provider: SandboxProvider,
  initial: ComputerRef,
  provision: () => Promise<ComputerRef>,
) {
  const computer = { ...initial };
  let ready = false;
  let pending: Promise<void> | undefined;
  const ensure = async () => {
    if (
      ready &&
      (!computer.expiresAt || new Date(computer.expiresAt).getTime() - Date.now() > 60_000)
    )
      return;
    pending ??= provision()
      .then((ref) => {
        Object.assign(computer, ref);
        ready = true;
      })
      .finally(() => {
        pending = undefined;
      });
    await pending;
  };
  const passive = new Set<PropertyKey>(["describe", "releaseScreen", "stop", "destroy"]);
  const sandbox = new Proxy(provider, {
    get(target, key) {
      const method = Reflect.get(target, key);
      if (typeof method !== "function") return method;
      if (passive.has(key)) return method.bind(target);
      if (key === "execute" || key === "exportWorkspace") {
        return async function* (...args: unknown[]) {
          await ensure();
          yield* method.apply(target, args);
        };
      }
      return async (...args: unknown[]) => {
        await ensure();
        return method.apply(target, args);
      };
    },
  });
  return { computer, sandbox, ensure, isReady: () => ready };
}
