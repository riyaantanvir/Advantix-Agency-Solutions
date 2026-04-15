import { db } from "@workspace/db";
import { smmScheduledPostsTable, integrationsTable } from "@workspace/db/schema";
import { eq, like } from "drizzle-orm";
import { logger } from "./logger.js";

type SmmPost = {
  id: number;
  platforms: string;
  content: string;
  imageUrl: string | null;
  scheduledAt: Date;
};

const pendingTimers = new Map<number, NodeJS.Timeout>();

async function getSmmKeys(): Promise<Record<string, string>> {
  const rows = await db.select().from(integrationsTable).where(like(integrationsTable.name, "SMM_%"));
  return Object.fromEntries(rows.map(r => [r.name, r.value ?? ""]));
}

async function postToFacebook(
  content: string,
  imageUrl: string | null,
  keys: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const token = keys.SMM_META_ACCESS_TOKEN;
  const pageId = keys.SMM_META_PAGE_ID;
  if (!token || !pageId) return { ok: false, error: "Facebook not configured" };

  const endpoint = imageUrl
    ? `https://graph.facebook.com/v19.0/${pageId}/photos`
    : `https://graph.facebook.com/v19.0/${pageId}/feed`;

  const body = imageUrl
    ? { url: imageUrl, caption: content, access_token: token }
    : { message: content, access_token: token };

  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const d = await r.json().catch(() => ({})) as any;
  if (r.ok) return { ok: true };
  return { ok: false, error: d?.error?.message ?? `Facebook error ${r.status}` };
}

async function postToInstagram(
  content: string,
  imageUrl: string | null,
  keys: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const token = keys.SMM_META_ACCESS_TOKEN;
  const igUserId = keys.SMM_META_IG_USER_ID;
  if (!token || !igUserId) return { ok: false, error: "Instagram not configured" };
  if (!imageUrl) return { ok: false, error: "Instagram requires an image to publish" };

  const containerR = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: imageUrl, caption: content, access_token: token }),
    signal: AbortSignal.timeout(30000),
  });
  const container = await containerR.json().catch(() => ({})) as any;
  if (!containerR.ok) return { ok: false, error: container?.error?.message ?? `Instagram container error ${containerR.status}` };

  const publishR = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: container.id, access_token: token }),
    signal: AbortSignal.timeout(30000),
  });
  const publishData = await publishR.json().catch(() => ({})) as any;
  if (!publishR.ok) return { ok: false, error: publishData?.error?.message ?? `Instagram publish error ${publishR.status}` };

  return { ok: true };
}

async function publishPost(post: SmmPost): Promise<void> {
  pendingTimers.delete(post.id);
  logger.info({ postId: post.id, platforms: post.platforms }, "[SMM] Publishing scheduled post");

  const keys = await getSmmKeys();
  const platforms = post.platforms.split(",").map(p => p.trim().toLowerCase()).filter(Boolean);
  const results: { platform: string; ok: boolean; error?: string }[] = [];

  for (const platform of platforms) {
    try {
      if (platform === "facebook") {
        results.push({ platform, ...(await postToFacebook(post.content, post.imageUrl, keys)) });
      } else if (platform === "instagram") {
        results.push({ platform, ...(await postToInstagram(post.content, post.imageUrl, keys)) });
      } else {
        results.push({ platform, ok: false, error: `${platform} auto-publish not yet supported` });
      }
    } catch (err: any) {
      results.push({ platform, ok: false, error: err?.message ?? "Unknown error" });
    }
  }

  const anyOk = results.some(r => r.ok);
  const allFailed = results.every(r => !r.ok);
  const errors = results.filter(r => !r.ok).map(r => `${r.platform}: ${r.error}`).join("; ");

  await db.update(smmScheduledPostsTable)
    .set({
      status: allFailed ? "failed" : "published",
      publishedAt: new Date(),
      errorMessage: errors || null,
    })
    .where(eq(smmScheduledPostsTable.id, post.id));

  logger.info({ postId: post.id, anyOk, errors }, "[SMM] Post publish complete");
}

export function schedulePost(post: SmmPost): void {
  const existing = pendingTimers.get(post.id);
  if (existing) clearTimeout(existing);

  const delayMs = Math.max(0, new Date(post.scheduledAt).getTime() - Date.now());
  const timer = setTimeout(() => publishPost(post), delayMs);
  pendingTimers.set(post.id, timer);

  logger.info({ postId: post.id, delayMs: Math.round(delayMs / 1000) + "s" }, "[SMM] Post scheduled");
}

export function cancelScheduledPost(id: number): void {
  const timer = pendingTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    pendingTimers.delete(id);
    logger.info({ postId: id }, "[SMM] Post timer cancelled");
  }
}

export async function startSmmScheduler(): Promise<void> {
  try {
    const now = new Date();
    const pending = await db.select().from(smmScheduledPostsTable)
      .where(eq(smmScheduledPostsTable.status, "pending"));

    let missed = 0;
    let upcoming = 0;

    for (const post of pending) {
      if (post.scheduledAt <= now) {
        missed++;
        publishPost(post).catch(err => logger.error({ err, postId: post.id }, "[SMM] Missed post publish failed"));
      } else {
        upcoming++;
        schedulePost(post);
      }
    }

    logger.info({ missed, upcoming }, "[SMM] Scheduler started");
  } catch (err) {
    logger.error({ err }, "[SMM] Scheduler startup failed");
  }
}
