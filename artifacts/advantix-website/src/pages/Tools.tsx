import { motion } from "framer-motion";
import { Link } from "wouter";
import { Link2, Video, ArrowRight, Zap, Sparkles, Headphones, Lock, Terminal, Share2, Wallet, MessageCircle, FolderKanban } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useToolsUser } from "@/context/ToolsUserContext";

const expo = [0.22, 1, 0.36, 1] as const;

const tools = [
  {
    slug: "advantix-ai",
    icon: Sparkles,
    name: "Advantix AI",
    description: "Multi-model AI chat that automatically routes your request to GPT-4o, Claude, or Gemini — whichever is best for your task. Write code, generate images, analyze data, and more.",
    href: "/ai/",
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    badge: "New",
    external: true,
  },
  {
    slug: "url-shortener",
    icon: Link2,
    name: "URL Shortener",
    description: "Shorten any link and track how many times it's been clicked. Free to use with a quick signup.",
    href: "/tools/url-shortener",
    color: "text-primary",
    bg: "bg-primary/10",
    badge: null,
  },
  {
    slug: "screen-recorder",
    icon: Video,
    name: "Screen Recorder",
    description: "Record your screen with no time limit. No software needed — runs entirely in your browser and saves in the best format for your device.",
    href: "/tools/screen-recorder",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    badge: null,
  },
  {
    slug: "pdf-audio",
    icon: Headphones,
    name: "PDF to Audio",
    description: "Upload any PDF and convert it to natural-sounding audio instantly. Listen to documents, reports, or books — hands-free, anytime.",
    href: "/tools/pdf-audio",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    badge: null,
  },
  {
    slug: "advantix-assistant",
    icon: Terminal,
    name: "Advantix Assistant",
    description: "An AI agent that controls your local machine. Run terminal commands, read and write files, open VS Code — all from a chat interface. Run the agent script once, then let AI do the work.",
    href: "/tools/assistant",
    color: "text-green-400",
    bg: "bg-green-500/10",
    badge: "Beta",
    external: false,
  },
  {
    slug: "social-media-manager",
    icon: Share2,
    name: "Social Media Manager",
    description: "Schedule posts across Instagram, Facebook, X (Twitter), LinkedIn, YouTube, and Pinterest. View follower stats, engagement, and website traffic from social platforms — all in one place.",
    href: "/tools/social-media",
    color: "text-pink-400",
    bg: "bg-pink-500/10",
    badge: "New",
    external: false,
  },
  {
    slug: "finance",
    icon: Wallet,
    name: "Finance Management",
    description: "Track income and expenses in BDT, manage planned payments and recurring subscriptions, get a real-time dashboard with breakdowns by tag and payment method, and import/export entries via CSV.",
    href: "/tools/finance",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    badge: "New",
    external: false,
  },
  {
    slug: "project-management",
    icon: FolderKanban,
    name: "Manage Your Project",
    description: "Multi-tenant workspaces with projects, tasks (list + Kanban board), assignees, comments and Telegram alerts. Invite team members by email or share a quick-join link.",
    href: "/tools/project-management",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    badge: "New",
    external: false,
  },
  {
    slug: "whatsapp",
    icon: MessageCircle,
    name: "WhatsApp Assistant",
    description: "Connect your WhatsApp by scanning a QR code and chat with the Advantix Assistant from any phone or group. Track expenses, check stats, shorten links — all via WhatsApp message.",
    href: "/tools/whatsapp",
    color: "text-green-400",
    bg: "bg-green-500/10",
    badge: "New",
    external: false,
  },
];

export default function Tools() {
  const { user, allowedTools } = useToolsUser();

  const isAllowed = (slug: string) => {
    if (!user) return true;
    if (!allowedTools) return true;
    return allowedTools.includes(slug);
  };

  return (
    <div className="pt-28 pb-20 min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        {/* Header — compact */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: expo }}
          className="text-center mb-10"
        >
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary rounded-full px-4 py-1.5 text-xs font-bold tracking-widest uppercase mb-4">
            <Zap className="w-3.5 h-3.5" />
            Advantix Tools
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-extrabold mb-3 tracking-tight">
            Free Tools for Your Business
          </h1>
          <p className="text-sm md:text-base text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Powerful mini-tools built by Advantix — free to use. Sign up to save your data across sessions.
          </p>
        </motion.div>

        {/* Tool cards — compact grid: up to 4 cols on lg, 3 on md, 2 on sm */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {tools.map((tool, idx) => {
            const Icon = tool.icon;
            const allowed = isAllowed(tool.slug);
            const content = (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: expo, delay: Math.min(idx * 0.04, 0.3) }}
                whileHover={allowed ? { y: -2 } : {}}
                className="h-full"
              >
                <Card className={`group relative p-4 h-full border-border/50 bg-card transition-all duration-200 ${allowed ? "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 cursor-pointer" : "opacity-60 cursor-not-allowed grayscale"}`}>
                  {/* Badge top-right */}
                  {(tool.badge && allowed) || !allowed ? (
                    <div className="absolute top-3 right-3">
                      {!allowed ? (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-[10px] font-semibold border border-red-500/20">
                          <Lock className="w-2.5 h-2.5" /> Locked
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold uppercase tracking-wide">
                          {tool.badge}
                        </span>
                      )}
                    </div>
                  ) : null}

                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl ${tool.bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-5 h-5 ${tool.color}`} />
                    </div>
                    <div className="min-w-0 flex-1 pr-12">
                      <h2 className="text-sm font-display font-bold leading-tight mb-1 truncate">{tool.name}</h2>
                      <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{tool.description}</p>
                    </div>
                  </div>

                  {allowed && (
                    <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Open</span>
                      <ArrowRight className="w-3.5 h-3.5 text-primary transition-transform group-hover:translate-x-0.5" />
                    </div>
                  )}
                  {!allowed && user && (
                    <div className="mt-3 pt-3 border-t border-border/40">
                      <p className="text-[10px] text-muted-foreground">Contact admin for access</p>
                    </div>
                  )}
                </Card>
              </motion.div>
            );

            if (!allowed) return <div key={tool.name}>{content}</div>;

            return tool.external ? (
              <a key={tool.name} href={tool.href} className="block h-full">{content}</a>
            ) : (
              <Link key={tool.name} href={tool.href} className="block h-full">{content}</Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
