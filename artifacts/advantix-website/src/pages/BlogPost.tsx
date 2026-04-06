import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { motion } from "framer-motion";
import { Calendar, Clock, Tag, ArrowLeft, User, Loader2, Share2 } from "lucide-react";

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

  function handleShare() {
    if (navigator.share) {
      navigator.share({ title: post?.title, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href).then(() => {
        alert("Link copied to clipboard!");
      });
    }
  }

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
            <button
              onClick={handleShare}
              className="ml-auto flex items-center gap-1.5 text-primary hover:text-primary/80 transition-colors font-medium"
            >
              <Share2 size={14} /> Share
            </button>
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
