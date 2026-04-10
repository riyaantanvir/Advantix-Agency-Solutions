import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, X, ChevronLeft, ChevronRight, ArrowLeft, BookOpen } from "lucide-react";
import { useToolsUser } from "@/context/ToolsUserContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type FavoriteItem = {
  image_id: number;
  url: string;
  caption: string | null;
  folder_name: string;
  page_id: number;
  page_title: string;
  page_slug: string;
  favorited_at: string;
};

export default function Favorites() {
  const { user, loading: authLoading } = useToolsUser();
  const [, navigate] = useLocation();

  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<{ items: FavoriteItem[]; index: number } | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetch(`${BASE}/api/favorites/images`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(setFavorites)
      .catch(() => setFavorites([]))
      .finally(() => setLoading(false));
  }, [user]);

  const removeFavorite = async (e: React.MouseEvent, imageId: number) => {
    e.stopPropagation();
    setRemovingId(imageId);
    try {
      await fetch(`${BASE}/api/favorites/images/${imageId}`, { method: "POST", credentials: "include" });
      setFavorites(prev => prev.filter(f => f.image_id !== imageId));
      if (lightbox) {
        const remaining = lightbox.items.filter(i => i.image_id !== imageId);
        if (remaining.length === 0) { setLightbox(null); }
        else {
          const newIndex = Math.min(lightbox.index, remaining.length - 1);
          setLightbox({ items: remaining, index: newIndex });
        }
      }
    } finally {
      setRemovingId(null);
    }
  };

  const navigateLightbox = (dir: 1 | -1) => {
    setLightbox(prev => {
      if (!prev) return null;
      const next = prev.index + dir;
      if (next < 0 || next >= prev.items.length) return prev;
      return { ...prev, index: next };
    });
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!lightbox) return;
      if (e.key === "ArrowRight") navigateLightbox(1);
      if (e.key === "ArrowLeft") navigateLightbox(-1);
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightbox]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Helmet><title>My Favorites — Advantix</title></Helmet>

      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="flex items-center gap-4 mb-10">
          <Link href="/tools/settings">
            <button className="p-2 rounded-xl hover:bg-muted/50 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Heart className="w-7 h-7 text-red-500 fill-current" />
              My Favorites
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {favorites.length === 0 ? "No saved images yet" : `${favorites.length} saved image${favorites.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>

        {favorites.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground">
            <Heart className="w-16 h-16 mx-auto mb-4 opacity-10" />
            <p className="text-lg font-medium mb-2">No favorites yet</p>
            <p className="text-sm">Open a gallery page and tap the heart on any image to save it here.</p>
          </div>
        ) : (
          <>
            {/* Group by page */}
            {Array.from(new Set(favorites.map(f => f.page_slug))).map(slug => {
              const pageItems = favorites.filter(f => f.page_slug === slug);
              const pageTitle = pageItems[0].page_title;
              return (
                <div key={slug} className="mb-10">
                  <div className="flex items-center gap-2 mb-4">
                    <BookOpen className="w-4 h-4 text-muted-foreground" />
                    <Link href={`/pages/${slug}`}>
                      <span className="font-semibold hover:text-primary transition-colors cursor-pointer">
                        {pageTitle}
                      </span>
                    </Link>
                    <span className="text-muted-foreground text-sm">· {pageItems.length} image{pageItems.length === 1 ? "" : "s"}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {pageItems.map((item, idx) => (
                      <motion.div
                        key={item.image_id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="group relative aspect-square rounded-xl overflow-hidden cursor-pointer bg-muted/40"
                        onClick={() => setLightbox({ items: pageItems, index: idx })}
                      >
                        <img
                          src={item.url}
                          alt={item.caption ?? ""}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />

                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end">
                          {item.caption && (
                            <p className="text-white text-xs font-medium px-2 py-1.5 truncate w-full bg-gradient-to-t from-black/60">
                              {item.caption}
                            </p>
                          )}
                        </div>

                        {/* Remove favorite */}
                        <button
                          onClick={(e) => removeFavorite(e, item.image_id)}
                          disabled={removingId === item.image_id}
                          className="absolute top-2 right-2 p-1.5 rounded-full bg-red-500/90 text-white z-10 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                        >
                          <Heart className="w-3.5 h-3.5 fill-current" />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
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

            {/* Remove from favorites */}
            <button
              onClick={(e) => removeFavorite(e, lightbox.items[lightbox.index].image_id)}
              className="absolute top-4 left-4 p-2.5 rounded-full bg-red-500/90 text-white z-10 hover:bg-red-600 transition-colors"
            >
              <Heart className="w-5 h-5 fill-current" />
            </button>

            {lightbox.index > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); navigateLightbox(-1); }}
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
              src={lightbox.items[lightbox.index].url}
              alt={lightbox.items[lightbox.index].caption ?? ""}
              className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl"
              onClick={(e) => e.stopPropagation()}
            />

            {lightbox.index < lightbox.items.length - 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); navigateLightbox(1); }}
                className="absolute right-4 p-3 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors z-10"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}

            <div className="absolute bottom-4 text-center px-4">
              {lightbox.items[lightbox.index].caption && (
                <p className="text-white/80 text-sm mb-1">{lightbox.items[lightbox.index].caption}</p>
              )}
              <p className="text-white/50 text-xs">
                {lightbox.items[lightbox.index].folder_name} · {lightbox.index + 1} / {lightbox.items.length}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
