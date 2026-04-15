import { SEO } from "@/components/SEO";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useListPortfolio } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";

const expo = [0.22, 1, 0.36, 1] as const;

const grid = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const card = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.55, ease: expo } },
};

export default function Portfolio() {
  const { data: portfolioItems, isLoading } = useListPortfolio();
  const [activeCategory, setActiveCategory] = useState("All");

  const categories = ["All", ...Array.from(new Set(portfolioItems?.map(item => item.category as string) || []))];
  const filteredItems = portfolioItems?.filter(
    item => activeCategory === "All" || item.category === activeCategory
  ) || [];

  const portfolioStructuredData = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Advantix Digital Portfolio",
    "description": "Selected work and case studies by Advantix Digital",
    "url": "https://advantix.digital/portfolio",
    "itemListElement": (filteredItems ?? []).slice(0, 10).map((item, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "item": {
        "@type": "CreativeWork",
        "name": item.title,
        "description": item.description,
        "image": item.imageUrl ?? undefined,
        "creator": {
          "@type": "Organization",
          "name": "Advantix Digital",
        },
      },
    })),
  };

  return (
    <div className="pt-32 pb-24 min-h-screen bg-background">
      <SEO
        title="Portfolio — Our Work & Case Studies"
        description="Browse Advantix Digital's portfolio of completed projects — custom websites, marketing campaigns, CRM systems, automation bots, and more. See how we deliver excellence for our clients worldwide."
        keywords="advantix portfolio, web design portfolio, digital marketing case studies, CRM project examples, ecommerce website, bangladesh agency portfolio"
        canonical="/portfolio"
        structuredData={portfolioStructuredData}
      />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: expo }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-6 tracking-tight">Our Work</h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Explore a selection of our recent projects. From digital transformations to targeted marketing campaigns, we deliver excellence.
          </p>
        </motion.div>

        {/* Filter Bar */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: expo, delay: 0.15 }}
          className="flex flex-wrap items-center justify-center gap-2 mb-12"
        >
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-24 rounded-full" />
            ))
          ) : (
            categories.map(category => (
              <motion.button
                key={category}
                onClick={() => setActiveCategory(category)}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className={`relative px-5 py-2 rounded-full text-sm font-medium transition-colors duration-250 ${
                  activeCategory === category
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
                }`}
              >
                {category}
                {activeCategory === category && (
                  <motion.span
                    layoutId="filter-pill"
                    className="absolute inset-0 rounded-full bg-primary -z-10"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
              </motion.button>
            ))
          )}
        </motion.div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[4/3] rounded-2xl w-full" />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20 bg-secondary/20 rounded-2xl border border-border/50"
          >
            <p className="text-muted-foreground text-lg">No portfolio items found in this category.</p>
          </motion.div>
        ) : (
          <motion.div
            layout
            variants={grid}
            initial={false}
            animate="show"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
          >
            <AnimatePresence mode="popLayout">
              {filteredItems.map(item => (
                <motion.div
                  key={item.id}
                  layout
                  variants={card}
                  exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                  className="group relative rounded-2xl overflow-hidden aspect-[4/3] bg-secondary border border-border/50"
                  whileHover={{ y: -5 }}
                  transition={{ type: "spring", stiffness: 300, damping: 22 }}
                >
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  ) : item.videoUrl ? (
                    <video
                      src={item.videoUrl}
                      className="w-full h-full object-cover"
                      autoPlay muted loop playsInline
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-secondary to-muted flex items-center justify-center">
                      <span className="font-display font-bold text-2xl text-muted-foreground/20">{item.title}</span>
                    </div>
                  )}

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-background/90 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-6">
                    <motion.div
                      initial={false}
                      animate={{ y: 0 }}
                      className="translate-y-4 group-hover:translate-y-0 transition-transform duration-300"
                    >
                      <div className="inline-block px-3 py-1 bg-primary text-primary-foreground text-xs font-bold rounded-full mb-3">
                        {item.category}
                      </div>
                      <h3 className="text-2xl font-display font-bold text-white mb-2">{item.title}</h3>
                      {item.clientName && <p className="text-primary font-medium text-sm mb-2">For: {item.clientName}</p>}
                      {item.description && <p className="text-sm text-gray-300 line-clamp-3">{item.description}</p>}
                    </motion.div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}
