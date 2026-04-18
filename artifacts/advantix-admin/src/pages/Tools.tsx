import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link2, Video, ArrowRight, Zap, Sparkles, ExternalLink, Loader2, Headphones, Terminal, Bot, Check, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
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
    icon: Headphones,
    name: "PDF to Audio",
    description: "Upload any PDF or paste a link — the document is read aloud like a podcast. Word-by-word highlighting, speed control, and voice selection included.",
    href: "/tools/pdf-audio",
    color: "text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-border/50 hover:border-rose-500/40",
    badge: "New",
    badgeColor: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    linkLabel: "Open PDF to Audio",
  },
  {
    icon: Terminal,
    name: "Advantix Assistant",
    description: "An AI agent that controls your local machine. Run terminal commands, read and write files, open VS Code — all from a chat interface. Connect your agent once and let AI do the work.",
    href: "/tools/assistant",
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-border/50 hover:border-green-500/40",
    badge: "Beta",
    badgeColor: "bg-green-500/10 text-green-400 border-green-500/20",
    linkLabel: "Open Advantix Assistant",
  },
];

type Provider = "anthropic" | "openai" | "openrouter" | "gemini";

const PROVIDERS: Array<{ id: Provider; label: string; icon: string; defaultModel: string; models: string[]; color: string; keyHint: string }> = [
  { id: "anthropic",  label: "Claude",     icon: "🤖", defaultModel: "claude-sonnet-4-5",             models: ["claude-sonnet-4-5", "claude-3-5-haiku-20241022", "claude-opus-4-5"],  color: "border-orange-500/40 bg-orange-500/5 text-orange-400",   keyHint: "ANTHROPIC_API_KEY" },
  { id: "openai",     label: "ChatGPT",    icon: "⚡", defaultModel: "gpt-4o",                        models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],                              color: "border-green-500/40 bg-green-500/5 text-green-400",      keyHint: "OPENAI_API_KEY" },
  { id: "openrouter", label: "OpenRouter", icon: "🔀", defaultModel: "anthropic/claude-3-5-sonnet",  models: ["anthropic/claude-3-5-sonnet", "openai/gpt-4o", "google/gemini-2.0-flash-001", "meta-llama/llama-3.1-70b-instruct", "thudm/glm-4-32b", "thudm/glm-z1-32b"], color: "border-violet-500/40 bg-violet-500/5 text-violet-400", keyHint: "OPENROUTER_API_KEY" },
  { id: "gemini",     label: "Gemini",     icon: "✨", defaultModel: "gemini-2.0-flash",             models: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],              color: "border-blue-500/40 bg-blue-500/5 text-blue-400",         keyHint: "GEMINI_API_KEY" },
];

export default function Tools() {
  const { toast } = useToast();
  const [loadingTool, setLoadingTool] = useState<string | null>(null);

  const [provider, setProvider] = useState<Provider>("anthropic");
  const [model, setModel] = useState("");
  const [showModelSuggestions, setShowModelSuggestions] = useState(false);
  const [aiSettingsSaving, setAiSettingsSaving] = useState(false);
  const [aiSettingsLoading, setAiSettingsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/settings/assistant-ai", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setProvider(d.provider); setModel(d.model || ""); } })
      .finally(() => setAiSettingsLoading(false));
  }, []);

  async function saveAiSettings() {
    setAiSettingsSaving(true);
    try {
      const r = await fetch("/api/admin/settings/assistant-ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider, model }),
      });
      if (r.ok) toast({ title: "AI settings saved", description: `Provider: ${PROVIDERS.find(p => p.id === provider)?.label}, Model: ${model || "(default)"}` });
      else toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setAiSettingsSaving(false);
    }
  }

  const selectedProvider = PROVIDERS.find(p => p.id === provider)!;

  const openTool = async (e: React.MouseEvent, tool: typeof tools[number]) => {
    e.preventDefault();

    setLoadingTool(tool.name);

    // Open the window immediately so popup blockers don't block it
    const win = window.open("about:blank", "_blank");

    try {
      await fetch(`/api/admin/tools/auto-login`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Non-fatal — still navigate even if auto-login fails
    } finally {
      setLoadingTool(null);
    }

    if (win) {
      win.location.href = tool.href;
    } else {
      // Fallback if popup was blocked
      window.open(tool.href, "_blank");
    }
  };

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
            <p className="text-muted-foreground text-sm mt-0.5">All tools in one place — open instantly, no login required.</p>
          </div>
        </div>
      </div>

      {/* Tool cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {tools.map((tool, idx) => {
          const Icon = tool.icon;
          const isLoading = loadingTool === tool.name;
          return (
            <motion.a
              key={tool.name}
              href={tool.href}
              onClick={(e) => openTool(e, tool)}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: expo, delay: idx * 0.08 }}
              whileHover={{ y: -3, scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="block"
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
                  {isLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Opening...
                    </>
                  ) : (
                    <>
                      {tool.linkLabel}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </>
                  )}
                </div>
              </Card>
            </motion.a>
          );
        })}
      </div>

      {/* AI Provider Settings */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
            <Bot className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Advantix Assistant — AI Provider</h2>
            <p className="text-xs text-muted-foreground">Choose which AI powers the assistant. API keys are set in Integrations.</p>
          </div>
        </div>

        <Card className="p-5 border border-border/50">
          {aiSettingsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading settings…
            </div>
          ) : (
            <div className="space-y-4">
              {/* Provider buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PROVIDERS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setProvider(p.id); setModel(""); setShowModelSuggestions(false); }}
                    className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-sm font-medium ${
                      provider === p.id
                        ? `${p.color} border-current`
                        : "border-border/50 bg-muted/30 text-muted-foreground hover:border-border hover:text-foreground"
                    }`}
                  >
                    {provider === p.id && (
                      <span className="absolute top-1.5 right-1.5">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                    <span className="text-xl leading-none">{p.icon}</span>
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>

              {/* Model input */}
              <div className="relative">
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Model name (leave blank for default: <span className="text-foreground font-mono text-[11px]">{selectedProvider.defaultModel}</span>)</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={model}
                      onChange={e => setModel(e.target.value)}
                      onFocus={() => setShowModelSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowModelSuggestions(false), 150)}
                      placeholder={selectedProvider.defaultModel}
                      className="w-full px-3 py-2 text-sm bg-muted/40 border border-border rounded-lg font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowModelSuggestions(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    {showModelSuggestions && (
                      <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
                        {selectedProvider.models.map(m => (
                          <button
                            key={m}
                            type="button"
                            onMouseDown={() => { setModel(m); setShowModelSuggestions(false); }}
                            className="w-full text-left px-3 py-2 text-sm font-mono hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={saveAiSettings}
                    disabled={aiSettingsSaving}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                  >
                    {aiSettingsSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Save
                  </button>
                </div>
              </div>

              {/* API key hint */}
              <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                Required key: <span className="font-mono text-foreground">{selectedProvider.keyHint}</span> — add it in <a href="/integrations" className="text-primary underline underline-offset-2">Admin → Integrations</a>
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 px-5 py-4 rounded-xl bg-primary/5 border border-primary/20 text-sm text-muted-foreground">
        <ArrowRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p>All tools open in a new tab. As an admin, you are automatically signed in — no separate login needed.</p>
      </div>
    </div>
  );
}
