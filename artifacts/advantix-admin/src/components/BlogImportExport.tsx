import { useRef, useState } from "react";
import {
  Download, Upload, FileJson, X, Check, AlertTriangle,
  Loader2, FileText, Star, Globe, FileX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface ImportPost {
  title?: string;
  slug?: string;
  excerpt?: string;
  content?: string;
  coverImageUrl?: string;
  coverImageData?: string;
  coverImageMime?: string;
  author?: string;
  category?: string;
  tags?: string;
  status?: string;
  featured?: boolean;
  seoTitle?: string;
  seoDescription?: string;
  publishedAt?: string;
}

interface ImportResult {
  title: string;
  slug: string;
  action: "created" | "skipped";
  reason?: string;
}

type Stage = "idle" | "preview" | "importing" | "done" | "error";

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res;
}

export function BlogImportExport() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [posts, setPosts] = useState<ImportPost[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [exporting, setExporting] = useState(false);

  /* ─── Export ─────────────────────────────────────────────── */
  async function handleExport() {
    setExporting(true);
    try {
      const res = await apiFetch("/api/admin/blog/export");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const d = new Date().toISOString().slice(0, 10);
      a.download = `blog-export-${d}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export downloaded", description: "All posts exported to JSON." });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  }

  /* ─── Import file picker ─────────────────────────────────── */
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const parsed = JSON.parse(text);
        const arr: ImportPost[] = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed.posts)
          ? parsed.posts
          : [];

        if (arr.length === 0) throw new Error("No posts found in the JSON file.");

        setPosts(arr);
        setStage("preview");
        setErrorMsg("");
        setResults([]);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Could not parse JSON file.");
        setStage("error");
      }
    };
    reader.readAsText(file);
  }

  /* ─── Confirm import ─────────────────────────────────────── */
  async function confirmImport() {
    setStage("importing");
    try {
      const res = await apiFetch("/api/admin/blog/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posts }),
      });
      const data = await res.json();
      setResults(data.results ?? []);
      setStage("done");
      qc.invalidateQueries({ queryKey: ["admin-blog-posts"] });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Import failed.");
      setStage("error");
    }
  }

  function reset() {
    setStage("idle");
    setPosts([]);
    setResults([]);
    setErrorMsg("");
  }

  const created = results.filter((r) => r.action === "created").length;
  const skipped = results.filter((r) => r.action === "skipped").length;

  /* ─── Render ─────────────────────────────────────────────── */
  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 font-semibold"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Export JSON
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 font-semibold"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="w-4 h-4" />
          Import JSON
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      {/* ── Dialog ── */}
      <Dialog
        open={stage !== "idle"}
        onOpenChange={(o) => { if (!o && stage !== "importing") reset(); }}
      >
        <DialogContent className="sm:max-w-2xl bg-card border-border/50 max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              {stage === "error" ? (
                <><AlertTriangle className="w-5 h-5 text-destructive" /> Import Error</>
              ) : stage === "done" ? (
                <><Check className="w-5 h-5 text-green-500" /> Import Complete</>
              ) : stage === "importing" ? (
                <><Loader2 className="w-5 h-5 animate-spin text-primary" /> Importing Posts…</>
              ) : (
                <><Upload className="w-5 h-5 text-primary" /> Import Preview — {posts.length} Post{posts.length !== 1 ? "s" : ""}</>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-auto mt-2 space-y-3">

            {/* Error */}
            {stage === "error" && (
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive">
                <p className="font-semibold mb-1">Could not import</p>
                <p>{errorMsg}</p>
                <p className="mt-2 text-muted-foreground text-xs">
                  Make sure your file is a valid JSON exported from this system.
                </p>
              </div>
            )}

            {/* Done */}
            {stage === "done" && (
              <>
                <div className="flex items-center gap-4 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                  <Check className="w-8 h-8 text-green-400 shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">
                      {created} post{created !== 1 ? "s" : ""} created
                      {skipped > 0 && `, ${skipped} skipped`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      The blog list has been updated automatically.
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border border-border/50 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-secondary/50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Title</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Slug</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r, i) => (
                        <tr key={i} className="border-t border-border/30">
                          <td className="px-3 py-2 max-w-[200px] truncate">{r.title}</td>
                          <td className="px-3 py-2 text-muted-foreground font-mono">{r.slug || "—"}</td>
                          <td className="px-3 py-2">
                            {r.action === "created" ? (
                              <span className="inline-flex items-center gap-1 text-green-400"><Check size={11} /> Created</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-400" title={r.reason}><AlertTriangle size={11} /> Skipped</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Importing */}
            {stage === "importing" && (
              <div className="flex flex-col items-center justify-center py-10 gap-4">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <p className="text-muted-foreground text-sm">
                  Creating {posts.length} post{posts.length !== 1 ? "s" : ""}…
                </p>
                <p className="text-xs text-muted-foreground/60">
                  Uploading cover images and inserting records.
                </p>
              </div>
            )}

            {/* Preview */}
            {stage === "preview" && (
              <>
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{posts.length} post{posts.length !== 1 ? "s" : ""}</span> found.
                  Review before importing — duplicates will get a new slug automatically.
                </p>

                <div className="rounded-xl border border-border/50 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-secondary/50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Cover</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Title</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Status</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Category</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">SEO</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Tags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {posts.slice(0, 20).map((p, i) => {
                        const coverSrc = p.coverImageData && p.coverImageMime
                          ? `data:${p.coverImageMime};base64,${p.coverImageData}`
                          : p.coverImageUrl ?? null;
                        return (
                          <tr key={i} className="border-t border-border/30 hover:bg-secondary/20">
                            <td className="px-3 py-2">
                              {coverSrc ? (
                                <img src={coverSrc} alt="" className="w-10 h-7 rounded object-cover" />
                              ) : (
                                <div className="w-10 h-7 rounded bg-secondary flex items-center justify-center">
                                  <FileText size={11} className="text-muted-foreground" />
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 max-w-[180px]">
                              <p className="font-medium text-foreground truncate">{p.title ?? "—"}</p>
                              {p.featured && <span className="inline-flex items-center gap-0.5 text-yellow-400 text-[10px]"><Star size={9} fill="currentColor" /> Featured</span>}
                            </td>
                            <td className="px-3 py-2">
                              {p.status === "published" ? (
                                <span className="inline-flex items-center gap-1 text-green-400"><Globe size={10} /> Published</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-amber-400"><FileX size={10} /> Draft</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground truncate max-w-[90px]">{p.category ?? "—"}</td>
                            <td className="px-3 py-2">
                              {p.seoTitle ? (
                                <span className="text-green-400 text-[10px]">✓ set</span>
                              ) : (
                                <span className="text-muted-foreground/50 text-[10px]">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground truncate max-w-[100px] text-[10px]">{p.tags ?? "—"}</td>
                          </tr>
                        );
                      })}
                      {posts.length > 20 && (
                        <tr className="border-t border-border/30">
                          <td colSpan={6} className="px-3 py-2 text-center text-muted-foreground italic">
                            …and {posts.length - 20} more posts
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <p className="text-xs text-muted-foreground">
                  Cover images embedded in the export will be re-uploaded to this server automatically.
                </p>
              </>
            )}
          </div>

          <DialogFooter className="pt-4 border-t border-border/50 shrink-0">
            {stage === "done" ? (
              <Button onClick={reset}>Done</Button>
            ) : stage === "error" ? (
              <Button variant="outline" onClick={reset}><X className="w-4 h-4 mr-2" />Close</Button>
            ) : stage === "preview" ? (
              <>
                <Button variant="outline" onClick={reset}>Cancel</Button>
                <Button onClick={confirmImport} className="bg-primary text-primary-foreground">
                  <Upload className="w-4 h-4 mr-2" />
                  Import {posts.length} Post{posts.length !== 1 ? "s" : ""}
                </Button>
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
