import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { createWorkspaceRpc, rpc as defaultRpc } from "./rpc";

const WorkspaceRpc = createContext(defaultRpc);
/** Each mounted workspace owns a fixed authorization scope and request lifetime. */
export function WorkspaceProvider({
  spaceId,
  children,
}: {
  spaceId: string | null;
  children: ReactNode;
}) {
  const [scope] = useState(() => {
    const controller = new AbortController();
    return { controller, rpc: createWorkspaceRpc(spaceId, controller.signal), mounted: true };
  });
  useEffect(() => {
    scope.mounted = true;
    return () => {
      scope.mounted = false;
      // React StrictMode replays effects synchronously; only abort a real unmount.
      queueMicrotask(() => {
        if (!scope.mounted) scope.controller.abort();
      });
    };
  }, [scope]);
  return <WorkspaceRpc.Provider value={scope.rpc}>{children}</WorkspaceRpc.Provider>;
}
export const useWorkspaceRpc = () => useContext(WorkspaceRpc);
