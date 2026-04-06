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

const languageNames: Record<string, string> = {
  BN: "Bengali", EN: "English", AR: "Arabic", HI: "Hindi", UR: "Urdu",
  FR: "French", DE: "German", ZH: "Chinese", ES: "Spanish", PT: "Portuguese",
  RU: "Russian", JA: "Japanese", KO: "Korean", TR: "Turkish", ID: "Indonesian",
  MS: "Malay", TH: "Thai", VI: "Vietnamese", FA: "Persian", PL: "Polish",
  NL: "Dutch", IT: "Italian", SV: "Swedish", NO: "Norwegian", DA: "Danish",
  FI: "Finnish", CS: "Czech", HU: "Hungarian", RO: "Romanian", UK: "Ukrainian",
};

const BOT_UA_PATTERN = /bot|crawler|spider|scraper|facebookexternalhit|whatsapp|telegrambot|googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|sogou|exabot|ia_archiver|msnbot|prerender|preview/i;

export function isBot(ua: string): boolean {
  return BOT_UA_PATTERN.test(ua);
}

export function parseLanguage(acceptLang: string | undefined): string {
  if (!acceptLang) return "Unknown";
  const primary = acceptLang.split(",")[0].trim();
  const code = primary.split(";")[0].split("-")[0].toUpperCase();
  return languageNames[code] ?? code;
}

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

export interface IpData {
  isp: string | null;
  org: string | null;
  timezone: string | null;
  region: string | null;
  isMobile: boolean;
}

// Lookup ISP, org, timezone, region from ip-api.com (free tier: 45 req/min)
export async function lookupIpData(ip: string): Promise<IpData> {
  if (!ip || ip === "127.0.0.1" || ip === "::1") {
    return { isp: null, org: null, timezone: null, region: null, isMobile: false };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=isp,mobile,org,timezone,regionName,status`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) return { isp: null, org: null, timezone: null, region: null, isMobile: false };
    const data = await res.json() as {
      status: string; isp?: string; mobile?: boolean;
      org?: string; timezone?: string; regionName?: string;
    };
    if (data.status !== "success") return { isp: null, org: null, timezone: null, region: null, isMobile: false };
    return {
      isp: data.isp ?? null,
      org: data.org ?? null,
      timezone: data.timezone ?? null,
      region: data.regionName ?? null,
      isMobile: data.mobile ?? false,
    };
  } catch {
    return { isp: null, org: null, timezone: null, region: null, isMobile: false };
  }
}

// Backward compat alias
export const lookupIsp = async (ip: string) => {
  const d = await lookupIpData(ip);
  return { isp: d.isp, isMobile: d.isMobile };
};

export function getGeoData(ip: string) {
  const geo = ip === "127.0.0.1" || ip === "::1" ? null : geoip.lookup(ip);
  return {
    countryCode: geo?.country ?? "XX",
    country: geo?.country ? (countryNames[geo.country] ?? geo.country) : "Unknown",
    city: geo?.city ?? null,
  };
}
