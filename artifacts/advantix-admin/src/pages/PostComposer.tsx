import { useState } from "react";
import {
  Sparkles, Copy, Check, RefreshCw, Instagram, Facebook, Twitter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

/* ── Platform specs ── */
const PLATFORMS = [
  {
    id: "instagram", label: "Instagram", color: "#e1306c", bg: "rgba(225,48,108,0.08)",
    border: "rgba(225,48,108,0.3)", charLimit: 2200, hashLimit: 30,
    gradient: "linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)",
    icon: () => <InstagramIcon />,
  },
  {
    id: "facebook", label: "Facebook", color: "#1877f2", bg: "rgba(24,119,242,0.08)",
    border: "rgba(24,119,242,0.3)", charLimit: 63206, hashLimit: 3,
    gradient: "linear-gradient(135deg,#1877f2,#42a5f5)",
    icon: () => <FacebookIcon />,
  },
  {
    id: "twitter", label: "X (Twitter)", color: "#ffffff", bg: "rgba(255,255,255,0.05)",
    border: "rgba(255,255,255,0.2)", charLimit: 280, hashLimit: 2,
    gradient: "linear-gradient(135deg,#141414,#333)",
    icon: () => <XIcon />,
  },
  {
    id: "pinterest", label: "Pinterest", color: "#e60023", bg: "rgba(230,0,35,0.08)",
    border: "rgba(230,0,35,0.3)", charLimit: 500, hashLimit: 20,
    gradient: "linear-gradient(135deg,#e60023,#ff6b6b)",
    icon: () => <PinterestIcon />,
  },
];

const TONES = [
  { id: "professional", label: "Professional", desc: "Expert authority" },
  { id: "casual",       label: "Casual",       desc: "Friendly & relatable" },
  { id: "hype",         label: "Hype",         desc: "Bold & exciting" },
  { id: "minimal",      label: "Minimal",      desc: "Quiet confidence" },
  { id: "storytelling", label: "Story",        desc: "Narrative arc" },
];

interface GeneratedPost {
  platform: string;
  data: Record<string, unknown>;
}

export default function PostComposer() {
  const { toast } = useToast();
  const [selectedPlatform, setSelectedPlatform] = useState("instagram");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("professional");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GeneratedPost | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const platform = PLATFORMS.find(p => p.id === selectedPlatform)!;

  const handleGenerate = async () => {
    if (!topic.trim()) { toast({ variant: "destructive", title: "Enter a topic first" }); return; }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/content/generate-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ platform: selectedPlatform, topic, tone, context }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Generation failed");
      setResult({ platform: selectedPlatform, data: json.data });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed" });
    } finally {
      setLoading(false);
    }
  };

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const getPostText = (d: Record<string, unknown>): string => {
    if (typeof d.post === "string") return d.post;
    if (typeof d.description === "string") return d.description;
    return "";
  };

  const getHashtags = (d: Record<string, unknown>): string[] => {
    if (Array.isArray(d.hashtags)) return d.hashtags as string[];
    return [];
  };

  const postText = result ? getPostText(result.data) : "";
  const hashtags = result ? getHashtags(result.data) : [];
  const fullPost = postText + (hashtags.length > 0 ? "\n\n" + hashtags.map(h => `#${h}`).join(" ") : "");
  const charCount = fullPost.length;

  return (
    <div className="min-h-screen bg-[#080e1a] text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Post Composer</h1>
          <p className="text-slate-400 mt-1">AI writes platform-perfect content that's built to go viral</p>
        </div>

        <div className="grid xl:grid-cols-2 gap-8">
          {/* ── Left: Controls ── */}
          <div className="space-y-5">
            {/* Platform picker */}
            <div className="bg-[#0d1526] border border-slate-700/50 rounded-2xl p-5">
              <Label className="text-xs text-blue-400 font-semibold uppercase tracking-widest mb-3 block">Target Platform</Label>
              <div className="grid grid-cols-2 gap-2">
                {PLATFORMS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedPlatform(p.id); setResult(null); }}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-sm font-medium transition-all ${
                      selectedPlatform === p.id
                        ? "border-opacity-100 text-white shadow-lg"
                        : "border-slate-700 text-slate-400 hover:border-slate-600 bg-[#0a1020]"
                    }`}
                    style={selectedPlatform === p.id ? {
                      background: p.bg, borderColor: p.border, color: "#fff",
                    } : {}}
                  >
                    <p.icon />
                    <span>{p.label}</span>
                    {selectedPlatform === p.id && (
                      <span className="ml-auto text-[10px] font-normal opacity-60">{p.charLimit.toLocaleString()} chars</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Topic */}
            <div className="bg-[#0d1526] border border-slate-700/50 rounded-2xl p-5">
              <Label className="text-xs text-blue-400 font-semibold uppercase tracking-widest mb-3 block">What's the post about?</Label>
              <Textarea
                value={topic}
                onChange={e => setTopic(e.target.value)}
                rows={3}
                placeholder="e.g. Launching our new UI/UX design service for SaaS startups — focus on speed and conversion"
                className="bg-[#111827] border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500 resize-none"
              />
            </div>

            {/* Tone */}
            <div className="bg-[#0d1526] border border-slate-700/50 rounded-2xl p-5">
              <Label className="text-xs text-blue-400 font-semibold uppercase tracking-widest mb-3 block">Content Tone</Label>
              <div className="flex flex-wrap gap-2">
                {TONES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTone(t.id)}
                    className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                      tone === t.id
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "bg-[#0a1020] border-slate-700 text-slate-400 hover:border-blue-600/50"
                    }`}
                  >
                    <div>{t.label}</div>
                    <div className={`text-[10px] mt-0.5 ${tone === t.id ? "text-blue-200" : "text-slate-600"}`}>{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Optional context */}
            <div className="bg-[#0d1526] border border-slate-700/50 rounded-2xl p-5">
              <Label className="text-xs text-blue-400 font-semibold uppercase tracking-widest mb-3 block">Additional Context <span className="text-slate-600 normal-case font-normal">(optional)</span></Label>
              <Input
                value={context}
                onChange={e => setContext(e.target.value)}
                placeholder="e.g. targeting startup founders, include stats, link to portfolio"
                className="bg-[#111827] border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500"
              />
            </div>

            {/* Generate */}
            <Button
              onClick={handleGenerate}
              disabled={loading || !topic.trim()}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white h-12 text-base font-semibold gap-2 shadow-lg shadow-blue-600/20"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? "Writing..." : "Generate Content"}
            </Button>
          </div>

          {/* ── Right: Output ── */}
          <div>
            {!result && !loading && (
              <div className="flex flex-col items-center justify-center h-full min-h-80 gap-4 text-center bg-[#0d1526] border border-slate-700/50 rounded-2xl p-8">
                <div className="w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-600/20 flex items-center justify-center">
                  <Sparkles className="w-7 h-7 text-blue-400" />
                </div>
                <div>
                  <p className="text-slate-300 font-medium">Ready to create</p>
                  <p className="text-slate-500 text-sm mt-1">Fill in the topic on the left and hit Generate</p>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full max-w-xs mt-2">
                  {PLATFORMS.map(p => (
                    <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg bg-[#0a1020] border border-slate-800">
                      <p.icon />
                      <span className="text-xs text-slate-500">{p.charLimit > 1000 ? "2,200+" : p.charLimit} chars</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center justify-center h-full min-h-80 gap-4 bg-[#0d1526] border border-slate-700/50 rounded-2xl p-8">
                <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
                <div className="text-center">
                  <p className="text-slate-300 font-medium">AI is writing...</p>
                  <p className="text-slate-500 text-sm mt-1">Crafting viral {platform.label} content</p>
                </div>
              </div>
            )}

            {result && !loading && (
              <div className="space-y-4">
                {/* Platform badge */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: platform.gradient }}>
                      <platform.icon />
                    </div>
                    <span className="text-sm font-semibold text-white">{platform.label} Content</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono px-2 py-1 rounded-md ${charCount > platform.charLimit ? "text-red-400 bg-red-400/10" : "text-emerald-400 bg-emerald-400/10"}`}>
                      {charCount} / {platform.charLimit}
                    </span>
                    <button onClick={handleGenerate} className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-600/10 rounded-lg transition-colors">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Viral tip */}
                {result.data.viralTip && (
                  <div className="flex gap-2 p-3 rounded-xl bg-blue-600/10 border border-blue-600/20">
                    <Sparkles className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-blue-300">{String(result.data.viralTip)}</p>
                  </div>
                )}

                {/* Hook (if available) */}
                {(result.data.hook || result.data.openingHook || result.data.bestHook) && (
                  <ResultCard
                    label="Opening Hook"
                    accent="#f59e0b"
                    text={String(result.data.hook ?? result.data.openingHook ?? result.data.bestHook)}
                    copyKey="hook"
                    copied={copied}
                    onCopy={copyText}
                  />
                )}

                {/* Main post / caption */}
                {postText && (
                  <ResultCard
                    label={result.platform === "pinterest" ? "Pin Description" : "Caption"}
                    accent={platform.color}
                    text={postText}
                    copyKey="post"
                    copied={copied}
                    onCopy={copyText}
                    multiline
                  />
                )}

                {/* Pinterest title */}
                {result.data.title && result.platform === "pinterest" && (
                  <ResultCard
                    label="Pin Title"
                    accent="#e60023"
                    text={String(result.data.title)}
                    copyKey="title"
                    copied={copied}
                    onCopy={copyText}
                  />
                )}

                {/* Thread suggestion (X) */}
                {result.data.threadSuggestion && (
                  <ResultCard
                    label="Thread Structure"
                    accent="#888"
                    text={String(result.data.threadSuggestion)}
                    copyKey="thread"
                    copied={copied}
                    onCopy={copyText}
                  />
                )}

                {/* Alternative versions (X) */}
                {Array.isArray(result.data.alternativeVersions) && result.data.alternativeVersions.length > 0 && (
                  <div className="bg-[#0d1526] border border-slate-700/50 rounded-xl p-4">
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-3">Alternative Versions</p>
                    {(result.data.alternativeVersions as string[]).map((alt, i) => (
                      <div key={i} className="flex items-start justify-between gap-2 mb-2 last:mb-0 p-2 rounded-lg bg-[#0a1020]">
                        <p className="text-sm text-slate-300 flex-1">{alt}</p>
                        <button onClick={() => copyText(alt, `alt-${i}`)} className="text-slate-600 hover:text-blue-400 transition-colors p-1 shrink-0">
                          {copied === `alt-${i}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Hashtags */}
                {hashtags.length > 0 && (
                  <div className="bg-[#0d1526] border border-slate-700/50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Hashtags ({hashtags.length})</p>
                      <button onClick={() => copyText(hashtags.map(h => `#${h}`).join(" "), "hashtags")} className="text-slate-600 hover:text-blue-400 transition-colors p-1">
                        {copied === "hashtags" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {hashtags.map((h, i) => (
                        <span key={i} className="text-xs px-2 py-1 rounded-full bg-blue-600/10 text-blue-300 border border-blue-600/20">
                          #{h}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Copy all button */}
                <Button
                  onClick={() => copyText(fullPost, "all")}
                  className="w-full bg-[#0d1526] border border-slate-700 hover:border-blue-600/50 hover:bg-blue-600/10 text-white gap-2 font-medium"
                  variant="outline"
                >
                  {copied === "all" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  {copied === "all" ? "Copied!" : "Copy Full Post"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultCard({ label, accent, text, copyKey, copied, onCopy, multiline }: {
  label: string; accent: string; text: string; copyKey: string;
  copied: string | null; onCopy: (t: string, k: string) => void; multiline?: boolean;
}) {
  return (
    <div className="bg-[#0d1526] border border-slate-700/50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: accent }} />
          <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">{label}</p>
        </div>
        <button onClick={() => onCopy(text, copyKey)} className="text-slate-600 hover:text-blue-400 transition-colors p-1">
          {copied === copyKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      {multiline ? (
        <p className="text-sm text-slate-200 whitespace-pre-line leading-relaxed">{text}</p>
      ) : (
        <p className="text-sm text-slate-200">{text}</p>
      )}
    </div>
  );
}

/* ── SVG Icons ── */
function InstagramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="url(#ig-grad)">
      <defs>
        <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#fcb045" />
          <stop offset="50%" stopColor="#fd1d1d" />
          <stop offset="100%" stopColor="#833ab4" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" fill="none" stroke="url(#ig-grad)" strokeWidth="2"/>
      <circle cx="12" cy="12" r="4" fill="none" stroke="url(#ig-grad)" strokeWidth="2"/>
      <circle cx="17.5" cy="6.5" r="1.5" fill="url(#ig-grad)"/>
    </svg>
  );
}
function FacebookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#1877f2">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}
function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}
function PinterestIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#e60023">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
    </svg>
  );
}
