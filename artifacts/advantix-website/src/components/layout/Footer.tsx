import { Link } from "wouter";
import { Facebook, Instagram, Twitter, Linkedin, Mail, MapPin } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border/40 pt-14 pb-8 bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">

          <div className="col-span-1 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4 group">
              <img
                src={`${import.meta.env.BASE_URL}images/logo-mark.png`}
                alt="Advantix Logo"
                className="w-7 h-7 object-contain"
              />
              <span className="font-display font-bold text-lg tracking-tight group-hover:text-primary transition-colors">Advantix</span>
            </Link>
            <p className="text-muted-foreground/70 text-sm mb-5 max-w-xs leading-relaxed">
              Full-stack digital agency delivering premium tech and marketing solutions worldwide.
            </p>
            <div className="flex gap-3">
              {[
                { href: "https://facebook.com/advantixagency", Icon: Facebook, label: "Facebook" },
                { href: "https://instagram.com/advantixagency", Icon: Instagram, label: "Instagram" },
                { href: "https://twitter.com/advantixagency", Icon: Twitter, label: "Twitter" },
                { href: "https://linkedin.com/company/advantixagency", Icon: Linkedin, label: "LinkedIn" },
              ].map(({ href, Icon, label }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                  aria-label={`Advantix on ${label}`}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-muted/30 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all">
                  <Icon size={15} />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-sm text-foreground/80 uppercase tracking-wider mb-4">Services</h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground/70">
              {["Web Development", "CRM Integration", "Facebook Marketing", "Bot Automation", "Graphics Design"].map(s => (
                <li key={s}><Link href="/services" className="hover:text-primary transition-colors">{s}</Link></li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm text-foreground/80 uppercase tracking-wider mb-4">Company</h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground/70">
              {[
                { href: "/", label: "Home" },
                { href: "/portfolio", label: "Portfolio" },
                { href: "/team", label: "Team" },
                { href: "/blog", label: "Blog" },
                { href: "/contact", label: "Contact" },
              ].map(({ href, label }) => (
                <li key={label}><Link href={href} className="hover:text-primary transition-colors">{label}</Link></li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm text-foreground/80 uppercase tracking-wider mb-4">Contact</h4>
            <ul className="space-y-3 text-sm text-muted-foreground/70">
              <li className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-primary/70 shrink-0" />
                <span>hello@advantix.digital</span>
              </li>
              <li className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-primary/70 shrink-0 mt-0.5" />
                <span>Remote / Global — serving clients worldwide</span>
              </li>
            </ul>
          </div>

        </div>

        <div className="pt-6 border-t border-border/30 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground/50">
          <p>© {new Date().getFullYear()} Advantix Digital. All rights reserved.</p>
          <Link href="/contact" className="hover:text-primary transition-colors">hello@advantix.digital</Link>
        </div>
      </div>
    </footer>
  );
}
