import { Router, Request, Response } from "express";
import { eq, like, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { integrationsTable, pageEventsTable, smmScheduledPostsTable } from "@workspace/db/schema";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

async function getSmmKeys(): Promise<Record<string, string>> {
  const rows = await db.select().from(integrationsTable)
    .where(like(integrationsTable.name, "SMM_%"));
  return Object.fromEntries(rows.map(r => [r.name, r.value]));
}

function maskValue(v: string) {
  if (!v || v.length <= 8) return "••••••••";
  return "••••••••" + v.slice(-4);
}

type PlatformResult = {
  connected: false;
} | {
  connected: true;
  username?: string;
  displayName?: string;
  followers: number;
  totalPosts: number;
  recentPosts: Array<{
    id: string;
    content: string;
    imageUrl?: string;
    likes: number;
    comments: number;
    views: number;
    date: string;
    url?: string;
  }>;
  raw?: unknown;
};

// ── Meta (Facebook) ───────────────────────────────────────────────────────────

async function fetchFacebook(pageToken: string, pageId: string): Promise<PlatformResult> {
  try {
    const r = await fetch(
      `https://graph.facebook.com/v19.0/${pageId}?fields=name,followers_count,fan_count,posts.limit(10){message,created_time,full_picture,likes.summary(true),comments.summary(true)}&access_token=${pageToken}`,
      { signal: AbortSignal.timeout(12000) }
    );
    if (!r.ok) return { connected: false };
    const d = await r.json();
    const posts = (d.posts?.data ?? []).map((p: any) => ({
      id: p.id ?? "",
      content: p.message ?? "",
      imageUrl: p.full_picture ?? undefined,
      likes: p.likes?.summary?.total_count ?? 0,
      comments: p.comments?.summary?.total_count ?? 0,
      views: 0,
      date: p.created_time ? new Date(p.created_time).toISOString().split("T")[0] : "",
      url: `https://facebook.com/${p.id}`,
    }));
    return {
      connected: true,
      displayName: d.name,
      followers: d.followers_count ?? d.fan_count ?? 0,
      totalPosts: posts.length,
      recentPosts: posts,
    };
  } catch { return { connected: false }; }
}

// ── Meta (Instagram) ──────────────────────────────────────────────────────────

async function fetchInstagram(accessToken: string, igUserId: string): Promise<PlatformResult> {
  try {
    const r = await fetch(
      `https://graph.facebook.com/v19.0/${igUserId}?fields=username,followers_count,media_count,media.limit(10){caption,timestamp,like_count,comments_count,media_type,media_url,thumbnail_url,permalink}&access_token=${accessToken}`,
      { signal: AbortSignal.timeout(12000) }
    );
    if (!r.ok) return { connected: false };
    const d = await r.json();
    const posts = (d.media?.data ?? []).map((p: any) => ({
      id: p.id ?? "",
      content: p.caption ?? "",
      imageUrl: p.media_url ?? p.thumbnail_url ?? undefined,
      likes: p.like_count ?? 0,
      comments: p.comments_count ?? 0,
      views: 0,
      date: p.timestamp ? new Date(p.timestamp).toISOString().split("T")[0] : "",
      url: p.permalink ?? undefined,
    }));
    return {
      connected: true,
      username: `@${d.username}`,
      followers: d.followers_count ?? 0,
      totalPosts: d.media_count ?? posts.length,
      recentPosts: posts,
    };
  } catch { return { connected: false }; }
}

// ── Twitter / X ───────────────────────────────────────────────────────────────

async function fetchTwitter(bearerToken: string, userId: string): Promise<PlatformResult> {
  try {
    const [userR, tweetsR] = await Promise.all([
      fetch(
        `https://api.twitter.com/2/users/${userId}?user.fields=public_metrics,username,name`,
        { headers: { Authorization: `Bearer ${bearerToken}` }, signal: AbortSignal.timeout(12000) }
      ),
      fetch(
        `https://api.twitter.com/2/users/${userId}/tweets?max_results=10&tweet.fields=public_metrics,created_at&expansions=attachments.media_keys&media.fields=url,preview_image_url`,
        { headers: { Authorization: `Bearer ${bearerToken}` }, signal: AbortSignal.timeout(12000) }
      ),
    ]);
    if (!userR.ok) return { connected: false };
    const user = await userR.json();
    const tweetsData = tweetsR.ok ? await tweetsR.json() : null;
    const metrics = user.data?.public_metrics ?? {};
    const posts = (tweetsData?.data ?? []).map((t: any) => ({
      id: t.id,
      content: t.text ?? "",
      imageUrl: undefined,
      likes: t.public_metrics?.like_count ?? 0,
      comments: t.public_metrics?.reply_count ?? 0,
      views: t.public_metrics?.impression_count ?? 0,
      date: t.created_at ? new Date(t.created_at).toISOString().split("T")[0] : "",
      url: `https://x.com/${user.data?.username}/status/${t.id}`,
    }));
    return {
      connected: true,
      username: `@${user.data?.username}`,
      displayName: user.data?.name,
      followers: metrics.followers_count ?? 0,
      totalPosts: metrics.tweet_count ?? 0,
      recentPosts: posts,
    };
  } catch { return { connected: false }; }
}

// ── LinkedIn ──────────────────────────────────────────────────────────────────

async function fetchLinkedIn(accessToken: string, orgId: string): Promise<PlatformResult> {
  try {
    const r = await fetch(
      orgId
        ? `https://api.linkedin.com/v2/organizations/${orgId}`
        : `https://api.linkedin.com/v2/me`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(12000) }
    );
    if (!r.ok) return { connected: false };
    const d = await r.json();
    return {
      connected: true,
      displayName: d.localizedName ?? `${d.localizedFirstName ?? ""} ${d.localizedLastName ?? ""}`.trim(),
      followers: d.followersCount ?? 0,
      totalPosts: 0,
      recentPosts: [],
    };
  } catch { return { connected: false }; }
}

// ── YouTube ───────────────────────────────────────────────────────────────────

async function fetchYouTube(apiKey: string, channelId: string): Promise<PlatformResult> {
  try {
    const [channelR, videosR] = await Promise.all([
      fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${channelId}&key=${apiKey}`,
        { signal: AbortSignal.timeout(12000) }
      ),
      fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=10&order=date&type=video&key=${apiKey}`,
        { signal: AbortSignal.timeout(12000) }
      ),
    ]);
    if (!channelR.ok) return { connected: false };
    const channelData = await channelR.json();
    const ch = channelData.items?.[0];
    if (!ch) return { connected: false };
    const videosData = videosR.ok ? await videosR.json() : null;
    const posts = (videosData?.items ?? []).map((v: any) => ({
      id: v.id?.videoId ?? v.id,
      content: v.snippet?.title ?? "",
      imageUrl: v.snippet?.thumbnails?.medium?.url ?? undefined,
      likes: 0,
      comments: 0,
      views: 0,
      date: v.snippet?.publishedAt ? new Date(v.snippet.publishedAt).toISOString().split("T")[0] : "",
      url: `https://youtube.com/watch?v=${v.id?.videoId}`,
    }));
    return {
      connected: true,
      displayName: ch.snippet?.title,
      followers: parseInt(ch.statistics?.subscriberCount ?? "0"),
      totalPosts: parseInt(ch.statistics?.videoCount ?? "0"),
      recentPosts: posts,
    };
  } catch { return { connected: false }; }
}

// ── Pinterest ─────────────────────────────────────────────────────────────────

async function fetchPinterest(accessToken: string): Promise<PlatformResult> {
  try {
    const [accountR, pinsR] = await Promise.all([
      fetch("https://api.pinterest.com/v5/user_account", {
        headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(12000),
      }),
      fetch("https://api.pinterest.com/v5/pins?page_size=10", {
        headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(12000),
      }),
    ]);
    if (!accountR.ok) return { connected: false };
    const account = await accountR.json();
    const pinsData = pinsR.ok ? await pinsR.json() : null;
    const posts = (pinsData?.items ?? []).map((p: any) => ({
      id: p.id,
      content: p.description ?? p.title ?? "",
      imageUrl: p.media?.images?.["400x300"]?.url ?? undefined,
      likes: p.save_count ?? 0,
      comments: p.comment_count ?? 0,
      views: 0,
      date: p.created_at ? new Date(p.created_at).toISOString().split("T")[0] : "",
      url: p.link ?? undefined,
    }));
    return {
      connected: true,
      username: `@${account.username}`,
      followers: account.follower_count ?? 0,
      totalPosts: account.pin_count ?? posts.length,
      recentPosts: posts,
    };
  } catch { return { connected: false }; }
}

// ── GET /api/smm/platforms ───────────────────────────────────────────────────

router.get("/smm/platforms", requireAdmin, async (req: Request, res: Response) => {
  const keys = await getSmmKeys();

  const [facebook, instagram, twitter, linkedin, youtube, pinterest] = await Promise.all([
    keys.SMM_META_ACCESS_TOKEN && keys.SMM_META_PAGE_ID
      ? fetchFacebook(keys.SMM_META_ACCESS_TOKEN, keys.SMM_META_PAGE_ID)
      : Promise.resolve<PlatformResult>({ connected: false }),
    keys.SMM_META_ACCESS_TOKEN && keys.SMM_META_IG_USER_ID
      ? fetchInstagram(keys.SMM_META_ACCESS_TOKEN, keys.SMM_META_IG_USER_ID)
      : Promise.resolve<PlatformResult>({ connected: false }),
    keys.SMM_TWITTER_BEARER_TOKEN && keys.SMM_TWITTER_USER_ID
      ? fetchTwitter(keys.SMM_TWITTER_BEARER_TOKEN, keys.SMM_TWITTER_USER_ID)
      : Promise.resolve<PlatformResult>({ connected: false }),
    keys.SMM_LINKEDIN_ACCESS_TOKEN
      ? fetchLinkedIn(keys.SMM_LINKEDIN_ACCESS_TOKEN, keys.SMM_LINKEDIN_ORG_ID ?? "")
      : Promise.resolve<PlatformResult>({ connected: false }),
    keys.SMM_YOUTUBE_API_KEY && keys.SMM_YOUTUBE_CHANNEL_ID
      ? fetchYouTube(keys.SMM_YOUTUBE_API_KEY, keys.SMM_YOUTUBE_CHANNEL_ID)
      : Promise.resolve<PlatformResult>({ connected: false }),
    keys.SMM_PINTEREST_ACCESS_TOKEN
      ? fetchPinterest(keys.SMM_PINTEREST_ACCESS_TOKEN)
      : Promise.resolve<PlatformResult>({ connected: false }),
  ]);

  res.json({ facebook, instagram, twitter, linkedin, youtube, pinterest });
});

// ── GET /api/smm/traffic ─────────────────────────────────────────────────────

router.get("/smm/traffic", requireAdmin, async (req: Request, res: Response) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({ referrer: pageEventsTable.referrer, count: sql<number>`count(*)`.as("count") })
    .from(pageEventsTable)
    .where(
      sql`event_type = 'pageview' AND created_at >= ${since} AND referrer IS NOT NULL
          AND (referrer ILIKE '%instagram%' OR referrer ILIKE '%facebook%'
            OR referrer ILIKE '%t.co%' OR referrer ILIKE '%twitter.com%' OR referrer ILIKE '%x.com%'
            OR referrer ILIKE '%linkedin%' OR referrer ILIKE '%youtube%' OR referrer ILIKE '%pinterest%')`
    )
    .groupBy(pageEventsTable.referrer)
    .orderBy(sql`count(*) DESC`)
    .limit(100);

  const platforms: Record<string, number> = {
    instagram: 0, facebook: 0, twitter: 0, linkedin: 0, youtube: 0, pinterest: 0,
  };
  for (const row of rows) {
    const ref = (row.referrer ?? "").toLowerCase();
    if (ref.includes("instagram")) platforms.instagram += Number(row.count);
    else if (ref.includes("facebook")) platforms.facebook += Number(row.count);
    else if (ref.includes("t.co") || ref.includes("twitter") || ref.includes("x.com")) platforms.twitter += Number(row.count);
    else if (ref.includes("linkedin")) platforms.linkedin += Number(row.count);
    else if (ref.includes("youtube")) platforms.youtube += Number(row.count);
    else if (ref.includes("pinterest")) platforms.pinterest += Number(row.count);
  }
  const total = Object.values(platforms).reduce((a, b) => a + b, 0);
  res.json({ platforms, total });
});

// ── GET /api/smm/scheduled ───────────────────────────────────────────────────

router.get("/smm/scheduled", requireAdmin, async (_req: Request, res: Response) => {
  const rows = await db.select().from(smmScheduledPostsTable)
    .orderBy(desc(smmScheduledPostsTable.scheduledAt))
    .limit(100);
  res.json(rows);
});

router.post("/smm/scheduled", requireAdmin, async (req: Request, res: Response) => {
  const { platforms, content, imageUrl, scheduledAt } = req.body as {
    platforms: string[]; content: string; imageUrl?: string; scheduledAt: string;
  };
  if (!platforms?.length || !content?.trim() || !scheduledAt) {
    res.status(400).json({ error: "platforms, content, and scheduledAt are required" });
    return;
  }
  const [row] = await db.insert(smmScheduledPostsTable).values({
    platforms: platforms.join(","),
    content: content.trim(),
    imageUrl: imageUrl || null,
    scheduledAt: new Date(scheduledAt),
    createdBy: (req as any).session?.adminId ? "admin" : "admin",
  }).returning();
  res.json(row);
});

router.delete("/smm/scheduled/:id", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  await db.delete(smmScheduledPostsTable).where(eq(smmScheduledPostsTable.id, id));
  res.json({ success: true });
});

router.patch("/smm/scheduled/:id/cancel", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const [row] = await db.update(smmScheduledPostsTable)
    .set({ status: "cancelled" })
    .where(eq(smmScheduledPostsTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// ── GET /api/smm/settings ────────────────────────────────────────────────────

router.get("/smm/settings", requireAdmin, async (_req: Request, res: Response) => {
  const rows = await db.select().from(integrationsTable)
    .where(like(integrationsTable.name, "SMM_%"))
    .orderBy(integrationsTable.name);
  res.json(rows.map(r => ({ ...r, value: maskValue(r.value), hasValue: !!r.value })));
});

router.put("/smm/settings", requireAdmin, async (req: Request, res: Response) => {
  const { name, label, value, description } = req.body as {
    name: string; label: string; value: string; description?: string;
  };
  if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }

  const existing = await db.select({ id: integrationsTable.id })
    .from(integrationsTable).where(eq(integrationsTable.name, name));

  if (existing.length > 0) {
    const updates: Partial<typeof integrationsTable.$inferInsert> = {
      updatedAt: new Date(), label, description,
    };
    if (value && !value.startsWith("••")) updates.value = value;
    const [row] = await db.update(integrationsTable).set(updates)
      .where(eq(integrationsTable.name, name)).returning();
    res.json({ ...row, value: maskValue(row.value), hasValue: !!row.value });
  } else {
    const [row] = await db.insert(integrationsTable)
      .values({ name, label, value: value ?? "", description, category: "Social Media" })
      .returning();
    res.json({ ...row, value: maskValue(row.value), hasValue: !!row.value });
  }
});

// ── POST /api/smm/settings/test/:platform ────────────────────────────────────

router.post("/smm/settings/test/:platform", requireAdmin, async (req: Request, res: Response) => {
  const { platform } = req.params;
  const keys = await getSmmKeys();

  try {
    if (platform === "facebook") {
      if (!keys.SMM_META_ACCESS_TOKEN || !keys.SMM_META_PAGE_ID) {
        res.json({ ok: false, message: "Meta Access Token and Page ID are required" }); return;
      }
      const r = await fetch(
        `https://graph.facebook.com/v19.0/${keys.SMM_META_PAGE_ID}?fields=name,followers_count&access_token=${keys.SMM_META_ACCESS_TOKEN}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (r.ok) {
        const d = await r.json();
        res.json({ ok: true, message: `Connected: ${d.name} — ${(d.followers_count ?? 0).toLocaleString()} followers` });
      } else {
        res.json({ ok: false, message: `Facebook returned ${r.status} — check your Access Token` });
      }
      return;
    }

    if (platform === "instagram") {
      if (!keys.SMM_META_ACCESS_TOKEN || !keys.SMM_META_IG_USER_ID) {
        res.json({ ok: false, message: "Meta Access Token and Instagram User ID are required" }); return;
      }
      const r = await fetch(
        `https://graph.facebook.com/v19.0/${keys.SMM_META_IG_USER_ID}?fields=username,followers_count&access_token=${keys.SMM_META_ACCESS_TOKEN}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (r.ok) {
        const d = await r.json();
        res.json({ ok: true, message: `Connected: @${d.username} — ${(d.followers_count ?? 0).toLocaleString()} followers` });
      } else {
        res.json({ ok: false, message: `Instagram returned ${r.status} — check your credentials` });
      }
      return;
    }

    if (platform === "twitter") {
      if (!keys.SMM_TWITTER_BEARER_TOKEN || !keys.SMM_TWITTER_USER_ID) {
        res.json({ ok: false, message: "Bearer Token and User ID are required" }); return;
      }
      const r = await fetch(
        `https://api.twitter.com/2/users/${keys.SMM_TWITTER_USER_ID}?user.fields=name,username,public_metrics`,
        { headers: { Authorization: `Bearer ${keys.SMM_TWITTER_BEARER_TOKEN}` }, signal: AbortSignal.timeout(10000) }
      );
      if (r.ok) {
        const d = await r.json();
        res.json({ ok: true, message: `Connected: @${d.data?.username} — ${(d.data?.public_metrics?.followers_count ?? 0).toLocaleString()} followers` });
      } else {
        res.json({ ok: false, message: `Twitter/X returned ${r.status} — check your Bearer Token` });
      }
      return;
    }

    if (platform === "linkedin") {
      if (!keys.SMM_LINKEDIN_ACCESS_TOKEN) {
        res.json({ ok: false, message: "Access Token is required" }); return;
      }
      const r = await fetch("https://api.linkedin.com/v2/me", {
        headers: { Authorization: `Bearer ${keys.SMM_LINKEDIN_ACCESS_TOKEN}` },
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) {
        const d = await r.json();
        res.json({ ok: true, message: `Connected: ${d.localizedFirstName} ${d.localizedLastName}` });
      } else {
        res.json({ ok: false, message: `LinkedIn returned ${r.status} — check your Access Token` });
      }
      return;
    }

    if (platform === "youtube") {
      if (!keys.SMM_YOUTUBE_API_KEY || !keys.SMM_YOUTUBE_CHANNEL_ID) {
        res.json({ ok: false, message: "API Key and Channel ID are required" }); return;
      }
      const r = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${keys.SMM_YOUTUBE_CHANNEL_ID}&key=${keys.SMM_YOUTUBE_API_KEY}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (r.ok) {
        const d = await r.json();
        const ch = d.items?.[0];
        if (ch) {
          res.json({ ok: true, message: `Connected: ${ch.snippet.title} — ${parseInt(ch.statistics.subscriberCount).toLocaleString()} subscribers` });
        } else {
          res.json({ ok: false, message: "Channel not found — check your Channel ID" });
        }
      } else {
        res.json({ ok: false, message: `YouTube returned ${r.status} — check your API Key` });
      }
      return;
    }

    if (platform === "pinterest") {
      if (!keys.SMM_PINTEREST_ACCESS_TOKEN) {
        res.json({ ok: false, message: "Access Token is required" }); return;
      }
      const r = await fetch("https://api.pinterest.com/v5/user_account", {
        headers: { Authorization: `Bearer ${keys.SMM_PINTEREST_ACCESS_TOKEN}` },
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) {
        const d = await r.json();
        res.json({ ok: true, message: `Connected: @${d.username}` });
      } else {
        res.json({ ok: false, message: `Pinterest returned ${r.status} — check your Access Token` });
      }
      return;
    }

    res.status(400).json({ error: "Unknown platform" });
  } catch (err: any) {
    res.json({ ok: false, message: `Connection error: ${err.message}` });
  }
});

export default router;
