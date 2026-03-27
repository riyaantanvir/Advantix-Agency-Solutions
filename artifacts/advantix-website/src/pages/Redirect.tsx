import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { toolsApi } from "@/lib/toolsApi";
import { ExternalLink, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function Redirect() {
  const params = useParams<{ code: string }>();
  const code = params.code;
  const [, navigate] = useLocation();
  const [error, setError] = useState(false);
  const [destination, setDestination] = useState<string | null>(null);

  useEffect(() => {
    if (!code) { setError(true); return; }
    toolsApi.urls.resolve(code)
      .then(({ url }) => {
        setDestination(url);
        window.location.replace(url);
      })
      .catch(() => setError(true));
  }, [code]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-sm">
          <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-4 opacity-80" />
          <h1 className="text-2xl font-display font-bold mb-2">Link Not Found</h1>
          <p className="text-muted-foreground mb-6">This short link doesn't exist or has been deleted.</p>
          <Link href="/tools/url-shortener">
            <Button>Go to URL Shortener</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <ExternalLink className="w-7 h-7 text-primary animate-pulse" />
        </div>
        <h1 className="text-xl font-display font-semibold mb-2">Redirecting…</h1>
        {destination && (
          <p className="text-sm text-muted-foreground truncate max-w-sm">
            → {destination}
          </p>
        )}
      </div>
    </div>
  );
}
