import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const DISMISSED_KEY = "push_prompt_dismissed";
const SUBSCRIBED_KEY = "push_subscribed";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

function dismissPermanently(setVisible: (v: boolean) => void) {
  localStorage.setItem(DISMISSED_KEY, "1");
  setVisible(false);
}

export function PushNotificationPrompt() {
  const [visible, setVisible] = useState(false);
  const [status, setStatus]   = useState<"idle" | "loading" | "done" | "denied">("idle");

  useEffect(() => {
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      localStorage.getItem(DISMISSED_KEY) ||
      localStorage.getItem(SUBSCRIBED_KEY) ||
      Notification.permission === "denied" ||
      Notification.permission === "granted"
    ) return;

    const t = setTimeout(() => setVisible(true), 8000);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => dismissPermanently(setVisible);

  const subscribe = async () => {
    setStatus("loading");
    try {
      const keyRes = await fetch(`${BASE}/api/push/vapid-key`);
      if (!keyRes.ok) throw new Error("vapid-key unavailable");
      const { publicKey } = await keyRes.json();
      if (!publicKey) throw new Error("No VAPID key");

      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const json = sub.toJSON();
      await fetch(`${BASE}/api/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh,
          auth:   json.keys?.auth,
        }),
      });

      localStorage.setItem(SUBSCRIBED_KEY, "1");
      setStatus("done");
      setTimeout(() => setVisible(false), 2000);
    } catch {
      const perm = Notification.permission;
      if (perm === "denied") {
        setStatus("denied");
        localStorage.setItem(DISMISSED_KEY, "1");
        setTimeout(() => setVisible(false), 2000);
      } else if (perm === "granted") {
        // User granted permission — the subscription itself might have failed
        // (network issue, browser limitation, etc.) but we should still dismiss
        // and not bother the user again.
        localStorage.setItem(SUBSCRIBED_KEY, "1");
        setStatus("done");
        setTimeout(() => setVisible(false), 2000);
      } else {
        // User dismissed the browser dialog without choosing — reset to idle
        setStatus("idle");
      }
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 80 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 80 }}
          transition={{ type: "spring", damping: 22, stiffness: 200 }}
          className="fixed bottom-24 left-4 right-4 sm:left-auto sm:right-6 sm:w-80 z-[90] bg-card border border-border/60 rounded-2xl shadow-2xl shadow-black/30 p-4"
        >
          <button
            type="button"
            onClick={dismiss}
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={14} />
          </button>

          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              {status === "done" ? (
                <div className="py-2">
                  <p className="text-sm font-semibold text-foreground">You're subscribed!</p>
                  <p className="text-xs text-muted-foreground mt-0.5">We'll notify you about new updates.</p>
                </div>
              ) : status === "denied" ? (
                <div className="py-1">
                  <p className="text-xs text-muted-foreground">Notifications blocked. You can enable them in your browser settings anytime.</p>
                </div>
              ) : (
                <>
                  <p className="text-sm font-semibold text-foreground leading-snug">Stay in the loop</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    Get notified about new articles, tips, and agency updates — no spam, ever.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      onClick={subscribe}
                      disabled={status === "loading"}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
                    >
                      {status === "loading" ? (
                        <span className="w-3 h-3 border border-white/50 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Bell size={11} />
                      )}
                      {status === "loading" ? "Subscribing…" : "Enable Notifications"}
                    </button>
                    <button
                      type="button"
                      onClick={dismiss}
                      className="px-3 py-1.5 bg-secondary text-muted-foreground text-xs font-medium rounded-lg hover:text-foreground transition-colors"
                    >
                      No thanks
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
