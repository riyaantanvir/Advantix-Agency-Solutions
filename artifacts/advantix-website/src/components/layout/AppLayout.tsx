import { useEffect } from "react";
import { useLocation } from "wouter";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { ChatWidget } from "../chat/ChatWidget";
import { useTrackPageView } from "@workspace/api-client-react";
import { getOrCreateVisitorId } from "@/lib/tracking";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const trackMutation = useTrackPageView();

  useEffect(() => {
    // Fire and forget page view tracking
    try {
      const visitorId = getOrCreateVisitorId();
      trackMutation.mutate({
        data: {
          visitorId,
          page: location,
          userAgent: window.navigator.userAgent,
          referrer: document.referrer || undefined
        }
      });
    } catch (err) {
      console.error("Tracking error:", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  return (
    <div className="min-h-screen flex flex-col relative selection:bg-primary/30 selection:text-primary-foreground">
      <Navbar />
      <main className="flex-1">
        {children}
      </main>
      <Footer />
      <ChatWidget />
    </div>
  );
}
