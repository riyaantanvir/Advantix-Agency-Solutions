import type { Request } from "express";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const geoip = require("geoip-lite") as {
  lookup: (ip: string) => { country: string; city: string; ll: [number, number]; region: string } | null;
};

export const countryNames: Record<string, string> = {
  BD: "Bangladesh", US: "United States", GB: "United Kingdom", IN: "India",
  PK: "Pakistan", CA: "Canada", AU: "Australia", DE: "Germany", FR: "France",
  SG: "Singapore", AE: "UAE", SA: "Saudi Arabia", MY: "Malaysia", ID: "Indonesia",
  NG: "Nigeria", PH: "Philippines", BR: "Brazil", MX: "Mexico", TR: "Turkey",
  EG: "Egypt", NL: "Netherlands", IT: "Italy", ES: "Spain", JP: "Japan",
  KR: "South Korea", RU: "Russia", ZA: "South Africa", TH: "Thailand", VN: "Vietnam",
};

export function getIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return (typeof forwarded === "string" ? forwarded : forwarded[0]).split(",")[0].trim();
  }
  return req.socket.remoteAddress ?? "127.0.0.1";
}

export function getDevice(ua: string): string {
  if (/mobile|android|iphone|ipad|ipod/i.test(ua)) return "Mobile";
  if (/tablet/i.test(ua)) return "Tablet";
  return "Desktop";
}

export function getBrowser(ua: string): string {
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera\//i.test(ua)) return "Opera";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/SamsungBrowser\//i.test(ua)) return "Samsung Browser";
  if (/YaBrowser\//i.test(ua)) return "Yandex";
  if (/UCBrowser\//i.test(ua)) return "UC Browser";
  if (/CriOS\//i.test(ua)) return "Chrome (iOS)";
  if (/FxiOS\//i.test(ua)) return "Firefox (iOS)";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua)) return "Safari";
  return "Other";
}

export function getOS(ua: string): string {
  if (/Windows NT 10/i.test(ua)) return "Windows 10/11";
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Other";
}

export function parseReferrer(ref: string | undefined): string {
  if (!ref) return "Direct";
  try {
    const hostname = new URL(ref).hostname.replace(/^www\./, "");
    if (hostname.includes("google")) return "Google";
    if (hostname.includes("facebook") || hostname.includes("fb.com")) return "Facebook";
    if (hostname.includes("twitter") || hostname.includes("t.co")) return "Twitter / X";
    if (hostname.includes("instagram")) return "Instagram";
    if (hostname.includes("linkedin")) return "LinkedIn";
    if (hostname.includes("youtube")) return "YouTube";
    if (hostname.includes("tiktok")) return "TikTok";
    if (hostname.includes("reddit")) return "Reddit";
    if (hostname.includes("whatsapp")) return "WhatsApp";
    if (hostname.includes("t.me") || hostname.includes("telegram")) return "Telegram";
    return hostname;
  } catch {
    return "Other";
  }
}

// Lookup ISP + mobile flag from ip-api.com (free tier: 45 req/min, no key needed)
// Returns { isp, isMobile } — fire-and-forget safe
export async function lookupIsp(ip: string): Promise<{ isp: string | null; isMobile: boolean }> {
  if (!ip || ip === "127.0.0.1" || ip === "::1") {
    return { isp: null, isMobile: false };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000); // 2s max
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=isp,mobile,status`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) return { isp: null, isMobile: false };
    const data = await res.json() as { status: string; isp?: string; mobile?: boolean };
    if (data.status !== "success") return { isp: null, isMobile: false };
    return {
      isp: data.isp ?? null,
      isMobile: data.mobile ?? false,
    };
  } catch {
    return { isp: null, isMobile: false };
  }
}

export function getGeoData(ip: string) {
  const geo = ip === "127.0.0.1" || ip === "::1" ? null : geoip.lookup(ip);
  return {
    countryCode: geo?.country ?? "XX",
    country: geo?.country ? (countryNames[geo.country] ?? geo.country) : "Unknown",
    city: geo?.city ?? null,
  };
}
