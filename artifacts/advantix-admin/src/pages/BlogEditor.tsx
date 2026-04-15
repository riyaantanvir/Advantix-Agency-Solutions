import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Save, ArrowLeft, Eye, Globe, FileX, Loader2,
  Settings, ChevronDown, ChevronUp, Star, StarOff,
  Upload, X, ImagePlus, Link2, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import RichEditor from "@/components/editor/RichEditor";

type BlogPost = {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  coverImageUrl: string | null;
  author: string;
  category: string;
  tags: string | null;
  status: string;
  readingTime: string | null;
  featured: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type PostForm = {
  title: string;
  excerpt: string;
  content: string;
  coverImageUrl: string;
  author: string;
  category: string;
  tags: string;
  status: string;
  featured: boolean;
  seoTitle: string;
  seoDescription: string;
};

const CATEGORIES = [
  "General", "Technology", "Design", "Marketing", "Business",
  "Development", "SEO", "Social Media", "Case Study", "News",
];

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (res.status === 401) { window.dispatchEvent(new CustomEvent("admin-unauthorized")); return; }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Request failed");
  return res.json();
}

/* ── Cover Image Panel (inline popover) ─────────────────────────────────── */
function CoverImagePanel({
  onUpload, onUrl, onClose, uploading,
}: {
  onUpload: (file: File) => void;
  onUrl: (url: string) => void;
  onClose: () => void;
  uploading: boolean;
}) {
  const [tab, setTab] = useState<"upload" | "url">("upload");
  const [urlVal, setUrlVal] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="absolute top-10 left-0 z-30 bg-card border border-border rounded-xl shadow-2xl w-80">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex gap-1">
          {(["upload", "url"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              {t === "upload" ? "Upload" : "Image URL"}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground p-0.5 rounded">
          <X size={14} />
        </button>
      </div>

      <div className="p-3">
        {tab === "upload" ? (
          <>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-border rounded-lg p-5 text-center cursor-pointer hover:border-primary/50 hover:bg-secondary/30 transition-colors"
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                  <Loader2 size={20} className="animate-spin text-primary" />
                  <span className="text-xs">Uploading…</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                  <Upload size={20} className="text-muted-foreground/60" />
                  <p className="text-xs font-medium text-foreground/70">Click to choose a file</p>
                  <p className="text-[10px] text-muted-foreground/60">PNG, JPG, WebP, GIF</p>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) { onUpload(f); onClose(); }
                e.target.value = "";
              }}
            />
          </>
        ) : (
          <div className="space-y-2">
            <input
              autoFocus
              type="url"
              value={urlVal}
              onChange={(e) => setUrlVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && urlVal.trim()) { onUrl(urlVal.trim()); onClose(); }
              }}
              placeholder="https://example.com/image.jpg"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="button"
              disabled={!urlVal.trim()}
              onClick={() => { if (urlVal.trim()) { onUrl(urlVal.trim()); onClose(); } }}
              className="w-full py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 font-medium"
            >
              Set as Cover
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BlogEditor() {
  const [, navigate] = useLocation();
  const [matchEdit, paramsEdit] = useRoute("/blog/:id/edit");
  const isEdit = matchEdit;
  const postId = isEdit ? parseInt(paramsEdit?.id ?? "0", 10) : null;

  const { toast } = useToast();
  const qc = useQueryClient();
  const [showSeo, setShowSeo] = useState(false);
  const [saved, setSaved] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [showCoverPanel, setShowCoverPanel] = useState(false);
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const coverPanelRef = useRef<HTMLDivElement>(null);

  const uploadCoverFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please select an image file", variant: "destructive" });
      return;
    }
    setCoverUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/admin/blog/upload-image", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      update("coverImageUrl", url);
    } catch {
      toast({ title: "Image upload failed", variant: "destructive" });
    } finally {
      setCoverUploading(false);
    }
  }, [toast]);

  const [form, setForm] = useState<PostForm>({
    title: "",
    excerpt: "",
    content: "",
    coverImageUrl: "",
    author: "Advantix Team",
    category: "General",
    tags: "",
    status: "draft",
    featured: false,
    seoTitle: "",
    seoDescription: "",
  });

  const { data: existing, isLoading: loadingExisting } = useQuery<BlogPost>({
    queryKey: ["admin-blog-post", postId],
    queryFn: () => apiFetch(`/api/admin/blog/${postId}`),
    enabled: !!postId,
  });

  useEffect(() => {
    if (existing) {
      setForm({
        title: existing.title,
        excerpt: existing.excerpt ?? "",
        content: existing.content,
        coverImageUrl: existing.coverImageUrl ?? "",
        author: existing.author,
        category: existing.category,
        tags: existing.tags ?? "",
        status: existing.status,
        featured: existing.featured,
        seoTitle: existing.seoTitle ?? "",
        seoDescription: existing.seoDescription ?? "",
      });
    }
  }, [existing]);

  const createMutation = useMutation({
    mutationFn: (data: PostForm) =>
      apiFetch("/api/admin/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: (newPost: BlogPost) => {
      qc.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      toast({ title: form.status === "published" ? "Post published!" : "Draft saved!" });
      setSaved(true);
      navigate(`/blog/${newPost.id}/edit`);
    },
    onError: () => toast({ title: "Failed to save post", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: PostForm) =>
      apiFetch(`/api/admin/blog/${postId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      qc.invalidateQueries({ queryKey: ["admin-blog-post", postId] });
      toast({ title: form.status === "published" ? "Post published!" : "Changes saved!" });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: () => toast({ title: "Failed to save post", variant: "destructive" }),
  });

  function update<K extends keyof PostForm>(key: K, value: PostForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function handleSave(status?: string) {
    const payload = { ...form, status: status ?? form.status };
    if (!payload.title.trim()) { toast({ title: "Title is required", variant: "destructive" }); return; }
    if (isEdit && postId) updateMutation.mutate(payload);
    else createMutation.mutate(payload);
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isEdit && loadingExisting) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground gap-3">
        <Loader2 size={20} className="animate-spin" /> Loading post...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Link href="/blog">
            <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors">
              <ArrowLeft size={18} />
            </button>
          </Link>
          <div>
            <h1 className="font-semibold text-foreground text-sm">{isEdit ? "Edit Post" : "New Post"}</h1>
            {existing?.status && (
              <span className={`text-xs capitalize ${existing.status === "published" ? "text-green-400" : "text-amber-400"}`}>
                {existing.status}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {form.status === "published" && existing?.slug && (
            <a href={`/blog/${existing.slug}`} target="_blank" rel="noopener noreferrer" className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors" title="Preview">
              <Eye size={17} />
            </a>
          )}
          {saved && <span className="text-xs text-green-400 flex items-center gap-1"><Check size={12} /> Saved</span>}
          {form.status !== "published" ? (
            <>
              <Button variant="outline" size="sm" onClick={() => handleSave("draft")} disabled={isPending} className="gap-2">
                {isPending && form.status === "draft" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save Draft
              </Button>
              <Button size="sm" onClick={() => handleSave("published")} disabled={isPending} className="gap-2">
                {isPending && form.status === "published" ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
                Publish
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => handleSave("draft")} disabled={isPending} className="gap-2 text-amber-400 border-amber-500/30 hover:bg-amber-500/10">
                <FileX size={14} /> Unpublish
              </Button>
              <Button size="sm" onClick={() => handleSave("published")} disabled={isPending} className="gap-2">
                {isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Update
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto">

        {/* ── Cover Image Hero ─────────────────────────────────────────── */}
        {form.coverImageUrl ? (
          /* Image set → full-width hero */
          <div className="relative w-full h-64 group overflow-hidden bg-secondary">
            <img
              src={form.coverImageUrl}
              alt="Cover"
              className="w-full h-full object-cover"
            />
            {/* Gradient overlay + controls on hover */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-6 py-4 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-200">
              <span className="text-white/80 text-xs font-medium">Cover image</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => coverFileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition-colors backdrop-blur-sm border border-white/20"
                >
                  <Upload size={12} /> Replace
                </button>
                <button
                  type="button"
                  onClick={() => update("coverImageUrl", "")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/60 hover:bg-red-500/80 text-white text-xs font-medium transition-colors backdrop-blur-sm"
                >
                  <X size={12} /> Remove
                </button>
              </div>
            </div>
            <input
              ref={coverFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadCoverFile(f);
                e.target.value = "";
              }}
            />
          </div>
        ) : (
          /* No image → compact button bar */
          <div className="w-full border-b border-border/50 bg-secondary/10 px-6 py-2.5 flex items-center gap-3">
            <div className="relative" ref={coverPanelRef}>
              <button
                type="button"
                onClick={() => setShowCoverPanel((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {coverUploading ? (
                  <Loader2 size={14} className="animate-spin text-primary" />
                ) : (
                  <ImagePlus size={14} />
                )}
                {coverUploading ? "Uploading…" : "Add cover image"}
              </button>

              {showCoverPanel && (
                <CoverImagePanel
                  uploading={coverUploading}
                  onUpload={(f) => { uploadCoverFile(f); }}
                  onUrl={(url) => update("coverImageUrl", url)}
                  onClose={() => setShowCoverPanel(false)}
                />
              )}
            </div>
          </div>
        )}

        <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
          {/* Title */}
          <div>
            <input
              type="text"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="Post title..."
              className="w-full text-3xl font-bold bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/40 resize-none"
            />
          </div>

          {/* Excerpt */}
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium block mb-1.5">Excerpt (shown on blog listing)</label>
            <textarea
              value={form.excerpt}
              onChange={(e) => update("excerpt", e.target.value)}
              placeholder="A short description of this post..."
              rows={2}
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
          </div>

          {/* Content editor */}
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium block mb-1.5">Content</label>
            <RichEditor
              content={form.content}
              onChange={(html) => update("content", html)}
            />
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium block mb-1.5">Category</label>
              <select
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium block mb-1.5">Author</label>
              <Input value={form.author} onChange={(e) => update("author", e.target.value)} placeholder="Author name" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium block mb-1.5">Tags (comma-separated)</label>
              <Input value={form.tags} onChange={(e) => update("tags", e.target.value)} placeholder="e.g. design, branding, tips" />
            </div>
          </div>

          {/* Featured toggle */}
          <div>
            <button
              type="button"
              onClick={() => update("featured", !form.featured)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                form.featured
                  ? "bg-yellow-500/15 border-yellow-500/30 text-yellow-400"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              {form.featured ? <Star size={14} fill="currentColor" /> : <StarOff size={14} />}
              {form.featured ? "Featured Post" : "Mark as Featured"}
            </button>
          </div>

          {/* SEO section */}
          <div className="border border-border rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowSeo(!showSeo)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors"
            >
              <div className="flex items-center gap-2"><Settings size={15} /> SEO Settings</div>
              {showSeo ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            {showSeo && (
              <div className="px-4 pb-4 pt-2 space-y-3 border-t border-border bg-secondary/10">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">SEO Title (leave blank to use post title)</label>
                  <Input value={form.seoTitle} onChange={(e) => update("seoTitle", e.target.value)} placeholder="Custom SEO title..." />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">SEO Description (leave blank to use excerpt)</label>
                  <textarea
                    value={form.seoDescription}
                    onChange={(e) => update("seoDescription", e.target.value)}
                    placeholder="Custom SEO description..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                  />
                </div>
                {existing?.slug && (
                  <p className="text-xs text-muted-foreground">
                    URL: <code className="bg-secondary px-1.5 py-0.5 rounded text-primary/80">/blog/{existing.slug}</code>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Bottom actions */}
          <div className="flex gap-3 pb-8">
            {form.status !== "published" ? (
              <>
                <Button variant="outline" onClick={() => handleSave("draft")} disabled={isPending} className="gap-2">
                  {isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save Draft
                </Button>
                <Button onClick={() => handleSave("published")} disabled={isPending} className="gap-2">
                  {isPending ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
                  Publish Post
                </Button>
              </>
            ) : (
              <Button onClick={() => handleSave("published")} disabled={isPending} className="gap-2">
                {isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save Changes
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
