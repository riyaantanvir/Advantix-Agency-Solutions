import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "wouter";
import { Helmet } from "react-helmet-async";
import { AnimatePresence, motion } from "framer-motion";
import {
  Lock, ChevronLeft, ChevronRight, X, Eye, Heart,
  UserCircle2, ZoomIn, ZoomOut, Images, ArrowLeft,
} from "lucide-react";
import { useToolsUser } from "@/context/ToolsUserContext";
import { LoginForm } from "@/components/LoginForm";
import type { ToolUser } from "@/lib/toolsApi";

/* ── Fast lazy image — static skeleton, 200ms fade ───────────────────────── */
function LazyImage({
  src, alt, className, priority = false, onClick,
}: {
  src: string; alt: string; className?: string; priority?: boolean; onClick?: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) setLoaded(true);
  }, [src]);

  return (
    <div className={`relative overflow-hidden bg-muted/30 ${className ?? ""}`} onClick={onClick}>
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        onLoad={() => setLoaded(true)}
        onError={() => { setError(false); setLoaded(true); setError(true); }}
        style={{ transition: "opacity 0.2s ease" }}
        className={`w-full h-full object-cover ${loaded ? "opacity-100" : "opacity-0"}`}
      />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/20">
          <Eye className="w-5 h-5" />
        </div>
      )}
    </div>
  );
}

/* ── Lightbox with smooth wheel/pinch zoom + drag pan ────────────────────── */
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.35;

function Lightbox({
  images, index, onClose, onNavigate, user, favoritedIds, onToggleFavorite,
}: {
  images: GalleryImage[];
  index: number;
  onClose: () => void;
  onNavigate: (dir: 1 | -1) => void;
  user: ToolUser | null;
  favoritedIds: Set<number>;
  onToggleFavorite: (e: React.MouseEvent, id: number) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const imgContainerRef = useRef<HTMLDivElement>(null);

  const current = images[index];
  const isFav = favoritedIds.has(current.id);

  // Reset zoom & pan when navigating
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [index]);

  // Preload adjacent images
  useEffect(() => {
    [index - 1, index + 1].forEach(i => {
      if (i >= 0 && i < images.length) {
        const img = new Image();
        img.src = images[i].url;
      }
    });
  }, [images, index]);

  const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

  const changeZoom = (delta: number) => {
    setZoom(prev => {
      const next = clampZoom(prev + delta);
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    changeZoom(delta);
  };

  // Double-click toggle zoom
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoom(prev => {
      const next = prev > 1 ? 1 : 2;
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  // Mouse drag pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    dragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setPan(prev => ({ x: prev.x + dx / zoom, y: prev.y + dy / zoom }));
  };
  const handleMouseUp = () => { dragging.current = false; };

  // Touch pinch-zoom
  const lastPinchDist = useRef<number | null>(null);
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastPinchDist.current !== null) {
        const delta = (dist - lastPinchDist.current) * 0.01;
        changeZoom(delta);
      }
      lastPinchDist.current = dist;
    }
  };
  const handleTouchEnd = () => { lastPinchDist.current = null; };

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") { if (zoom === 1) onNavigate(1); }
      if (e.key === "ArrowLeft") { if (zoom === 1) onNavigate(-1); }
      if (e.key === "+" || e.key === "=") changeZoom(ZOOM_STEP);
      if (e.key === "-") changeZoom(-ZOOM_STEP);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, onNavigate, zoom]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 bg-black/96 z-50 flex items-center justify-center select-none"
      onClick={() => { if (zoom === 1) onClose(); }}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-white/60 hover:text-white transition-colors z-20"
      >
        <X className="w-5 h-5" />
      </button>


      {/* Zoom controls */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1.5 z-20">
        <button
          onClick={(e) => { e.stopPropagation(); changeZoom(-ZOOM_STEP); }}
          disabled={zoom <= ZOOM_MIN}
          className="p-1 text-white/60 hover:text-white disabled:opacity-30 transition-colors"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="text-white/50 text-xs w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button
          onClick={(e) => { e.stopPropagation(); changeZoom(ZOOM_STEP); }}
          disabled={zoom >= ZOOM_MAX}
          className="p-1 text-white/60 hover:text-white disabled:opacity-30 transition-colors"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Prev */}
      {index > 0 && zoom === 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(-1); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-2.5 text-white/60 hover:text-white bg-white/8 hover:bg-white/15 rounded-full transition-all z-20"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}

      {/* Next */}
      {index < images.length - 1 && zoom === 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(1); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 text-white/60 hover:text-white bg-white/8 hover:bg-white/15 rounded-full transition-all z-20"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}

      {/* Image container */}
      <div
        ref={imgContainerRef}
        className="relative flex items-center justify-center w-full h-full overflow-hidden"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ cursor: zoom > 1 ? (dragging.current ? "grabbing" : "grab") : "default" }}
        onClick={(e) => e.stopPropagation()}
      >
        <motion.img
          key={index}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          src={current.url}
          alt={current.caption ?? ""}
          onDoubleClick={handleDoubleClick}
          draggable={false}
          style={{
            transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
            transition: dragging.current ? "none" : "transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            transformOrigin: "center center",
            maxWidth: "90vw",
            maxHeight: "85vh",
            objectFit: "contain",
            borderRadius: "10px",
            userSelect: "none",
          }}
        />
      </div>

      {/* Caption + counter + favorite */}
      <div className="absolute bottom-4 inset-x-0 flex flex-col items-center gap-2 pointer-events-none">
        <div className="flex items-center gap-3">
          {/* Heart button — always visible in lightbox */}
          {user && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(e, current.id); }}
              className={`pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-sm text-sm font-medium transition-all
                ${isFav
                  ? "bg-red-500 text-white shadow-lg shadow-red-500/30"
                  : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"}`}
            >
              <Heart className={`w-4 h-4 transition-all ${isFav ? "fill-current scale-110" : ""}`} />
              {isFav ? "Saved" : "Save"}
            </button>
          )}
        </div>
        {current.caption && (
          <p className="text-white/70 text-sm">{current.caption}</p>
        )}
        <p className="text-white/35 text-xs">{index + 1} / {images.length}</p>
        {zoom > 1 && (
          <p className="text-white/30 text-[10px]">Scroll to zoom · Drag to pan · Double-click to reset</p>
        )}
      </div>
    </motion.div>
  );
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type GalleryImage = { id: number; url: string; caption: string | null };
type GalleryFolder = { id: number; name: string; description: string | null; cover_image_url: string | null; images: GalleryImage[] };
type CustomPageData = {
  id: number; slug: string; title: string; type: "gallery" | "content";
  description: string | null; content: string | null; is_published: boolean;
  meta_title: string | null; meta_description: string | null;
  requiresPassword?: boolean; requiresLogin?: boolean; folders?: GalleryFolder[];
};

export default function CustomPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, isAdmin, setUser, loading: authLoading } = useToolsUser();

  const [page, setPage] = useState<CustomPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [loginPageTitle, setLoginPageTitle] = useState("");
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<GalleryFolder | null>(null);
  const [lightbox, setLightbox] = useState<{ images: GalleryImage[]; index: number } | null>(null);

  const [favoritedIds, setFavoritedIds] = useState<Set<number>>(new Set());
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const fetchPage = useCallback(() => {
    if (authLoading) return;
    setLoading(true);
    fetch(`${BASE}/api/pages/${slug}`, { credentials: "include" })
      .then(async r => {
        if (r.status === 401) {
          const data = await r.json();
          if (data.requiresLogin) {
            setRequiresLogin(true);
            setLoginPageTitle(data.title ?? "");
          } else {
            setNotFound(true);
          }
          return;
        }
        if (!r.ok) { setNotFound(true); return; }
        const data: CustomPageData = await r.json();
        if (data.requiresPassword) {
          setRequiresPassword(true);
          setLoginPageTitle(data.title ?? "");
        } else {
          setPage(data);
          setSelectedFolder(null);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug, authLoading]);

  useEffect(() => { fetchPage(); }, [fetchPage]);

  useEffect(() => {
    if (!page || !user) return;
    fetch(`${BASE}/api/favorites/images/page/${page.id}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then((ids: number[]) => setFavoritedIds(new Set(ids)))
      .catch(() => {});
  }, [page, user]);

  const toggleFavorite = async (e: React.MouseEvent, imageId: number) => {
    e.stopPropagation();
    if (!user || togglingId === imageId) return;
    setTogglingId(imageId);
    setFavoritedIds(prev => {
      const next = new Set(prev);
      if (next.has(imageId)) next.delete(imageId); else next.add(imageId);
      return next;
    });
    try {
      const res = await fetch(`${BASE}/api/favorites/images/${imageId}`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) {
        setFavoritedIds(prev => {
          const next = new Set(prev);
          if (next.has(imageId)) next.delete(imageId); else next.add(imageId);
          return next;
        });
      }
    } catch {
      setFavoritedIds(prev => {
        const next = new Set(prev);
        if (next.has(imageId)) next.delete(imageId); else next.add(imageId);
        return next;
      });
    } finally {
      setTogglingId(null);
    }
  };

  const submitPassword = async () => {
    setPwLoading(true); setPwError("");
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
    } catch { setPwError("Something went wrong"); }
    finally { setPwLoading(false); }
  };

  const navigateLightbox = useCallback((dir: 1 | -1) => {
    setLightbox(prev => {
      if (!prev) return null;
      const next = prev.index + dir;
      if (next < 0 || next >= prev.images.length) return prev;
      return { ...prev, index: next };
    });
  }, []);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-4">
        <p className="text-6xl font-bold text-muted-foreground/20 mb-4">404</p>
        <p className="text-xl font-semibold mb-2">Page not found</p>
        <p className="text-muted-foreground">This page doesn't exist or has been removed.</p>
      </div>
    );
  }

  if (requiresLogin && !user && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <UserCircle2 className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold">Sign in to view</h2>
            {loginPageTitle && (
              <p className="text-muted-foreground text-sm">
                <span className="font-medium text-foreground">"{loginPageTitle}"</span> is only available to registered members.
              </p>
            )}
          </div>
          <div className="bg-card border border-border rounded-2xl p-6 shadow-lg">
            <LoginForm
              onUserSuccess={(u: ToolUser) => {
                setUser(u);
                setRequiresLogin(false);
                fetchPage();
              }}
            />
          </div>
        </div>
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

      {!page.is_published && (
        <div className="bg-yellow-500/15 border-b border-yellow-500/30 px-4 py-2.5 text-center text-sm text-yellow-400 font-medium">
          Draft Preview — this page is not visible to the public yet. Publish it from the admin editor to make it live.
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Page header */}
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-bold mb-3">{page.title}</h1>
          {page.description && (
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">{page.description}</p>
          )}
        </div>

        {page.type === "content" ? (
          <div
            className="prose prose-invert max-w-4xl mx-auto"
            dangerouslySetInnerHTML={{ __html: page.content ?? "" }}
          />
        ) : (
          <AnimatePresence mode="wait">
            {/* ── Folder cards view ─────────────────────────────────────── */}
            {!selectedFolder ? (
              <motion.div
                key="folders"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {(page.folders ?? []).length === 0 ? (
                  <div className="text-center py-20 text-muted-foreground">
                    <Images className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>No folders yet</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {(page.folders ?? []).map((folder) => (
                      <button
                        key={folder.id}
                        onClick={() => setSelectedFolder(folder)}
                        className="group text-left bg-card border border-border rounded-xl overflow-hidden hover:border-primary/40 transition-colors"
                      >
                        {/* Cover image */}
                        <div className="relative aspect-[4/3] bg-muted/40 overflow-hidden">
                          {folder.cover_image_url ? (
                            <LazyImage
                              src={folder.cover_image_url}
                              alt={folder.name}
                              priority
                              className="absolute inset-0 w-full h-full group-hover:scale-[1.04] transition-transform duration-500"
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Images className="w-8 h-8 text-muted-foreground/20" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-200 flex items-end">
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-white text-[10px] font-semibold tracking-widest uppercase px-3 pb-2">
                              View →
                            </span>
                          </div>
                        </div>

                        {/* Info below */}
                        <div className="px-3 py-2">
                          <div className="flex items-start justify-between gap-1">
                            <p className="font-medium text-sm leading-snug truncate">{folder.name}</p>
                            <span className="shrink-0 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full mt-0.5">
                              {folder.images.length}
                            </span>
                          </div>
                          {folder.description && (
                            <p className="text-muted-foreground text-xs mt-0.5 line-clamp-1">{folder.description}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            ) : (
              /* ── Images grid view ───────────────────────────────────── */
              <motion.div
                key={`folder-${selectedFolder.id}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {/* Back + folder header */}
                <div className="flex items-center gap-3 mb-6">
                  <button
                    onClick={() => setSelectedFolder(null)}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    All folders
                  </button>
                  <span className="text-muted-foreground/30">/</span>
                  <p className="font-semibold text-sm">{selectedFolder.name}</p>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {selectedFolder.images.length} {selectedFolder.images.length === 1 ? "photo" : "photos"}
                  </span>
                </div>

                {selectedFolder.description && (
                  <p className="text-muted-foreground text-sm mb-6">{selectedFolder.description}</p>
                )}

                {selectedFolder.images.length === 0 ? (
                  <div className="text-center py-20 text-muted-foreground">
                    <Eye className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>No images in this folder yet</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5">
                    {selectedFolder.images.map((img, idx) => {
                      const isFav = favoritedIds.has(img.id);
                      return (
                        <div
                          key={img.id}
                          className="group relative aspect-square rounded-lg overflow-hidden cursor-pointer"
                          onClick={() => setLightbox({ images: selectedFolder.images, index: idx })}
                        >
                          <LazyImage
                            src={img.url}
                            alt={img.caption ?? ""}
                            priority={idx < 8}
                            className="absolute inset-0 w-full h-full"
                          />
                          {img.caption && (
                            <div className="absolute inset-x-0 bottom-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
                              <div className="bg-gradient-to-t from-black/70 via-black/30 to-transparent px-2.5 pb-2 pt-6">
                                <p className="text-white text-xs font-medium truncate">{img.caption}</p>
                              </div>
                            </div>
                          )}
                          {user && (
                            <button
                              onClick={(e) => toggleFavorite(e, img.id)}
                              className={`absolute top-2 right-2 p-1.5 rounded-full backdrop-blur-sm transition-all z-10
                                opacity-0 group-hover:opacity-100
                                ${isFav ? "!opacity-100 bg-red-500/90 text-white" : "bg-black/40 text-white/80 hover:bg-black/60"}`}
                            >
                              <Heart className={`w-3.5 h-3.5 ${isFav ? "fill-current" : ""}`} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <Lightbox
            images={lightbox.images}
            index={lightbox.index}
            onClose={() => setLightbox(null)}
            onNavigate={navigateLightbox}
            user={user}
            favoritedIds={favoritedIds}
            onToggleFavorite={toggleFavorite}
          />
        )}
      </AnimatePresence>
    </>
  );
}
