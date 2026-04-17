import { useParams, Link } from "wouter";
import { useListServices } from "@workspace/api-client-react";
import { SEO } from "@/components/SEO";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import * as LucideIcons from "lucide-react";
import type { LucideProps } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const expo = [0.22, 1, 0.36, 1] as const;

function ServiceIcon({ name, className }: { name: string; className?: string }) {
  const icons = LucideIcons as unknown as Record<string, React.ComponentType<LucideProps>>;
  const pascal = name
    .split(/[-_\s]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
  const Icon = icons[pascal] ?? icons["Sparkles"];
  return <Icon className={className} />;
}

export default function ServiceDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: services, isPending } = useListServices();

  const service = services?.find((s) => String(s.id) === id);

  if (!isPending && !service) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground text-lg">Service not found.</p>
        <Link href="/services">
          <span className="text-primary font-semibold hover:underline flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Back to Services
          </span>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {service && (
        <SEO
          title={`${service.name} — Advantix Digital`}
          description={service.description}
          canonical={`/services/${service.id}`}
        />
      )}

      <section className="relative pt-36 pb-20 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full bg-primary/5 blur-3xl" />
        </div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
          <Link href="/services">
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4 }}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer mb-8"
            >
              <ArrowLeft className="w-4 h-4" /> All Services
            </motion.span>
          </Link>

          {isPending ? (
            <div className="space-y-4 mt-4">
              <Skeleton className="w-16 h-16 rounded-2xl" />
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-5/6" />
              <div className="pt-8 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            </div>
          ) : service ? (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: expo }}
            >
              <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/15 flex items-center justify-center mb-6">
                <ServiceIcon name={service.icon} className="w-8 h-8 text-primary" />
              </div>

              <h1 className="font-display text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
                {service.name}
              </h1>

              <p className="text-lg text-muted-foreground leading-relaxed mb-10">
                {service.description}
              </p>

              {service.details ? (
                <div className="prose prose-invert prose-primary max-w-none text-foreground/90 leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {service.details}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-muted-foreground italic">
                  More details coming soon. Feel free to reach out for more information.
                </p>
              )}

              <div className="mt-14 pt-8 border-t border-border/40">
                <Link href="/contact">
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 py-3 rounded-xl shadow-lg shadow-primary/20 transition-colors"
                  >
                    Get Started <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </Link>
              </div>
            </motion.div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
