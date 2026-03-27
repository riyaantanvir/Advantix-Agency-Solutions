import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useListPortfolio } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Portfolio() {
  const { data: portfolioItems, isLoading } = useListPortfolio();
  const [activeCategory, setActiveCategory] = useState("All");

  const categories = ["All", ...Array.from(new Set(portfolioItems?.map(item => item.category) || []))];
  
  const filteredItems = portfolioItems?.filter(
    item => activeCategory === "All" || item.category === activeCategory
  ) || [];

  return (
    <div className="pt-32 pb-24 min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-6 tracking-tight">Our Work</h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Explore a selection of our recent projects. From digital transformations to targeted marketing campaigns, we deliver excellence.
          </p>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-12">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-24 rounded-full" />
            ))
          ) : (
            categories.map(category => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                  activeCategory === category 
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" 
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {category}
              </button>
            ))
          )}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[4/3] rounded-2xl w-full" />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-20 bg-secondary/20 rounded-2xl border border-border/50">
            <p className="text-muted-foreground text-lg">No portfolio items found in this category.</p>
          </div>
        ) : (
          <motion.div 
            layout
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
          >
            <AnimatePresence>
              {filteredItems.map(item => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3 }}
                  className="group relative rounded-2xl overflow-hidden aspect-[4/3] bg-secondary border border-border/50"
                >
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-secondary to-muted flex items-center justify-center">
                      <span className="font-display font-bold text-2xl text-muted-foreground/30">{item.title}</span>
                    </div>
                  )}
                  
                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-background/90 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-6">
                    <div className="transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                      <div className="inline-block px-3 py-1 bg-primary text-primary-foreground text-xs font-bold rounded-full mb-3">
                        {item.category}
                      </div>
                      <h3 className="text-2xl font-display font-bold text-white mb-2">{item.title}</h3>
                      {item.clientName && <p className="text-primary font-medium text-sm mb-2">For: {item.clientName}</p>}
                      {item.description && <p className="text-sm text-gray-300 line-clamp-3">{item.description}</p>}
                    </div>
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
