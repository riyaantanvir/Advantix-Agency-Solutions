import { motion } from "framer-motion";
import { Link } from "wouter";
import { Link2, Video, ArrowRight, Zap, Sparkles, Headphones, Lock } from "lucide-react";
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
];

export default function Tools() {
  const { user, allowedTools } = useToolsUser();

  const isAllowed = (slug: string) => {
    if (!user) return true;
    if (!allowedTools) return true;
    return allowedTools.includes(slug);
  };

  return (
    <div className="pt-32 pb-24 min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: expo }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary rounded-full px-5 py-2 text-sm font-bold tracking-widest uppercase mb-6">
            <Zap className="w-4 h-4" />
            Advantix Tools
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-extrabold mb-5 tracking-tight">
            Free Tools for Your Business
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Powerful mini-tools built by Advantix — free to use, no strings attached. Sign up to save your data across sessions.
          </p>
        </motion.div>

        {/* Tool cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {tools.map((tool, idx) => {
            const Icon = tool.icon;
            const allowed = isAllowed(tool.slug);
            const content = (
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: expo, delay: idx * 0.1 }}
                whileHover={allowed ? { y: -4, scale: 1.01 } : {}}
              >
                <Card className={`p-8 h-full border-border/50 bg-card transition-all duration-300 ${allowed ? "hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 cursor-pointer" : "opacity-50 cursor-not-allowed grayscale"}`}>
                  <div className="flex items-start justify-between mb-6">
                    <div className={`w-14 h-14 rounded-2xl ${tool.bg} flex items-center justify-center`}>
                      <Icon className={`w-7 h-7 ${tool.color}`} />
                    </div>
                    <div className="flex items-center gap-2">
                      {!allowed && (
                        <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 text-xs font-semibold border border-red-500/20">
                          <Lock className="w-3 h-3" /> No Access
                        </span>
                      )}
                      {tool.badge && allowed && (
                        <span className="px-3 py-1 rounded-full bg-secondary text-muted-foreground text-xs font-semibold">
                          {tool.badge}
                        </span>
                      )}
                    </div>
                  </div>
                  <h2 className="text-2xl font-display font-bold mb-3">{tool.name}</h2>
                  <p className="text-muted-foreground leading-relaxed mb-6">{tool.description}</p>
                  {allowed && (
                    <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                      Open Tool <ArrowRight className="w-4 h-4" />
                    </div>
                  )}
                  {!allowed && user && (
                    <p className="text-xs text-muted-foreground">Contact an admin to request access</p>
                  )}
                </Card>
              </motion.div>
            );

            if (!allowed) return <div key={tool.name}>{content}</div>;

            return tool.external ? (
              <a key={tool.name} href={tool.href}>{content}</a>
            ) : (
              <Link key={tool.name} href={tool.href}>{content}</Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
