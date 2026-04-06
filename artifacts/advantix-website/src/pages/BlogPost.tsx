import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Clock, Tag, ArrowLeft, User, Loader2, Share2, Check, Copy } from "lucide-react";

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
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function TwitterIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

interface ShareMenuProps {
  title: string;
  url: string;
}

function ShareMenu({ title, url }: ShareMenuProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  const platforms = [
    {
      label: "X (Twitter)",
      icon: <TwitterIcon />,
      href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
      color: "hover:text-white",
    },
    {
      label: "Facebook",
      icon: <FacebookIcon />,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      color: "hover:text-blue-400",
    },
    {
      label: "WhatsApp",
      icon: <WhatsAppIcon />,
      href: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`,
      color: "hover:text-green-400",
    },
    {
      label: "Telegram",
      icon: <TelegramIcon />,
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`,
      color: "hover:text-sky-400",
    },
  ];

  function copyLink() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-primary hover:text-primary/80 transition-colors font-medium"
      >
        <Share2 size={14} /> Share
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-8 z-50 w-52 bg-card border border-border/60 rounded-2xl shadow-xl overflow-hidden"
          >
            <div className="p-1.5 space-y-0.5">
              {platforms.map((p) => (
                <a
                  key={p.label}
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground ${p.color} hover:bg-secondary/50 transition-colors`}
                >
                  {p.icon}
                  {p.label}
                </a>
              ))}

              <div className="border-t border-border/40 my-1" />

              <button
                onClick={copyLink}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
              >
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

  const tags = post.tags ? post.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];

  return (
    <article className="min-h-screen bg-background">
      {/* Cover image */}
      {post.coverImageUrl && (
        <div className="relative h-[45vh] md:h-[55vh] overflow-hidden">
          <img
            src={post.coverImageUrl}
            alt={post.title}
            fetchPriority="high"
            decoding="async"
            className="w-full h-full object-cover"
          />
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

        {/* Meta */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-4 mb-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full border border-primary/20">
              {post.category}
            </span>
            {post.featured && (
              <span className="px-3 py-1 bg-yellow-500/10 text-yellow-400 text-xs font-medium rounded-full border border-yellow-500/20">
                Featured
              </span>
            )}
          </div>

          <h1 className="text-3xl md:text-5xl font-display font-black text-foreground leading-tight">
            {post.title}
          </h1>

          {post.excerpt && (
            <p className="text-lg text-muted-foreground leading-relaxed">{post.excerpt}</p>
          )}

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground pt-2">
            <span className="flex items-center gap-1.5"><User size={14} /> {post.author}</span>
            {post.publishedAt && <span className="flex items-center gap-1.5"><Calendar size={14} /> {formatDate(post.publishedAt)}</span>}
            {post.readingTime && <span className="flex items-center gap-1.5"><Clock size={14} /> {post.readingTime}</span>}
            <ShareMenu title={post.title} url={window.location.href} />
          </div>
        </motion.div>

        <div className="border-t border-border/50 mb-10" />

        {/* Article content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <div
            className="prose prose-invert prose-lg max-w-none
              prose-headings:font-display prose-headings:font-bold
              prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl
              prose-a:text-primary prose-a:no-underline hover:prose-a:underline
              prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground
              prose-code:bg-secondary prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-primary prose-code:before:content-none prose-code:after:content-none
              prose-pre:bg-secondary prose-pre:border prose-pre:border-border
              prose-img:rounded-xl prose-img:my-6
              prose-hr:border-border
              prose-strong:text-foreground
              prose-li:text-muted-foreground
              prose-p:text-muted-foreground prose-p:leading-relaxed"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />
        </motion.div>

        {/* Tags */}
        {tags.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-10 pt-8 border-t border-border/50">
            <div className="flex items-center gap-2 flex-wrap">
              <Tag size={14} className="text-muted-foreground" />
              {tags.map((tag) => (
                <span key={tag} className="px-3 py-1 bg-secondary text-muted-foreground text-xs rounded-full hover:text-foreground transition-colors">
                  {tag}
                </span>
              ))}
            </div>
          </motion.div>
        )}

        {/* Share section at bottom */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="mt-10 pt-8 border-t border-border/50">
          <p className="text-sm text-muted-foreground mb-3 font-medium">Share this article</p>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { label: "X", icon: <TwitterIcon />, href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(post.title)}`, bg: "bg-white/10 hover:bg-white/20 text-white" },
              { label: "Facebook", icon: <FacebookIcon />, href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`, bg: "bg-blue-600/20 hover:bg-blue-600/30 text-blue-400" },
              { label: "WhatsApp", icon: <WhatsAppIcon />, href: `https://wa.me/?text=${encodeURIComponent(post.title + " " + window.location.href)}`, bg: "bg-green-600/20 hover:bg-green-600/30 text-green-400" },
              { label: "Telegram", icon: <TelegramIcon />, href: `https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(post.title)}`, bg: "bg-sky-600/20 hover:bg-sky-600/30 text-sky-400" },
            ].map((p) => (
              <a
                key={p.label}
                href={p.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${p.bg}`}
              >
                {p.icon}
                {p.label}
              </a>
            ))}
          </div>
        </motion.div>

        {/* Footer CTA */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-12 p-6 md:p-8 rounded-2xl bg-card border border-border/50 text-center">
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
