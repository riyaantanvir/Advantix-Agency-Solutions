import { Link } from "wouter";
import { Facebook, Instagram, Twitter, Linkedin, Mail, MapPin } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-card border-t border-border pt-16 pb-8">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          
          <div className="col-span-1 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 group mb-4">
              <img 
                src={`${import.meta.env.BASE_URL}images/logo-mark.png`} 
                alt="Advantix Logo" 
                className="w-8 h-8 object-contain" 
              />
              <span className="font-display font-bold text-xl tracking-tight">Advantix</span>
            </Link>
            <p className="text-muted-foreground text-sm mb-6 max-w-xs">
              Building Brands That Convert. Full-stack digital agency delivering premium tech and marketing solutions.
            </p>
            <div className="flex gap-4">
              <a href="https://facebook.com/advantixagency" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors" aria-label="Advantix on Facebook">
                <Facebook size={20} />
              </a>
              <a href="https://instagram.com/advantixagency" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors" aria-label="Advantix on Instagram">
                <Instagram size={20} />
              </a>
              <a href="https://twitter.com/advantixagency" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors" aria-label="Advantix on Twitter">
                <Twitter size={20} />
              </a>
              <a href="https://linkedin.com/company/advantixagency" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors" aria-label="Advantix on LinkedIn">
                <Linkedin size={20} />
              </a>
            </div>
          </div>

          <div className="col-span-1">
            <h4 className="font-display font-bold text-lg mb-4">Services</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>Web Development</li>
              <li>CRM Integration</li>
              <li>Facebook Marketing</li>
              <li>Bot Automation</li>
              <li>Graphics Design</li>
            </ul>
          </div>

          <div className="col-span-1">
            <h4 className="font-display font-bold text-lg mb-4">Company</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/" className="hover:text-primary transition-colors">Home</Link></li>
              <li><Link href="/portfolio" className="hover:text-primary transition-colors">Portfolio</Link></li>
              <li><Link href="/team" className="hover:text-primary transition-colors">Team</Link></li>
              <li><Link href="/contact" className="hover:text-primary transition-colors">Contact</Link></li>
            </ul>
          </div>

          <div className="col-span-1">
            <h4 className="font-display font-bold text-lg mb-4">Contact</h4>
            <ul className="space-y-4 text-sm text-muted-foreground">
              <li className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-primary shrink-0" />
                <span>hello@advantix.agency</span>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-primary shrink-0" />
                <span>Remote / Global<br/>Serving clients worldwide</span>
              </li>
            </ul>
          </div>

        </div>
        
        <div className="pt-8 border-t border-border/50 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Advantix Agency. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
