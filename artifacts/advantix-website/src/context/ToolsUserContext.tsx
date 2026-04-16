import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { toolsApi, type ToolUser } from "@/lib/toolsApi";

interface ToolsUserContextType {
  user: ToolUser | null;
  isAdmin: boolean;
  loading: boolean;
  allowedTools: string[] | null;
  setUser: (u: ToolUser | null) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const ToolsUserContext = createContext<ToolsUserContextType | null>(null);

export function ToolsUserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ToolUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [allowedTools, setAllowedTools] = useState<string[] | null>(null);

  const fetchPermissions = useCallback(async () => {
    try {
      const r = await fetch("/api/tools/my-permissions", { credentials: "include" });
      if (r.ok) {
        const data = await r.json();
        setAllowedTools(data.allowed ?? null);
      } else {
        setAllowedTools(null);
      }
    } catch {
      setAllowedTools(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { user } = await toolsApi.auth.me();

      const admin = user.email.endsWith("@advantix.local") || user.isAdmin === true;

      setUser(user);
      setIsAdmin(admin);

      if (admin) {
        setAllowedTools(["url-shortener", "screen-recorder", "pdf-audio", "advantix-ai"]);
      } else {
        await fetchPermissions();
      }
    } catch (err: unknown) {
      const status = (err as any)?.status ?? (err as any)?.response?.status;
      const isAuthFailure = status === 401 || status === 403;

      if (isAuthFailure) {
        setUser(null);
        setIsAdmin(false);
        setAllowedTools(null);
      }
    } finally {
      setLoading(false);
    }
  }, [fetchPermissions]);

  useEffect(() => { refresh(); }, [refresh]);

  const logout = async () => {
    await toolsApi.auth.logout();
    setUser(null);
    setIsAdmin(false);
    setAllowedTools(null);
  };

  return (
    <ToolsUserContext.Provider value={{ user, isAdmin, loading, allowedTools, setUser, logout, refresh }}>
      {children}
    </ToolsUserContext.Provider>
  );
}

export function useToolsUser() {
  const ctx = useContext(ToolsUserContext);
  if (!ctx) throw new Error("useToolsUser must be used within ToolsUserProvider");
  return ctx;
}
