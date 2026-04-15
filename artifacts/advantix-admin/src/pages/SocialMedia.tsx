import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Instagram, Facebook, Twitter, Youtube, Linkedin, Share2,
  Heart, MessageCircle, Eye, Users, ArrowUpRight, BarChart2,
  ExternalLink, Globe, Settings2, CalendarDays, Loader2, WifiOff,
  TrendingUp, Pin,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const API = "/api";

// ── types ────────────────────────────────────────────────────────────────────

type RecentPost = {
  id: string; content: string; imageUrl?: string;
  likes: number; comments: number; views: number;
  date: string; url?: string;
};

type PlatformData =
  | { connected: false }
  | {
      connected: true;
      username?: string;
      displayName?: string;
      followers: number;
      totalPosts: number;
      recentPosts: RecentPost[];
    };

type PlatformsResponse = {
  facebook: PlatformData;
  instagram: PlatformData;
  twitter: PlatformData;
  linkedin: PlatformData;
  youtube: PlatformData;
  pinterest: PlatformData;
};

type TrafficResponse = {
  platforms: Record<string, number>;
  total: number;
};

// ── platform config ──────────────────────────────────────────────────────────

const PLATFORMS = [
  { key: "instagram", label: "Instagram", Icon: Instagram, color: "from-pink-500 to-rose-500", textColor: "text-pink-400" },
  { key: "facebook",  label: "Facebook",  Icon: Facebook,  color: "from-blue-600 to-blue-500", textColor: "text-blue-400" },
  { key: "twitter",   label: "X / Twitter", Icon: Twitter, color: "from-sky-400 to-sky-500",   textColor: "text-sky-400" },
  { key: "linkedin",  label: "LinkedIn",  Icon: Linkedin,  color: "from-blue-700 to-blue-600", textColor: "text-blue-500" },
  { key: "youtube",   label: "YouTube",   Icon: Youtube,   color: "from-red-500 to-red-600",   textColor: "text-red-400" },
  { key: "pinterest", label: "Pinterest", Icon: Pin,       color: "from-rose-500 to-pink-600", textColor: "text-rose-400" },
] as const;

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number | undefined | null): string {
  const num = Number(n ?? 0);
  if (!isFinite(num)) return "0";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toString();
}

function PlatformIcon({ platformKey, className }: { platformKey: string; className?: string }) {
  const cfg = PLATFORMS.find(p => p.key === platformKey);
  if (!cfg) return <Globe className={className} />;
  const { Icon } = cfg;
  return <Icon className={className} />;
}

// ── components ───────────────────────────────────────────────────────────────

function PlatformCard({
  cfg,
  data,
  traffic,
}: {
  cfg: typeof PLATFORMS[number];
  data: PlatformData;
  traffic: number;
}) {
  const { Icon, label, color, textColor } = cfg;

  if (!data.connected) {
    return (
      <Card className="p-5 flex flex-col gap-3 border-dashed opacity-70 hover:opacity-90 transition-opacity">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center opacity-50`}>
            <Icon className="w-[18px] h-[18px] text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">Not connected</p>
          </div>
          <Link href="/social-media/settings">
            <Button variant="outline" size="sm" className="ml-auto text-xs">Connect</Button>
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          Add your {label} credentials in{" "}
          <Link href="/social-media/settings" className="text-primary underline">AD SMM Settings</Link>{" "}
          to see real data here.
        </p>
      </Card>
    );
  }

  const handle = data.username ?? data.displayName ?? label;

  return (
    <Card className="p-5 hover:border-primary/30 transition-colors">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-md`}>
          <Icon className="w-[18px] h-[18px] text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{label}</p>
          <p className={`text-xs font-medium ${textColor} truncate`}>{handle}</p>
        </div>
        <Badge variant="secondary" className="ml-auto text-[10px] text-emerald-400 border-emerald-400/30 bg-emerald-400/10">Live</Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-muted/40 rounded-lg px-2.5 py-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Followers</p>
          <p className="text-base font-bold text-foreground mt-0.5">{fmtNum(data.followers)}</p>
        </div>
        <div className="bg-muted/40 rounded-lg px-2.5 py-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Posts</p>
          <p className="text-base font-bold text-foreground mt-0.5">{fmtNum(data.totalPosts)}</p>
        </div>
        <div className="bg-muted/40 rounded-lg px-2.5 py-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Referrals</p>
          <p className="text-base font-bold text-foreground mt-0.5">{fmtNum(traffic)}</p>
        </div>
      </div>

      {/* last post preview */}
      {data.recentPosts[0] && (
        <div className="bg-muted/30 rounded-lg px-3 py-2 text-xs text-muted-foreground line-clamp-2">
          <span className="font-medium text-foreground/80">Last post: </span>
          {data.recentPosts[0].content || "(no caption)"}
        </div>
      )}
    </Card>
  );
}

// ── main ─────────────────────────────────────────────────────────────────────

export default function SocialMedia() {
  const { data: platforms, isLoading: loadingPlatforms } = useQuery<PlatformsResponse>({
    queryKey: ["smm-platforms"],
    queryFn: () => fetch(`${API}/smm/platforms`, { credentials: "include" }).then(r => r.json()),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: traffic } = useQuery<TrafficResponse>({
    queryKey: ["smm-traffic"],
    queryFn: () => fetch(`${API}/smm/traffic`, { credentials: "include" }).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const connectedCount = platforms
    ? Object.values(platforms).filter(p => p.connected).length
    : 0;

  const totalFollowers = platforms
    ? Object.values(platforms).reduce((s, p) => s + (p.connected ? p.followers : 0), 0)
    : 0;

  // Merge all recent posts sorted by date
  const allPosts: (RecentPost & { platform: string })[] = [];
  if (platforms) {
    for (const [key, data] of Object.entries(platforms)) {
      if (data.connected) {
        for (const post of data.recentPosts) {
          allPosts.push({ ...post, platform: key });
        }
      }
    }
    allPosts.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Share2 className="w-6 h-6 text-primary" />
            AD Social Media
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time data from all connected social platforms.
            {connectedCount > 0 && (
              <span className="ml-2 text-emerald-400">{connectedCount} platform{connectedCount > 1 ? "s" : ""} connected</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/social-media/schedule">
            <Button variant="outline" size="sm" className="gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              Schedule Post
            </Button>
          </Link>
          <Link href="/social-media/settings">
            <Button size="sm" className="gap-1.5">
              <Settings2 className="w-3.5 h-3.5" />
              AD SMM Settings
            </Button>
          </Link>
        </div>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Total Followers</span>
            <Users className="w-4 h-4 text-muted-foreground/60" />
          </div>
          <span className="text-2xl font-bold text-foreground">
            {loadingPlatforms ? <Loader2 className="w-5 h-5 animate-spin" /> : fmtNum(totalFollowers)}
          </span>
        </Card>
        <Card className="p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Social Traffic</span>
            <TrendingUp className="w-4 h-4 text-muted-foreground/60" />
          </div>
          <span className="text-2xl font-bold text-foreground">
            {traffic ? fmtNum(traffic.total) : "—"}
          </span>
        </Card>
        <Card className="p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Platforms Connected</span>
            <Share2 className="w-4 h-4 text-muted-foreground/60" />
          </div>
          <span className="text-2xl font-bold text-foreground">{connectedCount} / 6</span>
        </Card>
        <Card className="p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Total Posts Loaded</span>
            <BarChart2 className="w-4 h-4 text-muted-foreground/60" />
          </div>
          <span className="text-2xl font-bold text-foreground">{fmtNum(allPosts.length)}</span>
        </Card>
      </div>

      {/* Platform cards */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-primary" />
          Platform Overview
        </h2>
        {loadingPlatforms ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {PLATFORMS.map(cfg => (
              <PlatformCard
                key={cfg.key}
                cfg={cfg}
                data={platforms?.[cfg.key] ?? { connected: false }}
                traffic={traffic?.platforms[cfg.key] ?? 0}
              />
            ))}
          </div>
        )}
      </div>

      {/* Social website traffic */}
      {traffic && traffic.total > 0 && (
        <div>
          <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            Website Traffic from Social (last 30 days)
          </h2>
          <Card className="p-5">
            <div className="space-y-3">
              {PLATFORMS.filter(p => (traffic.platforms[p.key] ?? 0) > 0)
                .sort((a, b) => (traffic.platforms[b.key] ?? 0) - (traffic.platforms[a.key] ?? 0))
                .map(p => {
                  const count = traffic.platforms[p.key] ?? 0;
                  const pct = traffic.total > 0 ? (count / traffic.total) * 100 : 0;
                  return (
                    <div key={p.key} className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${p.color} flex items-center justify-center shrink-0`}>
                        <p.Icon className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="text-sm text-foreground w-24 shrink-0">{p.label}</span>
                      <div className="flex-1 bg-muted/40 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full bg-gradient-to-r ${p.color} rounded-full`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-foreground w-14 text-right">{count}</span>
                    </div>
                  );
                })}
              {Object.values(traffic.platforms).every(v => v === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No social referral traffic recorded yet. Make sure UTM params or referrers are set.
                </p>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Recent posts from all platforms */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-primary" />
          Recent Posts
          {allPosts.length > 0 && (
            <span className="ml-1 text-xs text-muted-foreground font-normal">({allPosts.length} posts across connected platforms)</span>
          )}
        </h2>
        {allPosts.length === 0 ? (
          <Card className="p-10 text-center">
            <WifiOff className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No posts loaded yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Connect your social platforms in{" "}
              <Link href="/social-media/settings" className="text-primary underline">AD SMM Settings</Link>
            </p>
          </Card>
        ) : (
          <Card className="divide-y divide-border/60">
            {allPosts.slice(0, 20).map((post, i) => {
              const cfg = PLATFORMS.find(p => p.key === post.platform);
              return (
                <div key={`${post.id}-${i}`} className="flex items-start gap-4 px-5 py-4 hover:bg-muted/30 transition-colors">
                  {post.imageUrl ? (
                    <img src={post.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                  ) : cfg ? (
                    <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${cfg.color} flex items-center justify-center shrink-0`}>
                      <cfg.Icon className="w-5 h-5 text-white" />
                    </div>
                  ) : null}

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground line-clamp-2">
                      {post.content || <span className="italic text-muted-foreground">(no caption)</span>}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {cfg && <span className={`text-xs font-medium ${cfg.textColor}`}>{cfg.label}</span>}
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{post.date}</span>
                    </div>
                  </div>

                  <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                    <span className="flex items-center gap-1.5"><Heart className="w-3.5 h-3.5 text-pink-400" />{fmtNum(post.likes)}</span>
                    <span className="flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5 text-sky-400" />{fmtNum(post.comments)}</span>
                    {post.views > 0 && (
                      <span className="flex items-center gap-1.5"><Eye className="w-3.5 h-3.5 text-emerald-400" />{fmtNum(post.views)}</span>
                    )}
                    {post.url && (
                      <a href={post.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-3.5 h-3.5 hover:text-primary transition-colors" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
