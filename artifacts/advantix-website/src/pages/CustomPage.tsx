import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "wouter";
import { Helmet } from "react-helmet-async";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, ChevronLeft, ChevronRight, X, FolderOpen, Eye } from "lucide-react";

/* ── Ultra-fast lazy image with skeleton placeholder ─────────────────────── */
function LazyImage({
  src, alt, className, priority = false, onClick,
}: {
  src: string; alt: string; className?: string; priority?: boolean; onClick?: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // If already cached/loaded by browser, mark as loaded immediately
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
    }
  }, []);

  return (
    <div className={`relative overflow-hidden bg-muted/40 ${className ?? ""}`} onClick={onClick}>
      {/* Shimmer skeleton */}
      {!loaded && !error && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]"
          style={{ animation: "shimmer 1.5s infinite linear", backgroundSize: "200% 100%" }}
        />
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "low"}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={`w-full h-full object-cover transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/30">
          <Eye className="w-6 h-6" />
        </div>
      )}
    </div>
  );
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type GalleryImage = { id: number; url: string; caption: string | null };
type GalleryFolder = { id: number; name: string; description: string | null; cover_image_url: string | null; images: GalleryImage[] };
type CustomPageData = {
  id: number; slug: string; title: string; type: "gallery" | "content";
  description: string | null; content: string | null; is_published: boolean;
  meta_title: string | null; meta_description: string | null;
  requiresPassword?: boolean; folders?: GalleryFolder[];
};

export default function CustomPage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<CustomPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<GalleryFolder | null>(null);
  const [lightbox, setLightbox] = useState<{ images: GalleryImage[]; index: number } | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/pages/${slug}`, { credentials: "include" })
      .then(r => r.json())
      .then((data: CustomPageData) => {
        if (data.requiresPassword) {
          setRequiresPassword(true);
        } else {
          setPage(data);
          if (data.folders?.length) setSelectedFolder(data.folders[0]);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  const submitPassword = async () => {
    setPwLoading(true);
    setPwError("");
    try {
      const res = await fetch(`${BASE}/api/pages/${slug}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        credentials: "include",
      });
      if (!res.ok) { setPwError("Incorrect password"); return; }
      const data: CustomPageData = await res.json();
      setPage(data);
      setRequiresPassword(false);
      if (data.folders?.length) setSelectedFolder(data.folders[0]);
    } catch {
      setPwError("Something went wrong");
    } finally {
      setPwLoading(false);
    }
  };

  const navigate = useCallback((dir: 1 | -1) => {
    setLightbox(prev => {
      if (!prev) return null;
      const next = prev.index + dir;
      if (next < 0 || next >= prev.images.length) return prev;
      return { ...prev, index: next };
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!lightbox) return;
      if (e.key === "ArrowRight") navigate(1);
      if (e.key === "ArrowLeft") navigate(-1);
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightbox, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-4">
        <p className="text-6xl font-bold text-muted-foreground/30 mb-4">404</p>
        <p className="text-xl font-semibold mb-2">Page not found</p>
        <p className="text-muted-foreground">This page doesn't exist or has been removed.</p>
      </div>
    );
  }

  if (requiresPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-card border border-border rounded-2xl p-8 w-full max-w-sm space-y-5 shadow-lg">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Lock className="w-7 h-7 text-primary" />
            </div>
            <div>
              <p className="font-bold text-xl">Password Protected</p>
              <p className="text-muted-foreground text-sm mt-1">Enter the password to view this page</p>
            </div>
          </div>
          <div className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitPassword()}
              placeholder="Enter password"
              className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {pwError && <p className="text-red-500 text-xs">{pwError}</p>}
            <button
              onClick={submitPassword}
              disabled={pwLoading || !password}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {pwLoading ? "Checking..." : "View Page"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!page) return null;

  return (
    <>
      <Helmet>
        <title>{page.meta_title ?? page.title}</title>
        {page.meta_description && <meta name="description" content={page.meta_description} />}
      </Helmet>

      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Page header */}
        <div className="mb-10 text-center">
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-4xl font-bold mb-3">
            {page.title}
          </motion.h1>
          {page.description && (
            <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-muted-foreground text-lg max-w-2xl mx-auto">
              {page.description}
            </motion.p>
          )}
        </div>

        {page.type === "content" ? (
          /* Content page */
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="prose prose-invert max-w-4xl mx-auto"
            dangerouslySetInnerHTML={{ __html: page.content ?? "" }}
          />
        ) : (
          /* Gallery page */
          <div className="space-y-8">
            {/* Folder tabs */}
            {(page.folders ?? []).length > 1 && (
              <div className="flex gap-3 flex-wrap justify-center">
                {(page.folders ?? []).map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => setSelectedFolder(folder)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      selectedFolder?.id === folder.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border border-border hover:border-primary/50"
                    }`}
                  >
                    {folder.cover_image_url ? (
                      <img src={folder.cover_image_url} alt="" loading="lazy" decoding="async" className="w-5 h-5 rounded object-cover" />
                    ) : (
                      <FolderOpen className="w-4 h-4" />
                    )}
                    {folder.name}
                    <span className="opacity-60 text-xs">({folder.images.length})</span>
                  </button>
                ))}
              </div>
            )}

            {/* Folder info */}
            {selectedFolder && (
              <AnimatePresence mode="wait">
                <motion.div key={selectedFolder.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  {selectedFolder.description && (
                    <p className="text-muted-foreground text-center mb-6">{selectedFolder.description}</p>
                  )}

                  {selectedFolder.images.length === 0 ? (
                    <div className="text-center py-20 text-muted-foreground">
                      <Eye className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p>No images in this folder yet</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {selectedFolder.images.map((img, idx) => (
                        <div
                          key={img.id}
                          className="group relative aspect-square rounded-xl overflow-hidden cursor-pointer"
                          onClick={() => setLightbox({ images: selectedFolder.images, index: idx })}
                        >
                          <LazyImage
                            src={img.url}
                            alt={img.caption ?? ""}
                            priority={idx < 8}
                            className="aspect-square rounded-xl group-hover:scale-105 transition-transform duration-300"
                          />
                          {img.caption && (
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-end pointer-events-none">
                              <p className="text-white text-xs font-medium px-2 py-1.5 truncate w-full bg-gradient-to-t from-black/60">
                                {img.caption}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center"
            onClick={() => setLightbox(null)}
          >
            <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 p-2 text-white/70 hover:text-white z-10">
              <X className="w-6 h-6" />
            </button>

            {lightbox.index > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); navigate(-1); }}
                className="absolute left-4 p-3 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors z-10"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            <motion.img
              key={lightbox.index}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              src={lightbox.images[lightbox.index].url}
              alt={lightbox.images[lightbox.index].caption ?? ""}
              className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl"
              onClick={(e) => e.stopPropagation()}
            />

            {lightbox.index < lightbox.images.length - 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); navigate(1); }}
                className="absolute right-4 p-3 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors z-10"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}

            <div className="absolute bottom-4 text-center">
              {lightbox.images[lightbox.index].caption && (
                <p className="text-white/80 text-sm mb-1">{lightbox.images[lightbox.index].caption}</p>
              )}
              <p className="text-white/50 text-xs">{lightbox.index + 1} / {lightbox.images.length}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
