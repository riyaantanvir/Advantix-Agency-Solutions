import { motion } from "framer-motion";
import { Link2, Video, ArrowRight, Zap, Sparkles, Shield, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";

const expo = [0.22, 1, 0.36, 1] as const;

const tools = [
  {
    icon: Sparkles,
    name: "Advantix AI",
    description: "Multi-model AI chat that routes your request to GPT-4o, Claude, or Gemini. Write code, generate content, analyze data, and build landing pages.",
    href: "/ai/",
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20 hover:border-violet-500/50",
    badge: "New",
    badgeColor: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    linkLabel: "Open Advantix AI",
  },
  {
    icon: Link2,
    name: "URL Shortener",
    description: "Shorten any link and track how many times it's been clicked. Perfect for campaign tracking and sharing clean links with clients.",
    href: "/tools/url-shortener",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-border/50 hover:border-blue-500/40",
    badge: null,
    badgeColor: "",
    linkLabel: "Open URL Shortener",
  },
  {
    icon: Video,
    name: "Screen Recorder",
    description: "Record your screen with no time limit. No software needed — runs entirely in your browser and saves in the best format for your device.",
    href: "/tools/screen-recorder",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-border/50 hover:border-purple-500/40",
    badge: null,
    badgeColor: "",
    linkLabel: "Open Screen Recorder",
  },
  {
    icon: Shield,
    name: "War Update",
    description: "Real-time conflict and war zone updates — curated, verified, and delivered fast. Stay informed on the latest developments worldwide.",
    href: "/tools/war-update",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-border/50 hover:border-red-500/40",
    badge: "New",
    badgeColor: "bg-red-500/10 text-red-400 border-red-500/20",
    linkLabel: "Open War Update",
  },
];

export default function Tools() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Advantix Tools</h1>
            <p className="text-muted-foreground text-sm mt-0.5">All tools in one place — accessible directly from your admin panel.</p>
          </div>
        </div>
      </div>

      {/* Tool cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {tools.map((tool, idx) => {
          const Icon = tool.icon;
          return (
            <motion.a
              key={tool.name}
              href={tool.href}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: expo, delay: idx * 0.08 }}
              whileHover={{ y: -3, scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              <Card className={`p-7 h-full border cursor-pointer transition-all duration-300 hover:shadow-lg bg-card ${tool.border}`}>
                {/* Icon + badge row */}
                <div className="flex items-start justify-between mb-5">
                  <div className={`w-14 h-14 rounded-2xl ${tool.bg} flex items-center justify-center`}>
                    <Icon className={`w-7 h-7 ${tool.color}`} />
                  </div>
                  {tool.badge && (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${tool.badgeColor}`}>
                      {tool.badge}
                    </span>
                  )}
                </div>

                {/* Content */}
                <h2 className="text-xl font-display font-bold mb-2 text-foreground">{tool.name}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed mb-5">{tool.description}</p>

                {/* CTA */}
                <div className={`flex items-center gap-2 text-sm font-semibold ${tool.color}`}>
                  {tool.linkLabel}
                  <ExternalLink className="w-3.5 h-3.5" />
                </div>
              </Card>
            </motion.a>
          );
        })}
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 px-5 py-4 rounded-xl bg-primary/5 border border-primary/20 text-sm text-muted-foreground">
        <ArrowRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p>All tools open in a new tab. As an admin, you have full access to every tool — no sign-up required.</p>
      </div>
    </div>
  );
}
