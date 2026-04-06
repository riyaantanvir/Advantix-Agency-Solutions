import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Save, ArrowLeft, Eye, Globe, FileX, Loader2,
  Settings, ChevronDown, ChevronUp, Star, StarOff,
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
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Request failed");
  return res.json();
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
          {saved && <span className="text-xs text-green-400">Saved ✓</span>}
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
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none placeholder:text-muted-foreground/40"
            />
          </div>

          {/* Rich text editor */}
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium block mb-2">Content</label>
            <RichEditor
              content={form.content}
              onChange={(html) => update("content", html)}
              placeholder="Start writing your blog post..."
              minHeight={500}
            />
          </div>

          {/* Sidebar meta */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cover image */}
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium block mb-1.5">Cover Image URL</label>
              <Input value={form.coverImageUrl} onChange={(e) => update("coverImageUrl", e.target.value)} placeholder="https://..." />
              {form.coverImageUrl && (
                <img src={form.coverImageUrl} alt="Cover preview" className="mt-2 rounded-xl w-full aspect-[2/1] object-cover" loading="lazy" />
              )}
            </div>

            {/* Category + Author */}
            <div className="space-y-3">
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
              <label className="flex items-center gap-2 cursor-pointer">
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
              </label>
            </div>
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
