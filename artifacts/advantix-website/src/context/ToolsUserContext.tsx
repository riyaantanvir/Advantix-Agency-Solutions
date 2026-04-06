import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { toolsApi, type ToolUser } from "@/lib/toolsApi";

interface ToolsUserContextType {
  user: ToolUser | null;
  isAdmin: boolean;
  loading: boolean;
  setUser: (u: ToolUser | null) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const ToolsUserContext = createContext<ToolsUserContextType | null>(null);

export function ToolsUserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ToolUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user } = await toolsApi.auth.me();
      if (user.email.endsWith("@advantix.local")) {
        setUser(null);
        setIsAdmin(true);
      } else {
        setUser(user);
        setIsAdmin(false);
      }
    } catch {
      setUser(null);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const logout = async () => {
    await toolsApi.auth.logout();
    setUser(null);
    setIsAdmin(false);
  };

  return (
    <ToolsUserContext.Provider value={{ user, isAdmin, loading, setUser, logout, refresh }}>
      {children}
    </ToolsUserContext.Provider>
  );
}

export function useToolsUser() {
  const ctx = useContext(ToolsUserContext);
  if (!ctx) throw new Error("useToolsUser must be used within ToolsUserProvider");
  return ctx;
}
