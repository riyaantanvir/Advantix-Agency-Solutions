import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { workspaceApi, type Workspace } from "@/lib/workspaceApi";

interface WorkspaceContextValue {
  workspaces: Workspace[];
  current: Workspace | null;
  loading: boolean;
  switchTo: (id: number) => void;
  refresh: () => Promise<void>;
  createWorkspace: (name: string) => Promise<Workspace>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const STORAGE_KEY = "advantix:current-workspace-id";

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(() => {
    const v = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    return v ? parseInt(v, 10) : null;
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const r = await workspaceApi.list();
      setWorkspaces(r.workspaces);
      setCurrentId(prev => {
        if (prev != null && r.workspaces.some(w => w.id === prev)) return prev;
        return r.workspaces[0]?.id ?? null;
      });
    } catch {
      setWorkspaces([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (currentId != null && typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, String(currentId));
    }
  }, [currentId]);

  const current = workspaces.find(w => w.id === currentId) ?? null;

  const switchTo = useCallback((id: number) => setCurrentId(id), []);

  const createWorkspace = useCallback(async (name: string): Promise<Workspace> => {
    const r = await workspaceApi.create(name);
    await refresh();
    setCurrentId(r.workspace.id);
    return r.workspace as Workspace;
  }, [refresh]);

  return (
    <WorkspaceContext.Provider value={{ workspaces, current, loading, switchTo, refresh, createWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}
