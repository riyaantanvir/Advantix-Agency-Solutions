import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, Clock, Tag, ArrowLeft, User, Loader2, Share2, Check,
  Copy, Heart, Bookmark, Eye, ArrowRight,
} from "lucide-react";
import { SEO } from "@/components/SEO";

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
  readingTime: string | null;
  featured: boolean;
  views: number;
  likes: number;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
};

type RelatedPost = {
  id: number; title: string; slug: string; excerpt: string | null;
  coverImageUrl: string | null; author: string; category: string;
  readingTime: string | null; publishedAt: string | null; views: number;
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/* ── Reading Progress Bar ─────────────────────────────── */
function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let rafId: number;
    const update = () => {
      const el = document.documentElement;
      const scrollable = el.scrollHeight - el.clientHeight;
      const pct = scrollable > 0 ? Math.min(100, (window.scrollY / scrollable) * 100) : 0;
      setProgress(pct);
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-1 bg-transparent">
      <div
        className="h-full bg-gradient-to-r from-primary via-primary/80 to-primary/60 transition-[width] duration-75"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

/* ── Social Icons ──────────────────────────────────────── */
function TwitterIcon() {
  return <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>;
}
function FacebookIcon() {
  return <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>;
}
function WhatsAppIcon() {
  return <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>;
}
function TelegramIcon() {
  return <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" /></svg>;
}

/* Build share URL with UTM params */
function buildShareUrl(canonicalUrl: string, source: string, medium: string): string {
  try {
    const u = new URL(canonicalUrl);
    u.searchParams.set("utm_source", source);
    u.searchParams.set("utm_medium", medium);
    u.searchParams.set("utm_campaign", "blog-share");
    return u.toString();
  } catch {
    return canonicalUrl;
  }
}

/* ── Share Menu ────────────────────────────────────────── */
function ShareMenu({ title, canonicalUrl }: { title: string; canonicalUrl: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const twitterUrl  = buildShareUrl(canonicalUrl, "twitter",  "social");
  const fbUrl       = buildShareUrl(canonicalUrl, "facebook", "social");
  const waUrl       = buildShareUrl(canonicalUrl, "whatsapp", "messaging");
  const tgUrl       = buildShareUrl(canonicalUrl, "telegram", "messaging");

  const platforms = [
    { label: "X (Twitter)", icon: <TwitterIcon />, href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(twitterUrl)}&text=${encodeURIComponent(title)}`, color: "hover:text-white" },
    { label: "Facebook",    icon: <FacebookIcon />, href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fbUrl)}`, color: "hover:text-blue-400" },
    { label: "WhatsApp",    icon: <WhatsAppIcon />, href: `https://wa.me/?text=${encodeURIComponent(title + " " + waUrl)}`, color: "hover:text-green-400" },
    { label: "Telegram",    icon: <TelegramIcon />, href: `https://t.me/share/url?url=${encodeURIComponent(tgUrl)}&text=${encodeURIComponent(title)}`, color: "hover:text-sky-400" },
  ];

  return (
    <div ref={ref} className="relative ml-auto">
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-1.5 text-primary hover:text-primary/80 transition-colors font-medium">
        <Share2 size={14} /> Share
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, scale: 0.95, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -4 }} transition={{ duration: 0.15 }}
            className="absolute right-0 top-8 z-50 w-52 bg-card border border-border/60 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-1.5 space-y-0.5">
              {platforms.map(p => (
                <a key={p.label} href={p.href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground ${p.color} hover:bg-secondary/50 transition-colors`}>
                  {p.icon} {p.label}
                </a>
              ))}
              <div className="border-t border-border/40 my-1" />
              <button onClick={() => { navigator.clipboard.writeText(canonicalUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); setOpen(false); }}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
                {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Like Button ───────────────────────────────────────── */
function LikeButton({ slug, initialLikes }: { slug: string; initialLikes: number }) {
  const storageKey = `blog-liked-${slug}`;
  const [liked, setLiked] = useState(() => {
    try { return localStorage.getItem(storageKey) === "1"; } catch { return false; }
  });
  const [count, setCount] = useState(initialLikes);
  const [animating, setAnimating] = useState(false);

  const toggle = useCallback(async () => {
    const action = liked ? "unlike" : "like";
    const newLiked = !liked;
    const delta = newLiked ? 1 : -1;
    setLiked(newLiked);
    setCount(c => Math.max(0, c + delta));
    setAnimating(true);
    setTimeout(() => setAnimating(false), 400);
    try {
      localStorage.setItem(storageKey, newLiked ? "1" : "0");
      const r = await fetch(`${BASE}/api/blog/${slug}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (r.ok) { const d = await r.json(); setCount(d.likes); }
    } catch {}
  }, [liked, slug, storageKey]);

  return (
    <button onClick={toggle}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all select-none
        ${liked ? "bg-red-500/15 text-red-400 hover:bg-red-500/25" : "bg-secondary/50 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"}`}
      title={liked ? "Unlike" : "Like this post"}
    >
      <Heart className={`w-4 h-4 transition-transform ${animating ? "scale-125" : "scale-100"} ${liked ? "fill-red-400" : ""}`} />
      <span className="tabular-nums">{count}</span>
    </button>
  );
}

/* ── Bookmark Button ───────────────────────────────────── */
function BookmarkButton({ slug, title }: { slug: string; title: string }) {
  const storageKey = "blog-bookmarks";
  const [bookmarked, setBookmarked] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as string[];
      return saved.includes(slug);
    } catch { return false; }
  });
  const [flash, setFlash] = useState(false);

  const toggle = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as string[];
      let updated: string[];
      if (bookmarked) {
        updated = saved.filter((s: string) => s !== slug);
      } else {
        updated = [...saved, slug];
      }
      localStorage.setItem(storageKey, JSON.stringify(updated));
      setBookmarked(!bookmarked);
      setFlash(true);
      setTimeout(() => setFlash(false), 400);
    } catch {}
  };

  return (
    <button onClick={toggle}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all select-none
        ${bookmarked ? "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25" : "bg-secondary/50 text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10"}`}
      title={bookmarked ? "Remove bookmark" : "Bookmark this post"}
    >
      <Bookmark className={`w-4 h-4 transition-transform ${flash ? "scale-125" : "scale-100"} ${bookmarked ? "fill-amber-400" : ""}`} />
      {bookmarked ? "Saved" : "Save"}
    </button>
  );
}

/* ── Related Posts ─────────────────────────────────────── */
function RelatedPosts({ slug }: { slug: string }) {
  const { data: posts = [] } = useQuery<RelatedPost[]>({
    queryKey: ["blog-related", slug],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/blog/${slug}/related`);
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  if (posts.length === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
      className="mt-12 pt-8 border-t border-border/50">
      <h3 className="text-lg font-display font-bold text-foreground mb-6">Related Articles</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {posts.map(post => (
          <Link key={post.id} href={`/blog/${post.slug}`}>
            <div className="group bg-card border border-border/40 rounded-2xl overflow-hidden hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all cursor-pointer h-full flex flex-col">
              {post.coverImageUrl ? (
                <div className="h-36 overflow-hidden">
                  <img src={post.coverImageUrl} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
              ) : (
                <div className="h-36 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent flex items-center justify-center">
                  <span className="text-primary/30 font-display font-bold text-4xl">{post.category[0]}</span>
                </div>
              )}
              <div className="p-4 flex-1 flex flex-col gap-2">
                <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">{post.category}</span>
                <h4 className="text-sm font-semibold text-foreground leading-snug group-hover:text-primary transition-colors line-clamp-2">{post.title}</h4>
                {post.excerpt && <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{post.excerpt}</p>}
                <div className="flex items-center gap-2 mt-auto pt-2 text-xs text-muted-foreground">
                  {post.readingTime && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {post.readingTime}</span>}
                  {post.views > 0 && <span className="flex items-center gap-1 ml-auto"><Eye className="w-3 h-3" /> {post.views}</span>}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════ */
export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();

  const { data: post, isLoading, isError } = useQuery<BlogPost>({
    queryKey: ["blog-post", slug],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/blog/${slug}`);
      if (!res.ok) throw new Error("Post not found");
      return res.json();
    },
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });

  /* Fire view once per session */
  useEffect(() => {
    if (!slug || !post) return;
    const key = `blog-viewed-${slug}`;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      fetch(`${BASE}/api/blog/${slug}/view`, { method: "POST" }).catch(() => {});
    }
  }, [slug, post?.id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground gap-3">
        <Loader2 size={20} className="animate-spin" /> Loading article...
      </div>
    );
  }

  if (isError || !post) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <h1 className="text-4xl font-display font-bold text-foreground mb-3">404</h1>
        <p className="text-muted-foreground mb-6">This article doesn't exist or may have been removed.</p>
        <Link href="/blog">
          <button className="flex items-center gap-2 text-primary hover:text-primary/80 font-medium">
            <ArrowLeft size={16} /> Back to Blog
          </button>
        </Link>
      </div>
    );
  }

  const tags = post.tags ? post.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
  const canonicalUrl = `https://advantix.digital/blog/${post.slug}`;

  const blogPostStructuredData = [
    {
      "@context": "https://schema.org", "@type": "BlogPosting",
      "headline": post.seoTitle ?? post.title,
      "description": post.seoDescription ?? post.excerpt ?? undefined,
      "image": post.coverImageUrl ?? "https://advantix.digital/images/og-image.png",
      "url": canonicalUrl,
      "datePublished": post.publishedAt ?? undefined,
      "dateModified": post.publishedAt ?? undefined,
      "author": { "@type": "Organization", "name": post.author, "url": "https://advantix.digital" },
      "publisher": { "@type": "Organization", "name": "Advantix Digital", "url": "https://advantix.digital", "logo": { "@type": "ImageObject", "url": "https://advantix.digital/images/logo-icon.svg" } },
      "keywords": tags.join(", "), "articleSection": post.category, "inLanguage": "en-US",
    },
    {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://advantix.digital/" },
        { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://advantix.digital/blog" },
        { "@type": "ListItem", "position": 3, "name": post.title, "item": canonicalUrl },
      ],
    },
  ];

  return (
    <article className="min-h-screen bg-background">
      <ReadingProgressBar />

      <SEO
        title={post.seoTitle ?? post.title}
        description={post.seoDescription ?? post.excerpt ?? `Read "${post.title}" on the Advantix Digital blog.`}
        keywords={tags.length > 0 ? tags.join(", ") : `${post.category}, advantix blog, digital agency`}
        ogType="article"
        ogImage={post.coverImageUrl ?? undefined}
        canonical={`/blog/${post.slug}`}
        publishedAt={post.publishedAt ?? undefined}
        author={post.author}
        structuredData={blogPostStructuredData}
      />

      {/* Cover image */}
      {post.coverImageUrl && (
        <div className="relative h-[45vh] md:h-[55vh] overflow-hidden">
          <img src={post.coverImageUrl} alt={post.title} fetchPriority="high" decoding="async" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        </div>
      )}

      <div className="max-w-3xl mx-auto px-6 py-12">
        {!post.coverImageUrl && <div className="pt-28" />}

        {/* Back link */}
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
          <Link href="/blog">
            <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-8 transition-colors group">
              <ArrowLeft size={15} className="group-hover:-translate-x-1 transition-transform" /> Back to Blog
            </button>
          </Link>
        </motion.div>

        {/* Meta header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-4 mb-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full border border-primary/20">{post.category}</span>
            {post.featured && (
              <span className="px-3 py-1 bg-yellow-500/10 text-yellow-400 text-xs font-medium rounded-full border border-yellow-500/20">Featured</span>
            )}
          </div>

          <h1 className="text-3xl md:text-5xl font-display font-black text-foreground leading-tight">{post.title}</h1>

          {post.excerpt && <p className="text-lg text-muted-foreground leading-relaxed">{post.excerpt}</p>}

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground pt-2">
            <span className="flex items-center gap-1.5"><User size={14} /> {post.author}</span>
            {post.publishedAt && <span className="flex items-center gap-1.5"><Calendar size={14} /> {formatDate(post.publishedAt)}</span>}
            {post.readingTime && <span className="flex items-center gap-1.5"><Clock size={14} /> {post.readingTime}</span>}
            {post.views > 0 && (
              <span className="flex items-center gap-1.5 text-muted-foreground/70">
                <Eye size={14} /> {post.views.toLocaleString()} {post.views === 1 ? "view" : "views"}
              </span>
            )}
            <ShareMenu title={post.title} canonicalUrl={canonicalUrl} />
          </div>

          {/* Like + Bookmark row */}
          <div className="flex items-center gap-2 pt-1">
            <LikeButton slug={post.slug} initialLikes={post.likes} />
            <BookmarkButton slug={post.slug} title={post.title} />
          </div>
        </motion.div>

        <div className="border-t border-border/50 mb-10" />

        {/* Article content */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
          <div
            className="prose prose-invert prose-lg max-w-none
              prose-headings:font-display prose-headings:font-bold
              prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl
              prose-a:text-primary prose-a:no-underline hover:prose-a:underline
              prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground
              prose-code:bg-secondary prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-primary prose-code:before:content-none prose-code:after:content-none
              prose-pre:bg-secondary prose-pre:border prose-pre:border-border
              prose-img:rounded-xl prose-img:my-6 prose-img:block prose-img:mx-auto prose-img:max-w-full prose-img:h-auto
              prose-hr:border-border
              prose-strong:text-foreground
              prose-li:text-muted-foreground
              prose-p:text-muted-foreground prose-p:leading-relaxed
              [&_img]:block [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-xl [&_img]:my-6 [&_img]:mx-auto"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />
        </motion.div>

        {/* Tags */}
        {tags.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-10 pt-8 border-t border-border/50">
            <div className="flex items-center gap-2 flex-wrap">
              <Tag size={14} className="text-muted-foreground" />
              {tags.map(tag => (
                <span key={tag} className="px-3 py-1 bg-secondary text-muted-foreground text-xs rounded-full hover:text-foreground transition-colors cursor-default">
                  {tag}
                </span>
              ))}
            </div>
          </motion.div>
        )}

        {/* Bottom share section — with UTM links */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="mt-10 pt-8 border-t border-border/50">
          <p className="text-sm text-muted-foreground mb-3 font-medium">Share this article</p>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { label: "X", icon: <TwitterIcon />, href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(buildShareUrl(canonicalUrl, "twitter", "social"))}&text=${encodeURIComponent(post.title)}`, bg: "bg-white/10 hover:bg-white/20 text-white" },
              { label: "Facebook", icon: <FacebookIcon />, href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(buildShareUrl(canonicalUrl, "facebook", "social"))}`, bg: "bg-blue-600/20 hover:bg-blue-600/30 text-blue-400" },
              { label: "WhatsApp", icon: <WhatsAppIcon />, href: `https://wa.me/?text=${encodeURIComponent(post.title + " " + buildShareUrl(canonicalUrl, "whatsapp", "messaging"))}`, bg: "bg-green-600/20 hover:bg-green-600/30 text-green-400" },
              { label: "Telegram", icon: <TelegramIcon />, href: `https://t.me/share/url?url=${encodeURIComponent(buildShareUrl(canonicalUrl, "telegram", "messaging"))}&text=${encodeURIComponent(post.title)}`, bg: "bg-sky-600/20 hover:bg-sky-600/30 text-sky-400" },
            ].map(p => (
              <a key={p.label} href={p.href} target="_blank" rel="noopener noreferrer"
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${p.bg}`}>
                {p.icon} {p.label}
              </a>
            ))}
          </div>
        </motion.div>

        {/* Like + Bookmark (bottom) */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.38 }} className="mt-6 flex items-center gap-3">
          <LikeButton slug={post.slug} initialLikes={post.likes} />
          <BookmarkButton slug={post.slug} title={post.title} />
          <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1.5">
            <Eye size={12} /> {post.views.toLocaleString()} {post.views === 1 ? "view" : "views"}
          </span>
        </motion.div>

        {/* Related Posts */}
        <RelatedPosts slug={post.slug} />

        {/* Footer CTA */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }} className="mt-12 p-6 md:p-8 rounded-2xl bg-card border border-border/50 text-center">
          <h3 className="text-xl font-display font-bold text-foreground mb-2">Ready to grow your brand?</h3>
          <p className="text-muted-foreground text-sm mb-4">Let's build something great together.</p>
          <Link href="/contact">
            <button className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors">
              Get in Touch
            </button>
          </Link>
        </motion.div>

        {/* Back */}
        <div className="mt-8 flex justify-center">
          <Link href="/blog">
            <button className="flex items-center gap-2 text-muted-foreground hover:text-primary text-sm transition-colors">
              <ArrowLeft size={14} /> All Posts
            </button>
          </Link>
        </div>
      </div>
    </article>
  );
}
