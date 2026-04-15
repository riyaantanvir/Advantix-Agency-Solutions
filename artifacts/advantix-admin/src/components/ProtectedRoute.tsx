import { useEffect } from "react";
import { useLocation } from "wouter";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Loader2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

function isAuthError(err: unknown): boolean {
  const status = (err as any)?.status;
  return status === 401 || status === 403;
}

function isNetworkError(err: unknown): boolean {
  // No `.status` property → TypeError / connection refused / parse error
  return !!err && !("status" in (err as any));
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();

  const { data: session, isLoading, error, refetch } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      staleTime: 60_000,
      // Retry network errors up to 2×, but never retry 401/403 (pointless)
      retry: (count, err) => {
        if (isAuthError(err)) return false;
        return count < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
  });

  useEffect(() => {
    if (isLoading) return;

    // Only redirect for explicit auth failures — not for network/server errors
    if (error && isAuthError(error)) {
      setLocation("/login");
      return;
    }

    // Server responded but said "not authenticated"
    if (!error && session?.authenticated === false) {
      setLocation("/login");
    }
  }, [isLoading, session, error, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-muted-foreground font-medium animate-pulse">Verifying session…</p>
      </div>
    );
  }

  // Network/server error — show a friendly message and let the user retry
  if (error && isNetworkError(error)) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <WifiOff className="w-10 h-10 text-muted-foreground" />
        <p className="text-foreground font-semibold">Could not reach the server</p>
        <p className="text-muted-foreground text-sm">The server may be restarting. Please wait a moment and try again.</p>
        <Button onClick={() => refetch()} variant="outline">Retry</Button>
      </div>
    );
  }

  // 5xx or unexpected error shape — same friendly handling
  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <WifiOff className="w-10 h-10 text-muted-foreground" />
        <p className="text-foreground font-semibold">Server error</p>
        <p className="text-muted-foreground text-sm">Something went wrong. Please try again.</p>
        <Button onClick={() => refetch()} variant="outline">Retry</Button>
      </div>
    );
  }

  // Auth error handled by the effect — show redirect indicator while it fires
  if (!session?.authenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-muted-foreground font-medium">Redirecting to login…</p>
      </div>
    );
  }

  return <>{children}</>;
}
