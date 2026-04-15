import {
  Share2, Instagram, Facebook, Twitter, Youtube, Linkedin,
  TrendingUp, Heart, MessageCircle, Eye, Users, Plus,
  BarChart2, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const platforms = [
  {
    name: "Instagram",
    icon: Instagram,
    color: "from-pink-500 to-rose-500",
    followers: "12.4K",
    growth: "+8.2%",
    up: true,
    posts: 214,
    engagement: "4.7%",
  },
  {
    name: "Facebook",
    icon: Facebook,
    color: "from-blue-600 to-blue-500",
    followers: "8.9K",
    growth: "+2.1%",
    up: true,
    posts: 312,
    engagement: "2.3%",
  },
  {
    name: "Twitter / X",
    icon: Twitter,
    color: "from-sky-400 to-sky-500",
    followers: "5.2K",
    growth: "-0.4%",
    up: false,
    posts: 528,
    engagement: "1.8%",
  },
  {
    name: "LinkedIn",
    icon: Linkedin,
    color: "from-blue-700 to-blue-600",
    followers: "3.1K",
    growth: "+5.6%",
    up: true,
    posts: 89,
    engagement: "6.1%",
  },
  {
    name: "YouTube",
    icon: Youtube,
    color: "from-red-500 to-red-600",
    followers: "1.8K",
    growth: "+14.3%",
    up: true,
    posts: 32,
    engagement: "9.4%",
  },
];

const overviewStats = [
  { label: "Total Followers", value: "31.4K", icon: Users, change: "+5.8%", up: true },
  { label: "Total Reach", value: "142K", icon: Eye, change: "+12.3%", up: true },
  { label: "Engagements", value: "6,830", icon: Heart, change: "+3.9%", up: true },
  { label: "Comments", value: "1,204", icon: MessageCircle, change: "-1.2%", up: false },
];

const recentPosts = [
  { platform: "Instagram", content: "5 ways to grow your brand online in 2025 🚀", likes: 342, comments: 28, reach: 4100, date: "Apr 13" },
  { platform: "LinkedIn", content: "Case study: How we 3x'd a client's leads in 60 days", likes: 218, comments: 41, reach: 3200, date: "Apr 12" },
  { platform: "Facebook", content: "New service launch — Advantix Digital Growth Package", likes: 127, comments: 14, reach: 2800, date: "Apr 11" },
  { platform: "Twitter / X", content: "💡 SEO tip of the week: Fix your Core Web Vitals first.", likes: 89, comments: 6, reach: 1600, date: "Apr 10" },
];

const platformColors: Record<string, string> = {
  Instagram: "text-pink-400",
  LinkedIn: "text-blue-400",
  Facebook: "text-blue-500",
  "Twitter / X": "text-sky-400",
  YouTube: "text-red-400",
};

export default function SocialMedia() {
  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Share2 className="w-6 h-6 text-primary" />
            AD Social Media
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor and manage all social media channels in one place.
          </p>
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Schedule Post
        </Button>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {overviewStats.map((stat) => (
          <Card key={stat.label} className="p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">{stat.label}</span>
              <stat.icon className="w-4 h-4 text-muted-foreground/60" />
            </div>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-bold text-foreground">{stat.value}</span>
              <span className={`flex items-center gap-0.5 text-xs font-medium ${stat.up ? "text-emerald-400" : "text-red-400"}`}>
                {stat.up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                {stat.change}
              </span>
            </div>
          </Card>
        ))}
      </div>

      {/* Platform breakdown */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-primary" />
          Platform Breakdown
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {platforms.map((p) => (
            <Card key={p.name} className="p-5 hover:border-primary/30 transition-colors cursor-pointer group">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${p.color} flex items-center justify-center shadow-md`}>
                  <p.icon className="w-4.5 h-4.5 text-white w-[18px] h-[18px]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.posts} posts</p>
                </div>
                <span className={`ml-auto text-xs font-semibold flex items-center gap-0.5 ${p.up ? "text-emerald-400" : "text-red-400"}`}>
                  {p.up ? <TrendingUp className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                  {p.growth}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/40 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Followers</p>
                  <p className="text-base font-bold text-foreground mt-0.5">{p.followers}</p>
                </div>
                <div className="bg-muted/40 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Engagement</p>
                  <p className="text-base font-bold text-foreground mt-0.5">{p.engagement}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent posts */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-primary" />
          Recent Posts
        </h2>
        <Card className="divide-y divide-border/60">
          {recentPosts.map((post, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{post.content}</p>
                <p className={`text-xs mt-0.5 font-medium ${platformColors[post.platform] ?? "text-muted-foreground"}`}>
                  {post.platform} · {post.date}
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-5 text-xs text-muted-foreground shrink-0">
                <span className="flex items-center gap-1.5">
                  <Heart className="w-3.5 h-3.5 text-pink-400" />
                  {post.likes}
                </span>
                <span className="flex items-center gap-1.5">
                  <MessageCircle className="w-3.5 h-3.5 text-sky-400" />
                  {post.comments}
                </span>
                <span className="flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  {post.reach.toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
