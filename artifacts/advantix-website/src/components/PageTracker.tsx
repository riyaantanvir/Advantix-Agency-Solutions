import { useEffect } from "react";
import { useLocation } from "wouter";
import { setupPageTracking } from "@/lib/pageTracker";

export function PageTracker() {
  const [location] = useLocation();

  useEffect(() => {
    const referrer = document.referrer;
    const cleanup = setupPageTracking(location, referrer);
    return cleanup;
  }, [location]);

  return null;
}
