import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import { db, shortUrlsTable, urlClicksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  getIp, getDevice, getBrowser, getOS, parseReferrer, getGeoData,
  lookupIpData, parseLanguage, isBot,
} from "../lib/urlClickAnalytics.js";

const router = Router();

function passwordPage(errorMsg?: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Password Protected – Advantix</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #0f172a; color: #e2e8f0; min-height: 100vh;
           display: flex; align-items: center; justify-content: center; margin: 0; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px;
            padding: 40px 36px; max-width: 420px; width: 90%; text-align: center; }
    .lock { font-size: 2.5rem; margin-bottom: 12px; }
    h2 { margin: 0 0 8px; font-size: 1.4rem; font-weight: 700; }
    p { color: #94a3b8; margin: 0 0 24px; font-size: 0.95rem; }
    input[type=password] { width: 100%; padding: 12px 16px; background: #0f172a;
             border: 1px solid #475569; border-radius: 10px; color: #e2e8f0;
             font-size: 1rem; margin-bottom: 14px; outline: none; transition: border-color .2s; }
    input[type=password]:focus { border-color: #3b82f6; }
    button { width: 100%; padding: 12px; background: #3b82f6; color: white;
             border: none; border-radius: 10px; font-size: 1rem; font-weight: 600;
             cursor: pointer; transition: background .2s; }
    button:hover { background: #2563eb; }
    .error { color: #f87171; font-size: 0.875rem; margin-bottom: 14px;
             background: #450a0a22; border: 1px solid #7f1d1d44; border-radius: 8px; padding: 10px; }
    .brand { margin-top: 28px; color: #475569; font-size: 0.8rem; }
    .brand span { color: #3b82f6; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <div class="lock">🔒</div>
    <h2>Password Protected</h2>
    <p>This link requires a password to continue.</p>
    <form method="POST">
      ${errorMsg ? `<div class="error">${errorMsg}</div>` : ""}
      <input type="password" name="password" placeholder="Enter password" autofocus required />
      <button type="submit">Continue &rarr;</button>
    </form>
    <div class="brand">Secured by <span>Advantix</span></div>
  </div>
</body>
</html>`;
}

function expiredPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Link Expired – Advantix</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #0f172a; color: #e2e8f0; min-height: 100vh;
           display: flex; align-items: center; justify-content: center; margin: 0; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px;
            padding: 40px 36px; max-width: 420px; width: 90%; text-align: center; }
    .icon { font-size: 2.5rem; margin-bottom: 12px; }
    h2 { margin: 0 0 8px; font-size: 1.4rem; font-weight: 700; }
    p { color: #94a3b8; margin: 0 0 24px; font-size: 0.95rem; }
    a { color: #3b82f6; text-decoration: none; font-weight: 600; }
    a:hover { text-decoration: underline; }
    .brand { margin-top: 28px; color: #475569; font-size: 0.8rem; }
    .brand span { color: #3b82f6; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⏳</div>
    <h2>Link Expired</h2>
    <p>This link has reached its maximum click limit and is no longer active.</p>
    <a href="/">Visit Advantix</a>
    <div class="brand">Secured by <span>Advantix</span></div>
  </div>
</body>
</html>`;
}

function notFoundPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" /><title>Link Not Found – Advantix</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #0f172a; color: #e2e8f0;
           min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px;
            padding: 40px 36px; max-width: 420px; width: 90%; text-align: center; }
    h2 { margin: 0 0 8px; } p { color: #94a3b8; }
    a { color: #3b82f6; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body><div class="card"><div style="font-size:2.5rem;margin-bottom:12px">🔗</div>
  <h2>Link Not Found</h2><p>This short link doesn't exist or has been deleted.</p><a href="/">Visit Advantix</a>
</div></body></html>`;
}

async function recordClick(
  urlId: number, currentClicks: number, req: Request,
  { language }: { language: string }
) {
  const ip = getIp(req);
  const ua = req.headers["user-agent"] ?? "";
  const geo = getGeoData(ip);
  const bot = isBot(ua);

  // Update click count (always — even bots so the limit check works)
  db.update(shortUrlsTable)
    .set({ clicks: currentClicks + 1 })
    .where(eq(shortUrlsTable.id, urlId))
    .catch(() => {});

  if (bot) {
    // Record bot click with basic data (skip expensive IP lookup)
    db.insert(urlClicksTable).values({
      urlId,
      countryCode: geo.countryCode,
      country: geo.country,
      city: geo.city,
      referrer: parseReferrer(req.headers.referer),
      device: getDevice(ua),
      browser: getBrowser(ua),
      os: getOS(ua),
      language,
      ip,
      isBot: true,
      isMobile: false,
    }).catch(() => {});
    return;
  }

  lookupIpData(ip).then((ipData) => {
    db.insert(urlClicksTable).values({
      urlId,
      countryCode: geo.countryCode,
      country: geo.country,
      city: geo.city,
      region: ipData.region,
      referrer: parseReferrer(req.headers.referer),
      device: getDevice(ua),
      browser: getBrowser(ua),
      os: getOS(ua),
      language,
      ip,
      isp: ipData.isp,
      org: ipData.org,
      timezone: ipData.timezone,
      isBot: false,
      isMobile: ipData.isMobile,
    }).catch(() => {});
  });
}

/* GET /s/:code */
router.get("/s/:code", async (req, res) => {
  const code = String(req.params.code);
  const session = req.session as { unlockedUrls?: number[] };

  const [url] = await db
    .select()
    .from(shortUrlsTable)
    .where(eq(shortUrlsTable.shortCode, code))
    .limit(1);

  if (!url) {
    res.status(404).send(notFoundPage());
    return;
  }

  // Click limit check
  if (url.clickLimit !== null && url.clickLimit !== undefined && url.clicks >= url.clickLimit) {
    res.status(410).send(expiredPage());
    return;
  }

  // Password check
  if (url.passwordHash) {
    const unlocked = session.unlockedUrls?.includes(url.id);
    if (!unlocked) {
      res.status(200).send(passwordPage());
      return;
    }
  }

  // Redirect
  res.redirect(302, url.originalUrl);

  const language = parseLanguage(req.headers["accept-language"]);
  recordClick(url.id, url.clicks, req, { language });
});

/* POST /s/:code — password verification */
router.post("/s/:code", async (req, res) => {
  const code = String(req.params.code);
  const session = req.session as { unlockedUrls?: number[] };

  const [url] = await db
    .select()
    .from(shortUrlsTable)
    .where(eq(shortUrlsTable.shortCode, code))
    .limit(1);

  if (!url || !url.passwordHash) {
    res.status(404).send(notFoundPage());
    return;
  }

  const submitted = String(req.body?.password ?? "");
  const valid = await bcrypt.compare(submitted, url.passwordHash);

  if (!valid) {
    res.status(200).send(passwordPage("Incorrect password. Please try again."));
    return;
  }

  // Store unlock in session so they don't need to re-enter
  session.unlockedUrls = [...(session.unlockedUrls ?? []), url.id];

  // Click limit check
  if (url.clickLimit !== null && url.clickLimit !== undefined && url.clicks >= url.clickLimit) {
    res.status(410).send(expiredPage());
    return;
  }

  res.redirect(302, url.originalUrl);

  const language = parseLanguage(req.headers["accept-language"]);
  recordClick(url.id, url.clicks, req, { language });
});

export default router;
