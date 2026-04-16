import { useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { ChatWidget } from "../chat/ChatWidget";
import { useTrackPageView } from "@workspace/api-client-react";
import { getOrCreateVisitorId } from "@/lib/tracking";


const NO_FOOTER_ROUTES = ["/tools/assistant"];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const trackMutation = useTrackPageView();
  const hideFooter = NO_FOOTER_ROUTES.some(r => location.startsWith(r));

  useEffect(() => {
    try {
      const visitorId = getOrCreateVisitorId();
      trackMutation.mutate({
        data: {
          visitorId,
          page: location,
          userAgent: window.navigator.userAgent,
          referrer: document.referrer || undefined,
        },
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
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
      {!hideFooter && <Footer />}
      {!hideFooter && <ChatWidget />}
    </div>
  );
}
