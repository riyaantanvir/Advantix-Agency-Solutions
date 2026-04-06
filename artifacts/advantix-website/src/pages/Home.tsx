import { motion, useInView, useMotionValue, useTransform, animate, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useListPortfolio, useListServices } from "@workspace/api-client-react";
import type { Service } from "@workspace/api-client-react";
import {
  Monitor, Database, LayoutTemplate, ShoppingCart,
  Bot, Users, UserPlus, Palette, Facebook,
  Share2, ClipboardList, TrendingUp, ArrowRight,
  Globe, Code2, Briefcase, Mail, Megaphone, BarChart3,
  Headphones, FileText, Zap, Search, Settings, Star, CheckCircle, X,
  BrainCircuit,
} from "lucide-react";

/* ── icon map ─────────────────────────────────────────────── */
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Monitor, Database, LayoutTemplate, ShoppingCart, Bot, Users, UserPlus,
  Palette, Facebook, Share2, ClipboardList, TrendingUp, Globe, Code2,
  Briefcase, Mail, Megaphone, BarChart3, Headphones, FileText, Zap,
  Search, Settings, Star, CheckCircle, BrainCircuit,
};
function getIcon(name: string): React.ComponentType<{ className?: string }> {
  return iconMap[name] ?? Briefcase;
}

/* ── easing ───────────────────────────────────────────────── */
const expo = [0.22, 1, 0.36, 1] as const;

/* ── animated counter ─────────────────────────────────────── */
function AnimatedCounter({ to, suffix }: { to: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v));

  useEffect(() => {
    if (isInView) {
      animate(mv, to, { duration: 2.2, ease: "easeOut" });
    }
  }, [isInView, to, mv]);

  return (
    <span ref={ref} className="tabular-nums">
      <motion.span>{rounded}</motion.span>{suffix}
    </span>
  );
}

/* ── detail renderer ──────────────────────────────────────── */
function renderDetails(text: string) {
  return text.split(/\n\n+/).map((para, pi) => {
    if (para.startsWith("- ") || para.includes("\n- ")) {
      const lines = para.split("\n").filter(Boolean);
      const header = lines[0].startsWith("- ") ? null : lines[0];
      const bullets = lines.filter(l => l.startsWith("- ")).map(l => l.slice(2));
      return (
        <div key={pi} className="mb-4">
          {header && <p className="font-semibold mb-2">{renderInline(header)}</p>}
          <ul className="space-y-1.5">
            {bullets.map((b, bi) => (
              <li key={bi} className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>{renderInline(b)}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    return (
      <p key={pi} className="text-sm text-muted-foreground mb-4 leading-relaxed">
        {renderInline(para)}
      </p>
    );
  });
}
function renderInline(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i} className="text-foreground font-semibold">{part.slice(2, -2)}</strong>
      : part
  );
}

/* ── service modal ────────────────────────────────────────── */
function ServiceModal({ service, onClose }: { service: Service; onClose: () => void }) {
  const Icon = getIcon(service.icon);
  return (
    <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto bg-card border-border/50">
      <DialogHeader>
        <div className="flex items-center gap-4 mb-2">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="w-7 h-7 text-primary" />
          </div>
          <div>
            <DialogTitle className="text-2xl font-display font-bold">{service.name}</DialogTitle>
            <p className="text-muted-foreground text-sm mt-1">{service.description}</p>
          </div>
        </div>
      </DialogHeader>
      <div className="mt-2 border-t border-border/50 pt-5">
        {service.details ? renderDetails(service.details) : <p className="text-sm text-muted-foreground">{service.description}</p>}
      </div>
      <div className="pt-4 border-t border-border/50 flex flex-col sm:flex-row gap-3">
        <Link href={`/contact?service=${encodeURIComponent(service.name)}`} className="flex-1">
          <Button className="w-full bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20" onClick={onClose}>
            Get a Quote for This Service <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
        <Button variant="outline" onClick={onClose}><X className="w-4 h-4 mr-2" />Close</Button>
      </div>
    </DialogContent>
  );
}

/* ── stagger variants ─────────────────────────────────────── */
const grid = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};
const gridItem = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.55, ease: expo } },
};

const fallbackServices: Service[] = [
  { id: 1, name: "Website Development", icon: "LayoutTemplate", description: "Custom, responsive, and blazing fast web applications.", details: null, order: 1, isActive: true, createdAt: "" },
  { id: 2, name: "CRM Integration", icon: "Database", description: "Streamline your customer relationships and data flow.", details: null, order: 2, isActive: true, createdAt: "" },
  { id: 3, name: "Sales Page Design", icon: "Monitor", description: "High-converting landing pages engineered for sales.", details: null, order: 3, isActive: true, createdAt: "" },
  { id: 4, name: "Ecommerce Solutions", icon: "ShoppingCart", description: "Robust online stores with seamless payment flows.", details: null, order: 4, isActive: true, createdAt: "" },
  { id: 5, name: "Python Bot Automation", icon: "Bot", description: "Automate repetitive tasks and scale your operations.", details: null, order: 5, isActive: true, createdAt: "" },
  { id: 6, name: "Team Management", icon: "Users", description: "Systems to track, manage, and empower your workforce.", details: null, order: 6, isActive: true, createdAt: "" },
  { id: 7, name: "Virtual Assistants", icon: "UserPlus", description: "Dedicated professionals to handle your day-to-day.", details: null, order: 7, isActive: true, createdAt: "" },
  { id: 8, name: "Graphics & Branding", icon: "Palette", description: "Stunning visual identities that capture attention.", details: null, order: 8, isActive: true, createdAt: "" },
  { id: 9, name: "Facebook Marketing", icon: "Facebook", description: "Targeted ad campaigns with high ROI.", details: null, order: 9, isActive: true, createdAt: "" },
  { id: 10, name: "Social Media Management", icon: "Share2", description: "Grow your audience with consistent, engaging content.", details: null, order: 10, isActive: true, createdAt: "" },
  { id: 11, name: "Data Entry & Ops", icon: "ClipboardList", description: "Accurate, efficient data processing and management.", details: null, order: 11, isActive: true, createdAt: "" },
  { id: 12, name: "Lead Generation", icon: "TrendingUp", description: "Qualified inbound leads ready to convert.", details: null, order: 12, isActive: true, createdAt: "" },
  { id: 13, name: "AI Solutions", icon: "BrainCircuit", description: "Smart AI-powered tools that think, learn, and grow your business on autopilot.", details: null, order: 13, isActive: true, createdAt: "" },
];

/* ── section reveal wrapper ───────────────────────────────── */
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, ease: expo, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════ */
export default function Home() {
  const { data: portfolioItems } = useListPortfolio();
  const { data: servicesData } = useListServices();
  const [activeService, setActiveService] = useState<Service | null>(null);

  const services = Array.isArray(servicesData) && servicesData.length > 0 ? servicesData : fallbackServices;
  const featuredPortfolio = Array.isArray(portfolioItems) ? portfolioItems.slice(0, 3) : [];

  const heroWords = ["We", "Build", "Brands"];

  return (
    <div className="w-full">

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center pt-20 overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0 z-0">
          <img
            src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
            alt="Hero Background"
            fetchPriority="high"
            decoding="async"
            className="w-full h-full object-cover opacity-50 mix-blend-screen"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/70 to-background" />
        </div>

        {/* Floating orbs */}
        <motion.div
          className="absolute w-[700px] h-[700px] rounded-full bg-primary/15 blur-[140px] pointer-events-none"
          animate={{ x: [0, 60, -30, 0], y: [0, -50, 30, 0], scale: [1, 1.08, 0.96, 1] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          style={{ top: "-15%", left: "-10%", zIndex: 1 }}
        />
        <motion.div
          className="absolute w-[500px] h-[500px] rounded-full bg-accent/10 blur-[120px] pointer-events-none"
          animate={{ x: [0, -50, 40, 0], y: [0, 60, -40, 0], scale: [1, 0.92, 1.06, 1] }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut", delay: 3 }}
          style={{ bottom: "5%", right: "-5%", zIndex: 1 }}
        />
        <motion.div
          className="absolute w-[350px] h-[350px] rounded-full bg-primary/8 blur-[100px] pointer-events-none"
          animate={{ x: [0, 30, -20, 0], y: [0, 30, -30, 0] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 8 }}
          style={{ top: "40%", right: "20%", zIndex: 1 }}
        />

        {/* Content */}
        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 text-center" style={{ zIndex: 2 }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.6, ease: expo, delay: 0.1 }}
            className="inline-flex items-center gap-3 bg-primary/10 border border-primary/25 text-primary rounded-full px-6 py-2.5 text-sm md:text-base font-mono font-bold tracking-[0.18em] uppercase mb-8"
          >
            <motion.span
              animate={{ scale: [1, 1.5, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="w-2 h-2 rounded-full bg-primary inline-block shrink-0"
            />
            advantix.agency
          </motion.div>

          <h1 className="text-5xl md:text-7xl lg:text-8xl font-display font-extrabold tracking-tight mb-6 leading-[1.05]">
            <span className="block">
              {heroWords.map((word, i) => (
                <motion.span
                  key={word}
                  initial={{ opacity: 0, y: 40, filter: "blur(8px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.8, delay: 0.25 + i * 0.12, ease: expo }}
                  className="inline-block mr-[0.25em]"
                >
                  {word}
                </motion.span>
              ))}
            </span>
            <motion.span
              initial={{ opacity: 0, y: 40, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.8, delay: 0.65, ease: expo }}
              className="block text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary to-accent"
            >
              That Convert
            </motion.span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.85, ease: expo }}
            className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed"
          >
            Advantix is a full-stack digital agency — from web development to social media — we help businesses grow online with beautiful design and powerful technology.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 1.0, ease: expo }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link href="/portfolio">
              <Button
                size="lg"
                className="w-full sm:w-auto h-14 px-8 text-base bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all duration-300"
              >
                View Our Work
              </Button>
            </Link>
            <Link href="/contact">
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto h-14 px-8 text-base border-2 hover:bg-secondary hover:-translate-y-0.5 transition-all duration-300"
              >
                Let's Talk
              </Button>
            </Link>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.6 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5"
        >
          <span className="text-xs text-muted-foreground font-medium tracking-wider uppercase">Scroll</span>
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            className="w-px h-8 bg-gradient-to-b from-primary/60 to-transparent"
          />
        </motion.div>
      </section>

      {/* ── Services ─────────────────────────────────────────── */}
      <section className="py-24 bg-background relative overflow-hidden">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">Everything You Need to Scale</h2>
            <p className="text-muted-foreground">Comprehensive digital solutions tailored to your unique business goals. Click any service to learn more.</p>
          </Reveal>

          <motion.div
            variants={grid}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {services.map((service) => {
              const Icon = getIcon(service.icon);
              const isAI = service.icon === "BrainCircuit";
              return (
                <motion.div key={service.id} variants={gridItem}>
                  <motion.button
                    onClick={() => setActiveService(service)}
                    className="w-full text-left"
                    whileHover={{ scale: 1.015 }}
                    whileTap={{ scale: 0.99 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    {isAI ? (
                      <Card className="p-6 h-full relative overflow-hidden border-primary/60 bg-gradient-to-br from-primary/10 via-primary/5 to-card group cursor-pointer shadow-lg shadow-primary/10 transition-all duration-300 hover:shadow-primary/25 hover:border-primary">
                        {/* Glow orb */}
                        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-primary/20 blur-2xl pointer-events-none" />
                        <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-primary/10 blur-2xl pointer-events-none" />
                        {/* Badge */}
                        <span className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/15 border border-primary/30 px-2 py-0.5 rounded-full">New</span>
                        {/* Human silhouette + brain icon */}
                        <div className="relative w-14 h-14 mb-4">
                          <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center ring-2 ring-primary/30">
                            <Icon className="w-7 h-7 text-primary drop-shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                          </div>
                          {/* Pulse ring */}
                          <span className="absolute inset-0 rounded-2xl ring-2 ring-primary/40 animate-ping opacity-30 pointer-events-none" />
                        </div>
                        <h3 className="font-display font-bold text-lg mb-2 text-primary">{service.name}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">{service.description}</p>
                        <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-primary">
                          Explore AI tools <ArrowRight className="w-3 h-3" />
                        </div>
                      </Card>
                    ) : (
                      <Card className="p-6 h-full bg-card hover:bg-secondary/50 border-border/50 hover:border-primary/40 transition-colors duration-300 group cursor-pointer hover:shadow-lg hover:shadow-primary/5">
                        <motion.div
                          className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4"
                          whileHover={{ backgroundColor: "rgb(var(--primary) / 0.2)" }}
                          transition={{ duration: 0.2 }}
                        >
                          <Icon className="w-6 h-6 text-primary" />
                        </motion.div>
                        <h3 className="font-display font-bold text-lg mb-2 group-hover:text-primary transition-colors duration-200">{service.name}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">{service.description}</p>
                        <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          Learn more <ArrowRight className="w-3 h-3" />
                        </div>
                      </Card>
                    )}
                  </motion.button>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* Service detail modal */}
      <Dialog open={!!activeService} onOpenChange={(open) => !open && setActiveService(null)}>
        {activeService && <ServiceModal service={activeService} onClose={() => setActiveService(null)} />}
      </Dialog>

      {/* ── Stats ────────────────────────────────────────────── */}
      <section className="py-20 border-y border-border/50 bg-secondary/20 relative overflow-hidden">
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-primary/3 via-transparent to-primary/3 pointer-events-none"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { to: 200, suffix: "+", label: "Clients Served" },
              { to: 500, suffix: "+", label: "Projects Delivered" },
              { to: 5, suffix: "+", label: "Years Experience" },
              { to: 98, suffix: "%", label: "Client Satisfaction" },
            ].map((stat, idx) => (
              <Reveal key={stat.label} delay={idx * 0.1} className="p-4">
                <div className="text-4xl md:text-5xl font-display font-extrabold text-transparent bg-clip-text bg-gradient-to-br from-foreground to-foreground/50 mb-2">
                  <AnimatedCounter to={stat.to} suffix={stat.suffix} />
                </div>
                <div className="text-sm font-semibold text-primary uppercase tracking-wider">{stat.label}</div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Portfolio Preview ────────────────────────────────── */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4">
            <div>
              <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">Recent Work</h2>
              <p className="text-muted-foreground">A glimpse into some of our successful partnerships.</p>
            </div>
            <Link href="/portfolio">
              <Button variant="ghost" className="group">
                View All Work <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </Reveal>

          <motion.div
            variants={grid}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
          >
            {featuredPortfolio.map((item) => (
              <motion.div
                key={item.id}
                variants={gridItem}
                className="group cursor-pointer relative rounded-2xl overflow-hidden aspect-[4/3] bg-secondary"
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
              >
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.title} loading="lazy" decoding="async" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-secondary to-muted flex items-center justify-center">
                    <span className="font-display font-bold text-2xl text-muted-foreground opacity-30">{item.title[0]}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent opacity-80 transition-opacity duration-300 group-hover:opacity-100" />
                <div className="absolute bottom-0 left-0 right-0 p-6 translate-y-3 group-hover:translate-y-0 transition-transform duration-300">
                  <div className="inline-block px-3 py-1 bg-primary/20 text-primary text-xs font-medium rounded-full mb-3 backdrop-blur-sm border border-primary/20">
                    {item.category}
                  </div>
                  <h3 className="text-xl font-display font-bold text-white mb-2">{item.title}</h3>
                  {item.clientName && <p className="text-sm text-gray-300">For {item.clientName}</p>}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────── */}
      <section className="py-24 bg-card border-y border-border overflow-hidden">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-display font-bold">What Our Clients Say</h2>
          </Reveal>

          <motion.div
            variants={grid}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            {[
              { text: "Advantix transformed our online presence completely. Our conversion rate doubled within the first month of launching the new site.", author: "Sarah M.", role: "CEO" },
              { text: "Their automation tools saved us 20 hours a week. The ROI on their custom Python bot development was incredibly fast.", author: "James K.", role: "Founder" },
              { text: "Professional, fast, and results-driven team. Their Facebook marketing campaigns brought us the highest quality leads we've ever had.", author: "Maria L.", role: "Marketing Director" }
            ].map((t, idx) => (
              <motion.div key={idx} variants={gridItem}>
                <Card className="p-8 bg-background border-border/50 shadow-sm hover:shadow-lg hover:shadow-primary/5 transition-shadow duration-300 relative h-full">
                  <div className="text-primary text-5xl font-serif absolute top-4 left-5 opacity-15 leading-none select-none">"</div>
                  <p className="text-foreground leading-relaxed mb-6 relative z-10 italic text-sm">
                    "{t.text}"
                  </p>
                  <div className="flex items-center gap-3 mt-auto">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm">
                      {t.author[0]}
                    </div>
                    <div>
                      <div className="font-bold text-sm">{t.author}</div>
                      <div className="text-xs text-primary">{t.role}</div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section className="py-28 relative overflow-hidden">
        <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
        <motion.div
          className="absolute inset-0 pointer-events-none"
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/8 blur-[120px]" />
        </motion.div>
        <div className="container relative mx-auto px-4 text-center max-w-3xl">
          <Reveal>
            <h2 className="text-4xl md:text-5xl font-display font-extrabold mb-6">Ready to grow your business?</h2>
            <p className="text-xl text-muted-foreground mb-10">Let's discuss how we can help you achieve your goals and scale your operations.</p>
            <Link href="/contact">
              <motion.div
                whileHover={{ scale: 1.04, y: -2 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="inline-block"
              >
                <Button size="lg" className="h-14 px-10 text-lg bg-primary hover:bg-primary/90 shadow-xl shadow-primary/25">
                  Start Your Project Today
                </Button>
              </motion.div>
            </Link>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
