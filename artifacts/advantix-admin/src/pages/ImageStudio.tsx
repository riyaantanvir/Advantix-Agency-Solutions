import { useState, useRef, useCallback } from "react";
import {
  Sparkles, Upload, Download, RefreshCw, Image as ImageIcon,
  Copy, Check, Wand2, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

/* ── Platform size catalogue ── */
interface PlatformSize {
  id: string; platform: string; label: string; w: number; h: number;
  color: string; bg: string;
}

const SIZES: PlatformSize[] = [
  // Instagram
  { id: "ig-square",   platform: "Instagram", label: "Feed Square",    w: 1080, h: 1080, color: "#e1306c", bg: "rgba(225,48,108,0.08)" },
  { id: "ig-portrait", platform: "Instagram", label: "Feed Portrait",  w: 1080, h: 1350, color: "#e1306c", bg: "rgba(225,48,108,0.08)" },
  { id: "ig-story",    platform: "Instagram", label: "Story / Reel",   w: 1080, h: 1920, color: "#e1306c", bg: "rgba(225,48,108,0.08)" },
  { id: "ig-landscape",platform: "Instagram", label: "Feed Landscape", w: 1080, h: 566,  color: "#e1306c", bg: "rgba(225,48,108,0.08)" },
  // Facebook
  { id: "fb-post",     platform: "Facebook",  label: "Post Image",    w: 1200, h: 630,  color: "#1877f2", bg: "rgba(24,119,242,0.08)" },
  { id: "fb-story",    platform: "Facebook",  label: "Story",         w: 1080, h: 1920, color: "#1877f2", bg: "rgba(24,119,242,0.08)" },
  { id: "fb-cover",    platform: "Facebook",  label: "Cover Photo",   w: 820,  h: 312,  color: "#1877f2", bg: "rgba(24,119,242,0.08)" },
  // X
  { id: "x-post",      platform: "X",         label: "Post Image",    w: 1600, h: 900,  color: "#fff",    bg: "rgba(255,255,255,0.05)" },
  { id: "x-header",    platform: "X",         label: "Header",        w: 1500, h: 500,  color: "#fff",    bg: "rgba(255,255,255,0.05)" },
  // Pinterest
  { id: "pin-std",     platform: "Pinterest", label: "Standard Pin",  w: 1000, h: 1500, color: "#e60023", bg: "rgba(230,0,35,0.08)" },
  { id: "pin-square",  platform: "Pinterest", label: "Square Pin",    w: 1000, h: 1000, color: "#e60023", bg: "rgba(230,0,35,0.08)" },
  // LinkedIn
  { id: "li-post",     platform: "LinkedIn",  label: "Post Image",    w: 1200, h: 627,  color: "#0a66c2", bg: "rgba(10,102,194,0.08)" },
  { id: "li-story",    platform: "LinkedIn",  label: "Story",         w: 1080, h: 1920, color: "#0a66c2", bg: "rgba(10,102,194,0.08)" },
];

const STYLES = [
  { id: "photography", label: "Photography",  desc: "Realistic & cinematic" },
  { id: "illustration",label: "Illustration", desc: "Digital art & vectors" },
  { id: "minimal",     label: "Minimal",      desc: "Clean & spacious" },
  { id: "cinematic",   label: "Cinematic",    desc: "Dramatic & moody" },
  { id: "gradient",    label: "Gradient",     desc: "Bold & vibrant" },
  { id: "brand",       label: "Brand",        desc: "Professional & premium" },
];

const PLATFORMS_ORDER = ["Instagram", "Facebook", "X", "Pinterest", "LinkedIn"];

/* ── Canvas-based image resize ── */
function resizeImageToSize(
  sourceDataUrl: string, targetW: number, targetH: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d")!;
      // Cover: scale + center crop
      const srcAspect = img.width / img.height;
      const dstAspect = targetW / targetH;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (srcAspect > dstAspect) {
        sw = img.height * dstAspect;
        sx = (img.width - sw) / 2;
      } else {
        sh = img.width / dstAspect;
        sy = (img.height - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = sourceDataUrl;
  });
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export default function ImageStudio() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"generate" | "upload" | "analyze">("generate");

  // Generate tab
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("photography");
  const [generating, setGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null); // data URL

  // Upload tab
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  // Analyze tab
  const [analyzeImage, setAnalyzeImage] = useState<string | null>(null);
  const [analyzeFile, setAnalyzeFile] = useState<File | null>(null);
  const analyzeInputRef = useRef<HTMLInputElement>(null);
  const [analyzePlatform, setAnalyzePlatform] = useState("instagram");
  const [analyzeTone, setAnalyzeTone] = useState("professional");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<Record<string, unknown> | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Downloading state
  const [downloadingSize, setDownloadingSize] = useState<string | null>(null);

  /* ── Active image (whichever tab) ── */
  const activeImage = tab === "generate" ? generatedImage : tab === "upload" ? uploadedImage : null;

  /* ── Generate ── */
  const handleGenerate = async () => {
    if (!prompt.trim()) { toast({ variant: "destructive", title: "Enter a prompt first" }); return; }
    setGenerating(true);
    setGeneratedImage(null);
    try {
      const res = await fetch("/api/admin/content/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt, style }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Generation failed");
      setGeneratedImage(`data:${json.mimeType};base64,${json.b64_json}`);
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed" });
    } finally {
      setGenerating(false);
    }
  };

  /* ── Upload handlers ── */
  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) { toast({ variant: "destructive", title: "Please upload an image file" }); return; }
    setUploadedFile(file);
    const reader = new FileReader();
    reader.onload = e => setUploadedImage(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const handleAnalyzeFile = (file: File) => {
    if (!file.type.startsWith("image/")) { toast({ variant: "destructive", title: "Please upload an image file" }); return; }
    setAnalyzeFile(file);
    setAnalyzeResult(null);
    const reader = new FileReader();
    reader.onload = e => setAnalyzeImage(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  /* ── Download for specific size ── */
  const handleDownloadSize = async (size: PlatformSize) => {
    if (!activeImage) return;
    setDownloadingSize(size.id);
    try {
      const resized = await resizeImageToSize(activeImage, size.w, size.h);
      downloadDataUrl(resized, `advantix-${size.platform.toLowerCase()}-${size.label.replace(/\s+/g, "-").toLowerCase()}-${size.w}x${size.h}.png`);
    } catch {
      toast({ variant: "destructive", title: "Download failed" });
    } finally {
      setDownloadingSize(null);
    }
  };

  /* ── Download all sizes for a platform ── */
  const handleDownloadPlatformAll = async (platform: string) => {
    if (!activeImage) return;
    const platformSizes = SIZES.filter(s => s.platform === platform);
    for (const size of platformSizes) {
      setDownloadingSize(size.id);
      try {
        const resized = await resizeImageToSize(activeImage, size.w, size.h);
        downloadDataUrl(resized, `advantix-${platform.toLowerCase()}-${size.label.replace(/\s+/g, "-").toLowerCase()}-${size.w}x${size.h}.png`);
        await new Promise(r => setTimeout(r, 200));
      } catch { /* skip */ }
    }
    setDownloadingSize(null);
  };

  /* ── Analyze ── */
  const handleAnalyze = async () => {
    if (!analyzeImage) { toast({ variant: "destructive", title: "Upload an image first" }); return; }
    setAnalyzing(true);
    setAnalyzeResult(null);
    try {
      const base64 = analyzeImage.split(",")[1];
      const mimeType = analyzeFile?.type || "image/png";
      const res = await fetch("/api/admin/content/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ imageBase64: base64, mimeType, platform: analyzePlatform, tone: analyzeTone }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Analysis failed");
      setAnalyzeResult(json.data);
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed" });
    } finally {
      setAnalyzing(false);
    }
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  /* ── Grouped sizes ── */
  const sizesByPlatform = PLATFORMS_ORDER.map(p => ({
    platform: p,
    sizes: SIZES.filter(s => s.platform === p),
    color: SIZES.find(s => s.platform === p)?.color ?? "#fff",
    bg: SIZES.find(s => s.platform === p)?.bg ?? "transparent",
  }));

  return (
    <div className="min-h-screen bg-[#080e1a] text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">AI Image Studio</h1>
          <p className="text-slate-400 mt-1">Generate, upload or analyze images — then export to any platform size instantly</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-[#0d1526] border border-slate-700/50 rounded-xl p-1 w-fit">
          {[
            { id: "generate", label: "Generate Image",  icon: Wand2 },
            { id: "upload",   label: "Upload & Resize", icon: Upload },
            { id: "analyze",  label: "Analyze Image",   icon: Eye },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as typeof tab)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                tab === t.id ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid xl:grid-cols-5 gap-8">
          {/* ── Left panel ── */}
          <div className="xl:col-span-2 space-y-5">

            {/* GENERATE TAB */}
            {tab === "generate" && (
              <>
                <div className="bg-[#0d1526] border border-slate-700/50 rounded-2xl p-5">
                  <Label className="text-xs text-blue-400 font-semibold uppercase tracking-widest mb-3 block">Image Prompt</Label>
                  <Textarea
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    rows={4}
                    placeholder="e.g. A sleek laptop on a minimalist white desk, golden hour light streaming through a window, product photography style"
                    className="bg-[#111827] border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500 resize-none"
                  />
                </div>
                <div className="bg-[#0d1526] border border-slate-700/50 rounded-2xl p-5">
                  <Label className="text-xs text-blue-400 font-semibold uppercase tracking-widest mb-3 block">Style</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {STYLES.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setStyle(s.id)}
                        className={`px-3 py-2.5 rounded-xl border text-left text-xs transition-all ${
                          style === s.id
                            ? "bg-blue-600 border-blue-500 text-white"
                            : "bg-[#0a1020] border-slate-700 text-slate-400 hover:border-blue-600/50"
                        }`}
                      >
                        <div className="font-medium">{s.label}</div>
                        <div className={`text-[10px] mt-0.5 ${style === s.id ? "text-blue-200" : "text-slate-600"}`}>{s.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <Button
                  onClick={handleGenerate}
                  disabled={generating || !prompt.trim()}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 h-12 text-base font-semibold gap-2 shadow-lg shadow-blue-600/20"
                >
                  {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  {generating ? "Generating..." : "Generate Image"}
                </Button>
              </>
            )}

            {/* UPLOAD TAB */}
            {tab === "upload" && (
              <div
                className={`bg-[#0d1526] border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center min-h-56 cursor-pointer transition-all ${
                  dragging ? "border-blue-500 bg-blue-600/5" : "border-slate-700 hover:border-blue-600/50"
                }`}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                <Upload className={`w-10 h-10 mb-3 ${dragging ? "text-blue-400" : "text-slate-600"}`} />
                <p className="text-slate-300 font-medium text-center">Drop an image or click to upload</p>
                <p className="text-slate-500 text-sm mt-1 text-center">PNG, JPG, WEBP — any size</p>
                <p className="text-slate-600 text-xs mt-3 text-center">Screenshot, photo, or generated image</p>
              </div>
            )}

            {/* ANALYZE TAB */}
            {tab === "analyze" && (
              <div className="space-y-4">
                <div
                  className="bg-[#0d1526] border-2 border-dashed border-slate-700 hover:border-blue-600/50 rounded-2xl p-6 flex flex-col items-center justify-center min-h-40 cursor-pointer transition-all"
                  onClick={() => analyzeInputRef.current?.click()}
                >
                  <input ref={analyzeInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleAnalyzeFile(e.target.files[0])} />
                  {analyzeImage ? (
                    <img src={analyzeImage} alt="" className="max-h-32 rounded-lg object-contain" />
                  ) : (
                    <>
                      <Eye className="w-8 h-8 text-slate-600 mb-2" />
                      <p className="text-slate-300 text-sm font-medium">Upload image to analyze</p>
                      <p className="text-slate-600 text-xs mt-1">Screenshot, photo, design</p>
                    </>
                  )}
                </div>
                <div className="bg-[#0d1526] border border-slate-700/50 rounded-2xl p-4 space-y-3">
                  <div>
                    <Label className="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-2 block">Target Platform</Label>
                    <select value={analyzePlatform} onChange={e => setAnalyzePlatform(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg bg-[#111827] border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500">
                      <option value="instagram">Instagram</option>
                      <option value="facebook">Facebook</option>
                      <option value="twitter">X (Twitter)</option>
                      <option value="pinterest">Pinterest</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-2 block">Tone</Label>
                    <select value={analyzeTone} onChange={e => setAnalyzeTone(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg bg-[#111827] border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500">
                      <option value="professional">Professional</option>
                      <option value="casual">Casual</option>
                      <option value="hype">Hype</option>
                      <option value="minimal">Minimal</option>
                    </select>
                  </div>
                </div>
                <Button
                  onClick={handleAnalyze}
                  disabled={analyzing || !analyzeImage}
                  className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 h-12 text-base font-semibold gap-2"
                >
                  {analyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {analyzing ? "Analyzing..." : "Analyze & Generate Content"}
                </Button>
              </div>
            )}
          </div>

          {/* ── Right panel ── */}
          <div className="xl:col-span-3 space-y-5">

            {/* Image preview + platform export (Generate & Upload tabs) */}
            {(tab === "generate" || tab === "upload") && (
              <>
                {/* Preview */}
                <div className="bg-[#0d1526] border border-slate-700/50 rounded-2xl overflow-hidden">
                  {activeImage ? (
                    <div>
                      <img src={activeImage} alt="Generated" className="w-full object-contain max-h-80" />
                      <div className="p-3 flex items-center justify-between border-t border-slate-700/50">
                        <span className="text-xs text-slate-500">Original image — resize below for any platform</span>
                        <button onClick={() => downloadDataUrl(activeImage, "advantix-original.png")} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors">
                          <Download className="w-3.5 h-3.5" /> Original
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center min-h-64 gap-3 p-8 text-center">
                      <ImageIcon className="w-12 h-12 text-slate-700" />
                      <div>
                        <p className="text-slate-400 font-medium">
                          {tab === "generate" ? "Your generated image will appear here" : "Upload an image to resize for all platforms"}
                        </p>
                        <p className="text-slate-600 text-sm mt-1">
                          {tab === "generate" ? "Enter a prompt and click Generate" : "Drag & drop or click on the left"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Platform size export grid */}
                {activeImage && (
                  <div className="space-y-4">
                    <p className="text-sm font-semibold text-slate-300">Export for Platform</p>
                    {sizesByPlatform.map(({ platform, sizes, color, bg }) => (
                      <div key={platform} className="bg-[#0d1526] border border-slate-700/50 rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                            <span className="text-sm font-semibold text-white">{platform}</span>
                          </div>
                          <button
                            onClick={() => handleDownloadPlatformAll(platform)}
                            disabled={!!downloadingSize}
                            className="text-xs text-slate-500 hover:text-blue-400 transition-colors flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" /> All {platform} sizes
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {sizes.map(size => (
                            <button
                              key={size.id}
                              onClick={() => handleDownloadSize(size)}
                              disabled={!!downloadingSize}
                              className="flex items-center justify-between p-2.5 rounded-xl border text-left transition-all hover:border-opacity-60 group"
                              style={{ background: bg, borderColor: color + "40" }}
                            >
                              <div>
                                <div className="text-xs font-medium text-white group-hover:text-opacity-90">{size.label}</div>
                                <div className="text-[10px] font-mono mt-0.5" style={{ color }}>{size.w}×{size.h}</div>
                              </div>
                              {downloadingSize === size.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" />
                              ) : (
                                <Download className="w-3.5 h-3.5 text-slate-600 group-hover:text-white transition-colors" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ANALYZE RESULTS */}
            {tab === "analyze" && (
              <>
                {!analyzeResult && !analyzing && (
                  <div className="flex flex-col items-center justify-center min-h-80 gap-4 bg-[#0d1526] border border-slate-700/50 rounded-2xl p-8 text-center">
                    <Sparkles className="w-10 h-10 text-slate-700" />
                    <div>
                      <p className="text-slate-400 font-medium">AI Content Analysis</p>
                      <p className="text-slate-600 text-sm mt-1">Upload any image — photo, screenshot, or design — and AI will generate viral captions, hashtags, and hooks for it</p>
                    </div>
                  </div>
                )}
                {analyzing && (
                  <div className="flex flex-col items-center justify-center min-h-80 gap-4 bg-[#0d1526] border border-slate-700/50 rounded-2xl p-8">
                    <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
                    <div className="text-center">
                      <p className="text-slate-300 font-medium">Analyzing your image...</p>
                      <p className="text-slate-500 text-sm mt-1">AI is reading the visual context</p>
                    </div>
                  </div>
                )}
                {analyzeResult && !analyzing && (
                  <div className="space-y-4">
                    {/* Description */}
                    {analyzeResult.imageDescription && (
                      <div className="bg-[#0d1526] border border-slate-700/50 rounded-xl p-4">
                        <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-2">Image Analysis</p>
                        <p className="text-sm text-slate-300">{String(analyzeResult.imageDescription)}</p>
                      </div>
                    )}

                    {/* Best hook */}
                    {analyzeResult.bestHook && (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs text-amber-400 uppercase tracking-widest font-semibold mb-1">Best Opening Hook</p>
                          <p className="text-sm text-white font-medium">{String(analyzeResult.bestHook)}</p>
                        </div>
                        <button onClick={() => copy(String(analyzeResult!.bestHook), "hook")} className="text-slate-600 hover:text-amber-400 p-1 shrink-0">
                          {copiedKey === "hook" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    )}

                    {/* 3 Caption angles */}
                    {Array.isArray(analyzeResult.captions) && (analyzeResult.captions as Record<string, string>[]).map((cap, i) => (
                      <div key={i} className="bg-[#0d1526] border border-slate-700/50 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-600/20 text-blue-300 border border-blue-600/30 capitalize">
                              {cap.angle}
                            </span>
                          </div>
                          <button onClick={() => copy(cap.caption || "", `cap-${i}`)} className="text-slate-600 hover:text-blue-400 p-1">
                            {copiedKey === `cap-${i}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        {cap.hook && <p className="text-xs text-slate-400 italic mb-1.5">"{cap.hook}"</p>}
                        <p className="text-sm text-slate-200 whitespace-pre-line">{cap.caption}</p>
                      </div>
                    ))}

                    {/* Hashtags */}
                    {Array.isArray(analyzeResult.hashtags) && (analyzeResult.hashtags as string[]).length > 0 && (
                      <div className="bg-[#0d1526] border border-slate-700/50 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Hashtags</p>
                          <button onClick={() => copy((analyzeResult!.hashtags as string[]).map(h => `#${h}`).join(" "), "htags")} className="text-slate-600 hover:text-blue-400 p-1">
                            {copiedKey === "htags" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {(analyzeResult.hashtags as string[]).map((h, i) => (
                            <span key={i} className="text-xs px-2 py-1 rounded-full bg-blue-600/10 text-blue-300 border border-blue-600/20">#{h}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Platform tip */}
                    {analyzeResult.platformTip && (
                      <div className="flex gap-2 p-3 rounded-xl bg-purple-600/10 border border-purple-600/20">
                        <Sparkles className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-purple-300">{String(analyzeResult.platformTip)}</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
