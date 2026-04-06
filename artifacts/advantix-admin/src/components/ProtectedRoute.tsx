import { useEffect } from "react";
import { useLocation } from "wouter";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const { data: session, isLoading, error } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
    }
  });

  useEffect(() => {
    if (!isLoading && (!session?.authenticated || error)) {
      setLocation("/login");
    }
  }, [isLoading, session, error, setLocation]);

  const notAuth = !isLoading && (!session?.authenticated || error);

  if (isLoading || notAuth) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground font-medium animate-pulse">
          {notAuth ? "Redirecting to login..." : "Verifying session..."}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
