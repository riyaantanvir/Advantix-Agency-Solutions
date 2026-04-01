import { Router } from "express";

const router = Router();

export interface NewsArticle {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  description: string;
  category: string;
}

interface CacheEntry {
  articles: NewsArticle[];
  fetchedAt: number;
}

let cache: CacheEntry | null = null;
const CACHE_MS = 10 * 60 * 60 * 1000; // 10 hours

const CONFLICT_QUERIES = [
  { q: "Ukraine Russia war 2025", category: "Ukraine" },
  { q: "Gaza Palestine Israel war 2025", category: "Gaza" },
  { q: "Sudan war conflict 2025", category: "Sudan" },
  { q: "Syria conflict war 2025", category: "Syria" },
  { q: "Kashmir conflict India Pakistan 2025", category: "Kashmir" },
  { q: "world military conflict war breaking 2025", category: "World" },
];

function parseRssItems(xml: string, category: string): NewsArticle[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return items
    .slice(0, 6)
    .map((item) => {
      const title =
        (
          item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ??
          item.match(/<title>(.*?)<\/title>/)
        )?.[1]?.trim() ?? "";
      const link =
        item.match(/<link>(.*?)<\/link>/)?.[1]?.trim() ??
        item.match(/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/)?.[1]?.trim() ??
        "";
      const pubDate =
        item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() ?? "";
      const rawDesc =
        (
          item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ??
          item.match(/<description>([\s\S]*?)<\/description>/)
        )?.[1] ?? "";
      const description = rawDesc
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 220);
      const source =
        (
          item.match(/<source[^>]*><!\[CDATA\[(.*?)\]\]><\/source>/) ??
          item.match(/<source[^>]*>(.*?)<\/source>/)
        )?.[1]?.trim() ?? "";
      return { title, link, source, pubDate, description, category };
    })
    .filter((a) => a.title.length > 5);
}

async function fetchWarNews(): Promise<NewsArticle[]> {
  const results: NewsArticle[] = [];
  for (const { q, category } of CONFLICT_QUERIES) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en&gl=US&ceid=US:en`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
      });
      if (res.ok) {
        const xml = await res.text();
        results.push(...parseRssItems(xml, category));
      }
    } catch (e) {
      console.error(`[warUpdate] Fetch failed for ${category}:`, e);
    }
  }
  return results;
}

router.get("/war-update", async (req, res) => {
  try {
    if (cache && Date.now() - cache.fetchedAt < CACHE_MS) {
      return res.json({
        articles: cache.articles,
        fetchedAt: cache.fetchedAt,
        nextRefresh: cache.fetchedAt + CACHE_MS,
        cached: true,
      });
    }

    const articles = await fetchWarNews();
    cache = { articles, fetchedAt: Date.now() };

    return res.json({
      articles,
      fetchedAt: cache.fetchedAt,
      nextRefresh: cache.fetchedAt + CACHE_MS,
      cached: false,
    });
  } catch (err) {
    console.error("[warUpdate] Route error:", err);
    return res.status(500).json({ error: "Failed to fetch war updates" });
  }
});

router.post("/war-update/refresh", async (req, res) => {
  try {
    cache = null;
    const articles = await fetchWarNews();
    cache = { articles, fetchedAt: Date.now() };
    return res.json({
      articles,
      fetchedAt: cache.fetchedAt,
      nextRefresh: cache.fetchedAt + CACHE_MS,
      cached: false,
    });
  } catch (err) {
    console.error("[warUpdate] Force refresh error:", err);
    return res.status(500).json({ error: "Refresh failed" });
  }
});

export default router;
