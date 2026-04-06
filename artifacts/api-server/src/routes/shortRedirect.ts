import { Router } from "express";
import { db, shortUrlsTable, urlClicksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getIp, getDevice, getBrowser, getOS, parseReferrer, getGeoData, lookupIsp } from "../lib/urlClickAnalytics.js";

const router = Router();

router.get("/s/:code", async (req, res) => {
  const code = String(req.params.code);

  const [url] = await db
    .select()
    .from(shortUrlsTable)
    .where(eq(shortUrlsTable.shortCode, code))
    .limit(1);

  if (!url) {
    res.status(404).send(`
      <html><head><title>Link Not Found</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2>Link Not Found</h2>
        <p>This short link doesn't exist or has been deleted.</p>
        <a href="/">Go to Advantix</a>
      </body></html>
    `);
    return;
  }

  // Redirect immediately — record analytics in background
  res.redirect(302, url.originalUrl);

  const ip = getIp(req);
  const ua = req.headers["user-agent"] ?? "";
  const geo = getGeoData(ip);

  db.update(shortUrlsTable)
    .set({ clicks: url.clicks + 1 })
    .where(eq(shortUrlsTable.id, url.id))
    .catch(() => {});

  // Fire-and-forget: ISP lookup + insert click record
  lookupIsp(ip).then(({ isp, isMobile }) => {
    db.insert(urlClicksTable).values({
      urlId: url.id,
      countryCode: geo.countryCode,
      country: geo.country,
      city: geo.city,
      referrer: parseReferrer(req.headers.referer),
      device: getDevice(ua),
      browser: getBrowser(ua),
      os: getOS(ua),
      ip,
      isp,
      isMobile,
    }).catch(() => {});
  });
});

export default router;
