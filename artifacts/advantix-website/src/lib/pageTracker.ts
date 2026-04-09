const API_BASE = "/api";

function getSessionId(): string {
  let id = sessionStorage.getItem("_ax_sid");
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem("_ax_sid", id);
  }
  return id;
}

function parseReferrerSource(rawReferrer: string): string {
  if (!rawReferrer) return "Direct";
  try {
    const url = new URL(rawReferrer);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === window.location.hostname || host === "localhost") return "Internal";
    if (host.includes("facebook.com") || host.includes("fb.com") || host.includes("fb.me")) return "Facebook";
    if (host.includes("instagram.com")) return "Instagram";
    if (host.includes("twitter.com") || host.includes("x.com") || host.includes("t.co")) return "Twitter / X";
    if (host.includes("linkedin.com")) return "LinkedIn";
    if (host.includes("youtube.com") || host.includes("youtu.be")) return "YouTube";
    if (host.includes("tiktok.com")) return "TikTok";
    if (host.includes("pinterest.com")) return "Pinterest";
    if (host.includes("reddit.com")) return "Reddit";
    if (host.includes("whatsapp.com") || host.includes("whatsapp.net")) return "WhatsApp";
    if (host.includes("telegram.org") || host.includes("t.me")) return "Telegram";
    if (host.includes("snapchat.com")) return "Snapchat";
    if (host.includes("google.") || host.startsWith("google")) return "Google";
    if (host.includes("bing.com")) return "Bing";
    if (host.includes("yahoo.com")) return "Yahoo";
    if (host.includes("duckduckgo.com")) return "DuckDuckGo";
    if (host.includes("baidu.com")) return "Baidu";
    if (host.includes("yandex.")) return "Yandex";
    return host;
  } catch {
    return rawReferrer.slice(0, 60);
  }
}

function trackEvent(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    navigator.sendBeacon(`${API_BASE}/analytics/track`, new Blob([body], { type: "application/json" }));
  } else {
    fetch(`${API_BASE}/analytics/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  }
}

export function setupPageTracking(pagePath: string, referrer: string) {
  const sessionId = getSessionId();
  const startTime = Date.now();
  let maxScrollDepth = 0;
  let exitSent = false;

  const source = parseReferrerSource(referrer);
  trackEvent({ sessionId, eventType: "pageview", pagePath, referrer: source, scrollDepth: 0, timeOnPage: 0 });

  const handleScroll = () => {
    const el = document.documentElement;
    const scrollable = el.scrollHeight - el.clientHeight;
    if (scrollable <= 0) return;
    const depth = Math.round((window.scrollY / scrollable) * 100);
    if (depth > maxScrollDepth) {
      maxScrollDepth = Math.min(depth, 100);
    }
  };

  const handleClick = (e: MouseEvent) => {
    const x = parseFloat(((e.clientX / window.innerWidth) * 100).toFixed(1));
    const y = parseFloat((((e.clientY + window.scrollY) / document.documentElement.scrollHeight) * 100).toFixed(1));
    trackEvent({ sessionId, eventType: "click", pagePath, clickX: x, clickY: y });
  };

  const sendExit = () => {
    if (exitSent) return;
    exitSent = true;
    const timeOnPage = Math.round((Date.now() - startTime) / 1000);
    trackEvent({ sessionId, eventType: "exit", pagePath, scrollDepth: maxScrollDepth, timeOnPage });
  };

  window.addEventListener("scroll", handleScroll, { passive: true });
  window.addEventListener("click", handleClick, { passive: true });
  window.addEventListener("beforeunload", sendExit);

  return () => {
    window.removeEventListener("scroll", handleScroll);
    window.removeEventListener("click", handleClick);
    window.removeEventListener("beforeunload", sendExit);
    sendExit();
  };
}
