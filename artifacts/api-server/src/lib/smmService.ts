import { db } from "@workspace/db";
import { integrationsTable } from "@workspace/db/schema";
import { like } from "drizzle-orm";

export async function getSmmKeys(): Promise<Record<string, string>> {
  const rows = await db.select().from(integrationsTable)
    .where(like(integrationsTable.name, "SMM_%"));
  return Object.fromEntries(rows.map(r => [r.name, r.value]));
}

export type PlatformResult =
  | { connected: false }
  | {
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
    };

const NOT_CONNECTED: PlatformResult = { connected: false };

export async function fetchFacebook(pageToken: string, pageId: string): Promise<PlatformResult> {
  try {
    const r = await fetch(
      `https://graph.facebook.com/v19.0/${pageId}?fields=name,followers_count,fan_count,posts.limit(10){message,created_time,full_picture,likes.summary(true),comments.summary(true)}&access_token=${pageToken}`,
      { signal: AbortSignal.timeout(12000) }
    );
    if (!r.ok) return NOT_CONNECTED;
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
    return { connected: true, displayName: d.name, followers: d.followers_count ?? d.fan_count ?? 0, totalPosts: posts.length, recentPosts: posts };
  } catch { return NOT_CONNECTED; }
}

export async function fetchInstagram(accessToken: string, igUserId: string): Promise<PlatformResult> {
  try {
    const r = await fetch(
      `https://graph.facebook.com/v19.0/${igUserId}?fields=username,followers_count,media_count,media.limit(10){caption,timestamp,like_count,comments_count,media_type,media_url,thumbnail_url,permalink}&access_token=${accessToken}`,
      { signal: AbortSignal.timeout(12000) }
    );
    if (!r.ok) return NOT_CONNECTED;
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
    return { connected: true, username: `@${d.username}`, followers: d.followers_count ?? 0, totalPosts: d.media_count ?? posts.length, recentPosts: posts };
  } catch { return NOT_CONNECTED; }
}

export async function fetchTwitter(bearerToken: string, userId: string): Promise<PlatformResult> {
  try {
    const [userR, tweetsR] = await Promise.all([
      fetch(`https://api.twitter.com/2/users/${userId}?user.fields=public_metrics,username,name`, { headers: { Authorization: `Bearer ${bearerToken}` }, signal: AbortSignal.timeout(12000) }),
      fetch(`https://api.twitter.com/2/users/${userId}/tweets?max_results=10&tweet.fields=public_metrics,created_at`, { headers: { Authorization: `Bearer ${bearerToken}` }, signal: AbortSignal.timeout(12000) }),
    ]);
    if (!userR.ok) return NOT_CONNECTED;
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
    return { connected: true, username: `@${user.data?.username}`, displayName: user.data?.name, followers: metrics.followers_count ?? 0, totalPosts: metrics.tweet_count ?? 0, recentPosts: posts };
  } catch { return NOT_CONNECTED; }
}

export async function fetchLinkedIn(accessToken: string, orgId: string): Promise<PlatformResult> {
  try {
    const r = await fetch(
      orgId ? `https://api.linkedin.com/v2/organizations/${orgId}` : `https://api.linkedin.com/v2/me`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(12000) }
    );
    if (!r.ok) return NOT_CONNECTED;
    const d = await r.json();
    return { connected: true, displayName: d.localizedName ?? `${d.localizedFirstName ?? ""} ${d.localizedLastName ?? ""}`.trim(), followers: d.followersCount ?? 0, totalPosts: 0, recentPosts: [] };
  } catch { return NOT_CONNECTED; }
}

export async function fetchYouTube(apiKey: string, channelId: string): Promise<PlatformResult> {
  try {
    const [channelR, videosR] = await Promise.all([
      fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${channelId}&key=${apiKey}`, { signal: AbortSignal.timeout(12000) }),
      fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=10&order=date&type=video&key=${apiKey}`, { signal: AbortSignal.timeout(12000) }),
    ]);
    if (!channelR.ok) return NOT_CONNECTED;
    const channelData = await channelR.json();
    const ch = channelData.items?.[0];
    if (!ch) return NOT_CONNECTED;
    const videosData = videosR.ok ? await videosR.json() : null;
    const posts = (videosData?.items ?? []).map((v: any) => ({
      id: v.id?.videoId ?? v.id,
      content: v.snippet?.title ?? "",
      imageUrl: v.snippet?.thumbnails?.medium?.url ?? undefined,
      likes: 0, comments: 0, views: 0,
      date: v.snippet?.publishedAt ? new Date(v.snippet.publishedAt).toISOString().split("T")[0] : "",
      url: `https://youtube.com/watch?v=${v.id?.videoId}`,
    }));
    return { connected: true, displayName: ch.snippet?.title, followers: parseInt(ch.statistics?.subscriberCount ?? "0"), totalPosts: parseInt(ch.statistics?.videoCount ?? "0"), recentPosts: posts };
  } catch { return NOT_CONNECTED; }
}

export async function fetchPinterest(accessToken: string): Promise<PlatformResult> {
  try {
    const [accountR, pinsR] = await Promise.all([
      fetch("https://api.pinterest.com/v5/user_account", { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(12000) }),
      fetch("https://api.pinterest.com/v5/pins?page_size=10", { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(12000) }),
    ]);
    if (!accountR.ok) return NOT_CONNECTED;
    const account = await accountR.json();
    const pinsData = pinsR.ok ? await pinsR.json() : null;
    const posts = (pinsData?.items ?? []).map((p: any) => ({
      id: p.id, content: p.description ?? p.title ?? "",
      imageUrl: p.media?.images?.["400x300"]?.url ?? undefined,
      likes: p.save_count ?? 0, comments: p.comment_count ?? 0, views: 0,
      date: p.created_at ? new Date(p.created_at).toISOString().split("T")[0] : "",
      url: p.link ?? undefined,
    }));
    return { connected: true, username: `@${account.username}`, followers: account.follower_count ?? 0, totalPosts: account.pin_count ?? posts.length, recentPosts: posts };
  } catch { return NOT_CONNECTED; }
}

export async function fetchAllPlatforms(keys: Record<string, string>) {
  const [facebook, instagram, twitter, linkedin, youtube, pinterest] = await Promise.all([
    keys.SMM_META_ACCESS_TOKEN && keys.SMM_META_PAGE_ID
      ? fetchFacebook(keys.SMM_META_ACCESS_TOKEN, keys.SMM_META_PAGE_ID)
      : Promise.resolve(NOT_CONNECTED),
    keys.SMM_META_ACCESS_TOKEN && keys.SMM_META_IG_USER_ID
      ? fetchInstagram(keys.SMM_META_ACCESS_TOKEN, keys.SMM_META_IG_USER_ID)
      : Promise.resolve(NOT_CONNECTED),
    keys.SMM_TWITTER_BEARER_TOKEN && keys.SMM_TWITTER_USER_ID
      ? fetchTwitter(keys.SMM_TWITTER_BEARER_TOKEN, keys.SMM_TWITTER_USER_ID)
      : Promise.resolve(NOT_CONNECTED),
    keys.SMM_LINKEDIN_ACCESS_TOKEN
      ? fetchLinkedIn(keys.SMM_LINKEDIN_ACCESS_TOKEN, keys.SMM_LINKEDIN_ORG_ID ?? "")
      : Promise.resolve(NOT_CONNECTED),
    keys.SMM_YOUTUBE_API_KEY && keys.SMM_YOUTUBE_CHANNEL_ID
      ? fetchYouTube(keys.SMM_YOUTUBE_API_KEY, keys.SMM_YOUTUBE_CHANNEL_ID)
      : Promise.resolve(NOT_CONNECTED),
    keys.SMM_PINTEREST_ACCESS_TOKEN
      ? fetchPinterest(keys.SMM_PINTEREST_ACCESS_TOKEN)
      : Promise.resolve(NOT_CONNECTED),
  ]);
  return { facebook, instagram, twitter, linkedin, youtube, pinterest };
}
