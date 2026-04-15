import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, Pencil, Trash2, Eye, FileText, Star, StarOff,
  Globe, FileX, Loader2, Tag, Calendar, Clock, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { BlogImportExport } from "@/components/BlogImportExport";

type BlogPost = {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  author: string;
  category: string;
  tags: string | null;
  status: string;
  readingTime: string | null;
  featured: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (res.status === 401) { window.dispatchEvent(new CustomEvent("admin-unauthorized")); return; }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Request failed");
  return res.json();
}

const STATUS_STYLES: Record<string, string> = {
  published: "bg-green-500/15 text-green-400 border-green-500/30",
  draft: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

async function exportSinglePost(post: BlogPost, toast: ReturnType<typeof useToast>["toast"]) {
  try {
    const full = await apiFetch(`/api/admin/blog/${post.id}`);
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      posts: [full],
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${post.slug || `post-${post.id}`}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Post exported", description: `${post.title} saved as JSON` });
  } catch {
    toast({ title: "Export failed", variant: "destructive" });
  }
}

export default function Blog() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [exportingId, setExportingId] = useState<number | null>(null);

  const { data: posts = [], isLoading } = useQuery<BlogPost[]>({
    queryKey: ["admin-blog-posts"],
    queryFn: () => apiFetch("/api/admin/blog"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/blog/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      toast({ title: "Post deleted" });
      setDeletingId(null);
    },
    onError: () => toast({ title: "Failed to delete post", variant: "destructive" }),
  });

  const toggleFeatured = useMutation({
    mutationFn: ({ id, post }: { id: number; post: BlogPost }) =>
      apiFetch(`/api/admin/blog/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...post, featured: !post.featured }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-blog-posts"] }),
    onError: () => toast({ title: "Failed to update post", variant: "destructive" }),
  });

  const filtered = posts.filter((p) => {
    const matchSearch = !search || p.title.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: posts.length,
    published: posts.filter((p) => p.status === "published").length,
    draft: posts.filter((p) => p.status === "draft").length,
    featured: posts.filter((p) => p.featured).length,
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Blog</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Create and manage blog posts</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <BlogImportExport />
          <Link href="/blog/new">
            <Button className="gap-2">
              <Plus size={16} /> New Post
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Posts", value: stats.total, icon: FileText, color: "text-blue-400" },
          { label: "Published", value: stats.published, icon: Globe, color: "text-green-400" },
          { label: "Drafts", value: stats.draft, icon: FileX, color: "text-amber-400" },
          { label: "Featured", value: stats.featured, icon: Star, color: "text-yellow-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <Icon size={20} className={color} />
            <div>
              <p className="text-xl font-bold text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search posts..."
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {["all", "published", "draft"].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-2 text-sm rounded-lg border capitalize font-medium transition-colors ${
                filterStatus === s
                  ? "bg-primary/10 border-primary/40 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Posts Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-3">
          <Loader2 size={20} className="animate-spin" /> Loading posts...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <FileText size={40} className="mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground font-medium">No posts found</p>
          <p className="text-muted-foreground/60 text-sm mt-1">
            {posts.length === 0 ? "Create your first blog post to get started." : "Try adjusting your search or filter."}
          </p>
          {posts.length === 0 && (
            <Link href="/blog/new">
              <Button className="mt-4 gap-2"><Plus size={14} /> Write First Post</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 uppercase tracking-wide">Post</th>
                  <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 uppercase tracking-wide hidden sm:table-cell">Category</th>
                  <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 uppercase tracking-wide">Status</th>
                  <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 uppercase tracking-wide hidden md:table-cell">Date</th>
                  <th className="text-right text-xs text-muted-foreground font-medium px-4 py-3 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {filtered.map((post) => (
                    <motion.tr
                      key={post.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="border-b border-border/50 hover:bg-secondary/20 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          {post.coverImageUrl ? (
                            <img src={post.coverImageUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 hidden sm:block" loading="lazy" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 hidden sm:block">
                              <FileText size={16} className="text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-foreground text-sm truncate max-w-xs">{post.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {post.readingTime && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock size={10} /> {post.readingTime}
                                </span>
                              )}
                              {post.featured && <span className="text-xs text-yellow-500 flex items-center gap-0.5"><Star size={10} fill="currentColor" /> Featured</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Tag size={11} /> {post.category}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${STATUS_STYLES[post.status] ?? "bg-secondary text-muted-foreground border-border"}`}>
                          {post.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar size={11} /> {formatDate(post.publishedAt ?? post.createdAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {post.status === "published" && (
                            <a href={`/blog/${post.slug}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="View post">
                              <Eye size={15} />
                            </a>
                          )}
                          <button
                            onClick={() => toggleFeatured.mutate({ id: post.id, post })}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-yellow-400 hover:bg-secondary transition-colors"
                            title={post.featured ? "Unfeature" : "Feature"}
                          >
                            {post.featured ? <Star size={15} fill="currentColor" className="text-yellow-400" /> : <StarOff size={15} />}
                          </button>
                          <Link href={`/blog/${post.id}/edit`}>
                            <button className="p-1.5 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-secondary transition-colors" title="Edit">
                              <Pencil size={15} />
                            </button>
                          </Link>
                          <button
                            onClick={async () => {
                              setExportingId(post.id);
                              await exportSinglePost(post, toast);
                              setExportingId(null);
                            }}
                            disabled={exportingId === post.id}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-emerald-400 hover:bg-secondary transition-colors disabled:opacity-40"
                            title="Export as JSON"
                          >
                            {exportingId === post.id
                              ? <Loader2 size={15} className="animate-spin" />
                              : <Download size={15} />}
                          </button>
                          {deletingId === post.id ? (
                            <div className="flex items-center gap-1 ml-1">
                              <button onClick={() => setDeletingId(null)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border">Cancel</button>
                              <button
                                onClick={() => deleteMutation.mutate(post.id)}
                                disabled={deleteMutation.isPending}
                                className="text-xs text-white bg-destructive hover:bg-destructive/90 px-2 py-1 rounded"
                              >
                                {deleteMutation.isPending ? "..." : "Delete"}
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setDeletingId(post.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors" title="Delete">
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
