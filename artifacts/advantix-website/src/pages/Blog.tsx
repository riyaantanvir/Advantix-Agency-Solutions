import { SEO } from "@/components/SEO";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Calendar, Clock, Tag, ArrowRight, Loader2, Rss, Eye } from "lucide-react";

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
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function Blog() {
  const { data: posts = [], isLoading } = useQuery<BlogPost[]>({
    queryKey: ["blog-posts"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/blog`);
      if (!res.ok) throw new Error("Failed to fetch posts");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const featuredPost = posts.find((p) => p.featured) ?? posts[0] ?? null;
  const regularPosts = posts.filter((p) => p.id !== featuredPost?.id);

  const blogStructuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Blog",
      "name": "Advantix Digital Blog",
      "url": "https://advantix.digital/blog",
      "description": "Tips, insights, and case studies on web development, digital marketing, automation, and business growth from the Advantix Digital team.",
      "publisher": {
        "@type": "Organization",
        "name": "Advantix Digital",
        "url": "https://advantix.digital",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://advantix.digital/" },
        { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://advantix.digital/blog" },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Blog — Web Dev, Marketing & Automation Tips"
        description="Read the latest articles from Advantix Digital on web development, CRM, digital marketing, automation, and business growth strategies. Expert insights from our team in Bangladesh."
        keywords="digital agency blog, web development tips, marketing strategies, automation tutorials, CRM setup guide, ecommerce tips, bangladesh tech blog, advantix blog"
        canonical="/blog"
        structuredData={blogStructuredData}
      />
      {/* Hero */}
      <section className="relative py-24 pt-36 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="max-w-6xl mx-auto px-6 relative">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6">
              <Rss size={14} /> Blog & Insights
            </div>
            <h1 className="text-4xl md:text-6xl font-display font-black text-foreground mb-4">
              Ideas That <span className="text-primary">Drive Results</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Insights on design, technology, marketing, and what it takes to build brands that convert.
            </p>
          </motion.div>

          {isLoading ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground gap-3">
              <Loader2 size={20} className="animate-spin" /> Loading posts...
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-24">
              <Rss size={40} className="mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground font-medium">No posts yet</p>
              <p className="text-muted-foreground/60 text-sm mt-1">Check back soon for articles and insights.</p>
            </div>
          ) : (
            <>
              {/* Featured Post */}
              {featuredPost && (
                <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="mb-16">
                  <Link href={`/blog/${featuredPost.slug}`}>
                    <div className="group cursor-pointer grid md:grid-cols-2 gap-0 rounded-2xl overflow-hidden border border-border/50 hover:border-primary/30 transition-all duration-300 bg-card hover:shadow-xl hover:shadow-primary/5">
                      {featuredPost.coverImageUrl ? (
                        <div className="overflow-hidden aspect-[16/10] md:aspect-auto">
                          <img
                            src={featuredPost.coverImageUrl}
                            alt={featuredPost.title}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                          />
                        </div>
                      ) : (
                        <div className="aspect-[16/10] md:aspect-auto bg-gradient-to-br from-primary/20 to-violet-900/30 flex items-center justify-center">
                          <span className="text-6xl font-display font-black text-white/10">{featuredPost.title[0]}</span>
                        </div>
                      )}
                      <div className="p-8 md:p-10 flex flex-col justify-center">
                        <div className="flex items-center gap-2 mb-4">
                          <span className="px-2.5 py-1 bg-primary/15 text-primary text-xs font-medium rounded-full border border-primary/20">Featured</span>
                          <span className="px-2.5 py-1 bg-secondary text-muted-foreground text-xs rounded-full">{featuredPost.category}</span>
                        </div>
                        <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-3 group-hover:text-primary transition-colors">
                          {featuredPost.title}
                        </h2>
                        {featuredPost.excerpt && <p className="text-muted-foreground mb-5 line-clamp-3">{featuredPost.excerpt}</p>}
                        <div className="flex items-center justify-between mt-auto">
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {featuredPost.publishedAt && <span className="flex items-center gap-1"><Calendar size={12} />{formatDate(featuredPost.publishedAt)}</span>}
                            {featuredPost.readingTime && <span className="flex items-center gap-1"><Clock size={12} />{featuredPost.readingTime}</span>}
                          </div>
                          <span className="flex items-center gap-1 text-primary text-sm font-medium group-hover:gap-2 transition-all">
                            Read more <ArrowRight size={14} />
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              )}

              {/* Regular Posts Grid */}
              {regularPosts.length > 0 && (
                <motion.div
                  variants={stagger}
                  initial="hidden"
                  animate="show"
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
                >
                  {regularPosts.map((post) => (
                    <motion.div key={post.id} variants={fadeUp}>
                      <Link href={`/blog/${post.slug}`}>
                        <div className="group cursor-pointer bg-card border border-border/50 hover:border-primary/30 rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1 h-full flex flex-col">
                          {post.coverImageUrl ? (
                            <div className="overflow-hidden aspect-[16/10]">
                              <img
                                src={post.coverImageUrl}
                                alt={post.title}
                                loading="lazy"
                                decoding="async"
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                              />
                            </div>
                          ) : (
                            <div className="aspect-[16/10] bg-gradient-to-br from-secondary to-muted flex items-center justify-center">
                              <span className="text-4xl font-display font-black text-muted-foreground/20">{post.title[0]}</span>
                            </div>
                          )}
                          <div className="p-5 flex flex-col flex-1">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-xs text-muted-foreground flex items-center gap-1"><Tag size={10} />{post.category}</span>
                            </div>
                            <h3 className="font-display font-bold text-foreground text-lg mb-2 group-hover:text-primary transition-colors line-clamp-2">
                              {post.title}
                            </h3>
                            {post.excerpt && <p className="text-sm text-muted-foreground line-clamp-3 flex-1">{post.excerpt}</p>}
                            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border/50 text-xs text-muted-foreground">
                              <span className="text-foreground/60 font-medium">{post.author}</span>
                              <span className="ml-auto flex items-center gap-3">
                                {post.publishedAt && <span className="flex items-center gap-1"><Calendar size={10} />{formatDate(post.publishedAt)}</span>}
                                {post.readingTime && <span className="flex items-center gap-1"><Clock size={10} />{post.readingTime}</span>}
                                {post.views > 0 && <span className="flex items-center gap-1"><Eye size={10} />{post.views}</span>}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
