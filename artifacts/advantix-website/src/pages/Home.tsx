import { motion } from "framer-motion";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useListPortfolio } from "@workspace/api-client-react";
import { 
  Monitor, Database, LayoutTemplate, ShoppingCart, 
  Bot, Users, UserPlus, Palette, Facebook, 
  Share2, ClipboardList, TrendingUp, ArrowRight
} from "lucide-react";

const services = [
  { icon: LayoutTemplate, title: "Website Development", desc: "Custom, responsive, and blazing fast web applications." },
  { icon: Database, title: "CRM Integration", desc: "Streamline your customer relationships and data flow." },
  { icon: Monitor, title: "Sales Page Design", desc: "High-converting landing pages engineered for sales." },
  { icon: ShoppingCart, title: "Ecommerce Solutions", desc: "Robust online stores with seamless payment flows." },
  { icon: Bot, title: "Python Bot Automation", desc: "Automate repetitive tasks and scale your operations." },
  { icon: Users, title: "Team Management", desc: "Systems to track, manage, and empower your workforce." },
  { icon: UserPlus, title: "Virtual Assistants", desc: "Dedicated professionals to handle your day-to-day." },
  { icon: Palette, title: "Graphics & Branding", desc: "Stunning visual identities that capture attention." },
  { icon: Facebook, title: "Facebook Marketing", desc: "Targeted ad campaigns with high ROI." },
  { icon: Share2, title: "Social Media Management", desc: "Grow your audience with consistent, engaging content." },
  { icon: ClipboardList, title: "Data Entry & Ops", desc: "Accurate, efficient data processing and management." },
  { icon: TrendingUp, title: "Lead Generation", desc: "Qualified inbound leads ready to convert." },
];

export default function Home() {
  const { data: portfolioItems } = useListPortfolio();
  
  const featuredPortfolio = portfolioItems?.slice(0, 3) || [];

  return (
    <div className="w-full">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center pt-20 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            src={`${import.meta.env.BASE_URL}images/hero-bg.png`} 
            alt="Hero Background" 
            className="w-full h-full object-cover opacity-60 mix-blend-screen"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background" />
        </div>
        
        <div className="container relative z-10 mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="max-w-4xl mx-auto"
          >
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-primary font-mono text-sm md:text-base font-semibold tracking-widest uppercase mb-5 letter-spacing-widest"
            >
              advantix.agency
            </motion.p>
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-display font-extrabold tracking-tight mb-6">
              We Build Brands <br className="hidden md:block"/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">That Convert</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
              Advantix is a full-stack digital agency — from web development to social media — we help businesses grow online with beautiful design and powerful technology.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/portfolio">
                <Button size="lg" className="w-full sm:w-auto h-14 px-8 text-base bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all duration-300">
                  View Our Work
                </Button>
              </Link>
              <Link href="/contact">
                <Button size="lg" variant="outline" className="w-full sm:w-auto h-14 px-8 text-base border-2 hover:bg-secondary transition-all duration-300">
                  Let's Talk
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-24 bg-background relative">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">Everything You Need to Scale</h2>
            <p className="text-muted-foreground">Comprehensive digital solutions tailored to your unique business goals.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {services.map((service, index) => (
              <motion.div
                key={service.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: index * 0.05 }}
              >
                <Card className="p-6 h-full bg-card hover:bg-secondary/50 border-border/50 hover:border-primary/50 transition-all duration-300 group">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <service.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-display font-bold text-lg mb-2">{service.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{service.desc}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 border-y border-border/50 bg-secondary/30 relative overflow-hidden">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: "200+", label: "Clients Served" },
              { value: "500+", label: "Projects Delivered" },
              { value: "5+", label: "Years Experience" },
              { value: "98%", label: "Client Satisfaction" },
            ].map((stat, idx) => (
              <motion.div 
                key={stat.label}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="p-4"
              >
                <div className="text-4xl md:text-5xl font-display font-extrabold text-transparent bg-clip-text bg-gradient-to-br from-foreground to-foreground/60 mb-2">
                  {stat.value}
                </div>
                <div className="text-sm font-medium text-primary uppercase tracking-wider">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Portfolio Preview */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4">
            <div>
              <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">Recent Work</h2>
              <p className="text-muted-foreground">A glimpse into some of our successful partnerships.</p>
            </div>
            <Link href="/portfolio">
              <Button variant="ghost" className="group">
                View All Work <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {featuredPortfolio.map((item, idx) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="group cursor-pointer relative rounded-2xl overflow-hidden aspect-[4/3] bg-secondary"
              >
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-secondary to-muted flex items-center justify-center">
                    <span className="font-display font-bold text-2xl text-muted-foreground opacity-50">{item.title[0]}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent opacity-80 transition-opacity duration-300 group-hover:opacity-100" />
                <div className="absolute bottom-0 left-0 right-0 p-6 translate-y-4 transition-transform duration-300 group-hover:translate-y-0">
                  <div className="inline-block px-3 py-1 bg-primary/20 text-primary text-xs font-medium rounded-full mb-3 backdrop-blur-sm border border-primary/20">
                    {item.category}
                  </div>
                  <h3 className="text-xl font-display font-bold text-white mb-2">{item.title}</h3>
                  {item.clientName && <p className="text-sm text-gray-300">For {item.clientName}</p>}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 bg-card border-y border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-display font-bold text-center mb-16">What Our Clients Say</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { text: "Advantix transformed our online presence completely. Our conversion rate doubled within the first month of launching the new site.", author: "Sarah M.", role: "CEO" },
              { text: "Their automation tools saved us 20 hours a week. The ROI on their custom Python bot development was incredibly fast.", author: "James K.", role: "Founder" },
              { text: "Professional, fast, and results-driven team. Their Facebook marketing campaigns brought us the highest quality leads we've ever had.", author: "Maria L.", role: "Marketing Director" }
            ].map((testimonial, idx) => (
              <Card key={idx} className="p-8 bg-background border-border/50 shadow-lg relative">
                <div className="text-primary text-4xl font-serif absolute top-4 left-4 opacity-20">"</div>
                <p className="text-foreground leading-relaxed mb-6 relative z-10 italic">
                  "{testimonial.text}"
                </p>
                <div className="flex items-center gap-3 mt-auto">
                  <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center font-bold text-muted-foreground">
                    {testimonial.author[0]}
                  </div>
                  <div>
                    <div className="font-bold text-sm">{testimonial.author}</div>
                    <div className="text-xs text-primary">{testimonial.role}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-primary/5" />
        <div className="container relative z-10 mx-auto px-4 text-center max-w-3xl">
          <h2 className="text-4xl md:text-5xl font-display font-extrabold mb-6">Ready to grow your business?</h2>
          <p className="text-xl text-muted-foreground mb-10">Let's discuss how we can help you achieve your goals and scale your operations.</p>
          <Link href="/contact">
            <Button size="lg" className="h-14 px-10 text-lg bg-primary hover:bg-primary/90 shadow-xl shadow-primary/25 hover:-translate-y-1 transition-all duration-300">
              Start Your Project Today
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
