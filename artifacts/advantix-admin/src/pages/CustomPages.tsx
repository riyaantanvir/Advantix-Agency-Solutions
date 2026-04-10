import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Plus, Globe, Lock, Image, FileText, Eye, EyeOff, Trash2, ExternalLink, Loader2, Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type CustomPage = {
  id: number;
  slug: string;
  title: string;
  type: "gallery" | "content";
  description: string | null;
  is_published: boolean;
  has_password: boolean;
  created_at: string;
};

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Request failed");
  return res.json();
}

export default function CustomPages() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);

  const { data: pages = [], isLoading } = useQuery<CustomPage[]>({
    queryKey: ["custom-pages"],
    queryFn: () => apiFetch("/api/admin/custom-pages"),
  });

  const togglePublish = useMutation({
    mutationFn: ({ id, isPublished }: { id: number; isPublished: boolean }) =>
      apiFetch(`/api/admin/custom-pages/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["custom-pages"] }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deletePage = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/custom-pages/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["custom-pages"] }); toast({ title: "Page deleted" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const filtered = pages.filter(
    (p) => p.title.toLowerCase().includes(search.toLowerCase()) || p.slug.includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Custom Pages</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Create gallery or content pages for your website</p>
        </div>
        <Link href="/custom-pages/new">
          <Button className="gap-2 rounded-xl">
            <Plus className="w-4 h-4" />
            New Page
          </Button>
        </Link>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pages..."
          className="pl-9 rounded-xl"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No pages yet</p>
          <p className="text-sm">Create your first custom page to get started</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((page) => (
            <motion.div
              key={page.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                page.type === "gallery" ? "bg-purple-500/10" : "bg-blue-500/10"
              }`}>
                {page.type === "gallery"
                  ? <Image className="w-5 h-5 text-purple-500" />
                  : <FileText className="w-5 h-5 text-blue-500" />
                }
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm truncate">{page.title}</p>
                  {page.has_password && <Lock className="w-3 h-3 text-muted-foreground shrink-0" />}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    page.is_published ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground"
                  }`}>
                    {page.is_published ? "Published" : "Draft"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  /{page.slug} · {page.type === "gallery" ? "Photo Gallery" : "Content Page"}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {page.is_published && (
                  <a
                    href={`/pages/${page.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg hover:bg-secondary/50 transition-colors text-muted-foreground hover:text-foreground"
                    title="View on website"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                <button
                  onClick={() => togglePublish.mutate({ id: page.id, isPublished: !page.is_published })}
                  className="p-2 rounded-lg hover:bg-secondary/50 transition-colors text-muted-foreground hover:text-foreground"
                  title={page.is_published ? "Unpublish" : "Publish"}
                >
                  {page.is_published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <Link href={`/custom-pages/${page.id}/edit`}>
                  <button className="px-3 py-1.5 text-xs font-medium bg-secondary/50 hover:bg-secondary rounded-lg transition-colors">
                    Edit
                  </button>
                </Link>
                <button
                  onClick={() => {
                    if (deleting === page.id) {
                      deletePage.mutate(page.id);
                      setDeleting(null);
                    } else {
                      setDeleting(page.id);
                      setTimeout(() => setDeleting(null), 3000);
                    }
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    deleting === page.id
                      ? "bg-red-500/10 text-red-500"
                      : "hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
                  }`}
                  title={deleting === page.id ? "Click again to confirm" : "Delete"}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
