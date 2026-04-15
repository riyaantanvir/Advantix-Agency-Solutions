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

      // Detect admin status from either:
      //   • @advantix.local email (auto-login path from admin panel)
      //   • server-side isAdmin flag (admin session fallback path)
      const admin = user.email.endsWith("@advantix.local") || user.isAdmin === true;

      // Always set the user — never null on auth success.
      // Tool pages gate on !user, so clearing it here would wrongly redirect
      // the admin to the login page even though they have a valid session.
      setUser(user);
      setIsAdmin(admin);
    } catch (err: unknown) {
      // Only clear the user on an explicit authentication failure (401/403).
      // Network errors (server restart, connection refused) must not log out
      // the user — their session is still valid.
      const status = (err as any)?.status ?? (err as any)?.response?.status;
      const isAuthFailure = status === 401 || status === 403;

      if (isAuthFailure) {
        setUser(null);
        setIsAdmin(false);
      }
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
