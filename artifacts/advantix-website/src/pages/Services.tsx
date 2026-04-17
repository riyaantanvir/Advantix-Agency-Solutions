import { useRef } from "react";
import { SEO } from "@/components/SEO";
import { motion } from "framer-motion";
import { useListServices } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight } from "lucide-react";
import { Link } from "wouter";
import * as LucideIcons from "lucide-react";
import type { LucideProps } from "lucide-react";

const expo = [0.22, 1, 0.36, 1] as const;

const grid = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const card = {
  hidden: { opacity: 0, y: 32, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: expo } },
};

function ServiceIcon({ name, className }: { name: string; className?: string }) {
  const icons = LucideIcons as unknown as Record<string, React.ComponentType<LucideProps>>;
  const pascal = name
    .split(/[-_\s]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
  const Icon = icons[pascal] ?? icons["Sparkles"];
  return <Icon className={className} />;
}

export default function Services() {
  const { data: services, isPending } = useListServices();

  // Detect if data was already in cache when this component first mounted
  // (e.g., pre-loaded by the Home page). If so, skip the "hidden → show"
  // animation to avoid the one-frame invisible flash on SPA navigation.
  const wasPreloaded = useRef(services !== undefined);

  const activeServices = services?.filter((s) => s.isActive) ?? [];

  const servicesStructuredData = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Advantix Digital Services",
    "description": "Full range of digital services by Advantix Digital",
    "url": "https://advantix.digital/services",
    "itemListElement": activeServices.map((s, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "item": {
        "@type": "Service",
        "name": s.name,
        "description": s.description,
        "provider": {
          "@type": "Organization",
          "name": "Advantix Digital",
          "url": "https://advantix.digital",
        },
        "areaServed": "Worldwide",
        "url": "https://advantix.digital/services",
      },
    })),
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Our Services — Web Dev, CRM, Automation, Marketing"
        description="Explore all services by Advantix Digital: custom website development, CRM integration, ecommerce, Python automation bots, Facebook marketing, graphics design, and more. Based in Bangladesh, serving global clients."
        keywords="web development services, CRM integration service, ecommerce development, python automation, facebook marketing agency, social media management, graphics design, lead generation, advantix services"
        canonical="/services"
        structuredData={servicesStructuredData}
      />
      {/* Hero */}
      <section className="relative pt-36 pb-20 overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full bg-primary/5 blur-3xl" />
        </div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: expo }}
            className="text-center max-w-3xl mx-auto"
          >
            <span className="inline-block text-xs font-bold uppercase tracking-[0.15em] text-primary mb-4 px-4 py-1.5 bg-primary/10 border border-primary/15 rounded-full">
              What We Do
            </span>
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight mb-6">
              Services That{" "}
              <span className="bg-gradient-to-r from-primary via-violet-400 to-purple-400 bg-clip-text text-transparent">
                Drive Growth
              </span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              From automation to full-stack development, we deliver precision-crafted digital solutions
              that scale your business and outpace the competition.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Services Grid */}
      <section className="pb-28">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {isPending ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-card rounded-2xl p-8 border border-border/50">
                  <Skeleton className="w-12 h-12 rounded-xl mb-5" />
                  <Skeleton className="h-6 w-2/3 mb-3" />
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              ))}
            </div>
          ) : (
            <motion.div
              variants={grid}
              initial={wasPreloaded.current ? "show" : "hidden"}
              animate="show"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {activeServices.map((service) => (
                <Link key={service.id} href={`/services/${service.id}`}>
                  <motion.div
                    variants={card}
                    whileHover={{ y: -6 }}
                    transition={{ type: "spring", stiffness: 260, damping: 22 }}
                    className="group relative bg-card border border-border/50 rounded-2xl p-8 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 overflow-hidden cursor-pointer"
                  >
                    {/* Subtle glow on hover */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-400 pointer-events-none -translate-y-1/2 translate-x-1/2" />

                    {/* Icon */}
                    <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center mb-5 group-hover:bg-primary/20 transition-colors duration-200">
                      <ServiceIcon name={service.icon} className="w-6 h-6 text-primary" />
                    </div>

                    <h3 className="font-display text-xl font-bold text-foreground mb-3 group-hover:text-primary transition-colors duration-200">
                      {service.name}
                    </h3>

                    <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                      {service.description}
                    </p>

                    <div className="flex items-center gap-1.5 text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      Learn more <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </motion.div>
                </Link>
              ))}
            </motion.div>
          )}

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: expo, delay: 0.2 }}
            className="mt-20 text-center"
          >
            <div className="inline-block bg-card border border-border/50 rounded-3xl px-10 py-10 max-w-2xl">
              <h2 className="font-display text-2xl md:text-3xl font-bold mb-4">
                Ready to get started?
              </h2>
              <p className="text-muted-foreground mb-8">
                Tell us what you need and we'll put together the right solution for your business.
              </p>
              <Link href="/contact">
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 py-3 rounded-xl shadow-lg shadow-primary/20 transition-colors"
                >
                  Get in Touch <ArrowRight className="w-4 h-4" />
                </motion.button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
