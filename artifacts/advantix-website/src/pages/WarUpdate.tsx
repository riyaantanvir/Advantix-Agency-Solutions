import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import {
  Shield, ArrowLeft, ExternalLink, Clock, RefreshCw,
  Globe, AlertTriangle, Loader2, ChevronRight, Radio
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const expo = [0.22, 1, 0.36, 1] as const;

const CATEGORIES = ["All", "Ukraine", "Gaza", "Sudan", "Syria", "Kashmir", "World"];

const CATEGORY_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  Ukraine: { text: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/30" },
  Gaza:    { text: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" },
  Sudan:   { text: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30" },
  Syria:   { text: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/30" },
  Kashmir: { text: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/30" },
  World:   { text: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/30" },
};

interface Article {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  description: string;
  category: string;
}

interface ApiResponse {
  articles: Article[];
  fetchedAt: number;
  nextRefresh: number;
  cached: boolean;
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatLastUpdated(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function ArticleSkeleton() {
  return (
    <div className="animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="p-5 border-b border-border/30 last:border-0">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-4 w-16 bg-secondary rounded-full" />
            <div className="h-4 w-20 bg-secondary rounded-full" />
          </div>
          <div className="h-5 w-full bg-secondary rounded mb-2" />
          <div className="h-5 w-3/4 bg-secondary rounded mb-3" />
          <div className="h-4 w-full bg-secondary/60 rounded mb-1" />
          <div className="h-4 w-2/3 bg-secondary/60 rounded" />
        </div>
      ))}
    </div>
  );
}

export default function WarUpdate() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async (force = false) => {
    try {
      if (force) setRefreshing(true);
      else setLoading(true);
      setError("");

      const method = force ? "POST" : "GET";
      const url = force ? "/api/war-update/refresh" : "/api/war-update";
      const res = await fetch(url, { method, credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      const json: ApiResponse = await res.json();
      setData(json);
    } catch {
      setError("Could not load war updates. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = data
    ? activeCategory === "All"
      ? data.articles
      : data.articles.filter((a) => a.category === activeCategory)
    : [];

  const counts: Record<string, number> = {};
  if (data) {
    for (const a of data.articles) {
      counts[a.category] = (counts[a.category] ?? 0) + 1;
    }
  }

  return (
    <div className="pt-28 pb-24 min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8">
          <Link href="/tools">
            <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
              <ArrowLeft className="w-4 h-4" /> Advantix Tools
            </button>
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: expo }}
          className="mb-8"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center shrink-0">
                <Shield className="w-7 h-7 text-red-400" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <h1 className="text-3xl font-display font-extrabold tracking-tight">War Update</h1>
                  <span className="flex items-center gap-1 text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
                    <Radio className="w-3 h-3" /> Live
                  </span>
                </div>
                <p className="text-muted-foreground text-sm">Real-time global conflict & war news</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-2 mt-1"
              onClick={() => fetchData(true)}
              disabled={refreshing || loading}
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {data && (
            <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span>Last updated: <span className="text-foreground font-medium">{formatLastUpdated(data.fetchedAt)}</span></span>
              <span>·</span>
              <span>Auto-refreshes every 10 hours</span>
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: expo, delay: 0.1 }}
          className="flex gap-2 flex-wrap mb-6"
        >
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat;
            const color = CATEGORY_COLORS[cat];
            const count = cat === "All" ? (data?.articles.length ?? 0) : (counts[cat] ?? 0);
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200 ${
                  isActive
                    ? cat === "All"
                      ? "bg-primary text-primary-foreground border-primary"
                      : `${color?.bg} ${color?.text} ${color?.border}`
                    : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                {cat}
                {count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? "bg-black/20" : "bg-secondary"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: expo, delay: 0.15 }}
        >
          <Card className="border-border/50 overflow-hidden">
            {loading ? (
              <ArticleSkeleton />
            ) : error ? (
              <div className="p-12 text-center">
                <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-4 opacity-60" />
                <p className="text-muted-foreground mb-4">{error}</p>
                <Button variant="outline" size="sm" onClick={() => fetchData()}>Try Again</Button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center">
                <Globe className="w-10 h-10 text-muted-foreground mx-auto mb-4 opacity-40" />
                <p className="text-muted-foreground text-sm">No articles found for this category.</p>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeCategory}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {filtered.map((article, idx) => {
                    const color = CATEGORY_COLORS[article.category];
                    return (
                      <motion.a
                        key={`${article.link}-${idx}`}
                        href={article.link || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: idx * 0.04 }}
                        className="block p-5 border-b border-border/30 last:border-0 hover:bg-secondary/30 transition-colors group"
                      >
                        <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${color?.bg} ${color?.text}`}>
                            {article.category}
                          </span>
                          {article.source && (
                            <span className="text-xs text-muted-foreground font-medium">{article.source}</span>
                          )}
                          {article.pubDate && (
                            <>
                              <span className="text-muted-foreground/40 text-xs">·</span>
                              <span className="text-xs text-muted-foreground">{timeAgo(article.pubDate)}</span>
                            </>
                          )}
                        </div>

                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-foreground leading-snug mb-2 group-hover:text-primary transition-colors line-clamp-2">
                              {article.title}
                            </h3>
                            {article.description && (
                              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                                {article.description}
                              </p>
                            )}
                          </div>
                          <ExternalLink className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0 mt-0.5" />
                        </div>
                      </motion.a>
                    );
                  })}
                </motion.div>
              </AnimatePresence>
            )}
          </Card>
        </motion.div>

        {!loading && !error && data && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-xs text-center text-muted-foreground mt-6"
          >
            News sourced from verified global publishers via public RSS feeds. Click any article to read the full story.
          </motion.p>
        )}

      </div>
    </div>
  );
}
