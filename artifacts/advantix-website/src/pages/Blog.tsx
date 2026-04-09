import { SEO } from "@/components/SEO";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Calendar, Clock, ArrowRight, Loader2, Search, Eye } from "lucide-react";
import { useState, useMemo } from "react";

type BlogPost = {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  author: string;
  category: string;
  tags: string | null;
  readingTime: string | null;
  featured: boolean;
  views: number;
  likes: number;
  publishedAt: string | null;
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

export default function Blog() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");

  const { data: posts = [], isLoading } = useQuery<BlogPost[]>({
    queryKey: ["blog-posts"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/blog`);
      if (!res.ok) throw new Error("Failed to fetch posts");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const categories = useMemo(() => {
    const cats = Array.from(new Set(posts.map((p) => p.category).filter(Boolean)));
    return ["All", ...cats];
  }, [posts]);

  const filtered = useMemo(() => {
    return posts.filter((p) => {
      const matchCat = activeCategory === "All" || p.category === activeCategory;
      const q = search.toLowerCase();
      const matchSearch = !q || p.title.toLowerCase().includes(q) || (p.excerpt ?? "").toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [posts, activeCategory, search]);

  const featuredPost = filtered.find((p) => p.featured) ?? filtered[0] ?? null;
  const gridPosts = filtered.filter((p) => p.id !== featuredPost?.id);

  const blogStructuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Blog",
      "name": "Advantix Digital Blog",
      "url": "https://advantix.digital/blog",
      "description": "Tips, insights, and case studies on web development, digital marketing, automation, and business growth from the Advantix Digital team.",
      "publisher": { "@type": "Organization", "name": "Advantix Digital", "url": "https://advantix.digital" },
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Blog — Web Dev, Marketing & Automation Tips"
        description="Read the latest articles from Advantix Digital on web development, CRM, digital marketing, automation, and business growth strategies."
        keywords="digital agency blog, web development tips, marketing strategies, automation tutorials, CRM setup guide, advantix blog"
        canonical="/blog"
        structuredData={blogStructuredData}
      />

      {/* ── Hero ── */}
      <section className="pt-32 pb-10 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <motion.p
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="text-xs font-semibold tracking-[0.2em] uppercase text-primary mb-3"
          >
            Blog & Insights
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.05 }}
            className="text-3xl md:text-5xl font-display font-black text-foreground mb-3"
          >
            Ideas That <span className="text-primary">Drive Results</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.1 }}
            className="text-muted-foreground text-base max-w-xl mx-auto"
          >
            Insights on design, technology, marketing, and what it takes to build brands that convert.
          </motion.p>
        </div>
      </section>

      {/* ── Filters ── */}
      <section className="px-6 pb-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center gap-4">
          {/* Category tabs */}
          <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border ${
                  activeCategory === cat
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-transparent text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative sm:ml-auto">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search posts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-4 py-1.5 rounded-full border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 w-52"
            />
          </div>
        </div>
      </section>

      {/* ── Content ── */}
      <section className="px-6 pb-24">
        <div className="max-w-5xl mx-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-32 text-muted-foreground gap-3">
              <Loader2 size={18} className="animate-spin" /> Loading posts…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-32">
              <p className="text-muted-foreground font-medium">No posts found</p>
              <p className="text-muted-foreground/50 text-sm mt-1">Try a different category or search term.</p>
            </div>
          ) : (
            <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-10">

              {/* ── Featured post — compact horizontal ── */}
              {featuredPost && (
                <motion.div variants={fadeUp}>
                  <Link href={`/blog/${featuredPost.slug}`}>
                    <div className="group cursor-pointer grid sm:grid-cols-[260px_1fr] gap-0 rounded-2xl overflow-hidden border border-border/50 hover:border-primary/30 bg-card transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
                      {/* Image */}
                      <div className="overflow-hidden h-44 sm:h-auto">
                        {featuredPost.coverImageUrl ? (
                          <img
                            src={featuredPost.coverImageUrl}
                            alt={featuredPost.title}
                            loading="lazy"
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-violet-900/30 flex items-center justify-center">
                            <span className="text-5xl font-black text-white/10">{featuredPost.title[0]}</span>
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="p-6 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="px-2 py-0.5 bg-primary/10 text-primary text-[11px] font-semibold rounded-full border border-primary/20">Featured</span>
                            <span className="px-2 py-0.5 bg-secondary text-muted-foreground text-[11px] rounded-full">{featuredPost.category}</span>
                          </div>
                          <h2 className="text-lg font-display font-bold text-foreground group-hover:text-primary transition-colors mb-2 line-clamp-2">
                            {featuredPost.title}
                          </h2>
                          {featuredPost.excerpt && (
                            <p className="text-sm text-muted-foreground line-clamp-2">{featuredPost.excerpt}</p>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-4">
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                            {featuredPost.publishedAt && (
                              <span className="flex items-center gap-1"><Calendar size={11} />{formatDate(featuredPost.publishedAt)}</span>
                            )}
                            {featuredPost.readingTime && (
                              <span className="flex items-center gap-1"><Clock size={11} />{featuredPost.readingTime} min read</span>
                            )}
                          </div>
                          <span className="flex items-center gap-1 text-primary text-xs font-medium group-hover:gap-2 transition-all">
                            Read more <ArrowRight size={12} />
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              )}

              {/* ── Grid ── */}
              {gridPosts.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {gridPosts.map((post) => (
                    <motion.div key={post.id} variants={fadeUp}>
                      <Link href={`/blog/${post.slug}`}>
                        <div className="group cursor-pointer bg-card border border-border/50 hover:border-primary/30 rounded-xl overflow-hidden transition-all duration-300 hover:shadow-md hover:shadow-primary/5 hover:-translate-y-0.5 h-full flex flex-col">
                          {/* Image */}
                          <div className="overflow-hidden h-40">
                            {post.coverImageUrl ? (
                              <img
                                src={post.coverImageUrl}
                                alt={post.title}
                                loading="lazy"
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                              />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-secondary to-muted flex items-center justify-center">
                                <span className="text-3xl font-black text-muted-foreground/20">{post.title[0]}</span>
                              </div>
                            )}
                          </div>

                          {/* Content */}
                          <div className="p-4 flex flex-col flex-1">
                            {/* Category badge */}
                            <span className="inline-block self-start px-2 py-0.5 bg-primary/8 text-primary text-[10px] font-semibold rounded-full border border-primary/15 mb-2">
                              {post.category}
                            </span>

                            <h3 className="font-display font-bold text-foreground text-sm mb-1.5 group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                              {post.title}
                            </h3>
                            {post.excerpt && (
                              <p className="text-xs text-muted-foreground line-clamp-2 flex-1 leading-relaxed">{post.excerpt}</p>
                            )}

                            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/40 text-[10px] text-muted-foreground">
                              {post.publishedAt && (
                                <span className="flex items-center gap-1"><Calendar size={9} />{formatDate(post.publishedAt)}</span>
                              )}
                              {post.readingTime && (
                                <span className="flex items-center gap-1"><Clock size={9} />{post.readingTime} min</span>
                              )}
                              {post.views > 0 && (
                                <span className="flex items-center gap-1 ml-auto"><Eye size={9} />{post.views}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              )}

            </motion.div>
          )}
        </div>
      </section>
    </div>
  );
}
