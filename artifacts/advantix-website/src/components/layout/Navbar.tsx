import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Menu, X, LogIn, Wrench, ChevronDown, Link2, Video, LayoutDashboard, LogOut, Bug } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useToolsUser } from "@/context/ToolsUserContext";
import { LoginModal } from "@/components/LoginModal";
import { BugReportModal } from "@/components/BugReportModal";

const expo = [0.22, 1, 0.36, 1] as const;

const tools = [
  { href: "/tools/url-shortener", icon: Link2, label: "URL Shortener", desc: "Shorten & track links" },
  { href: "/tools/screen-recorder", icon: Video, label: "Screen Recorder", desc: "Record up to 10 min" },
];

export function Navbar() {
  const [location] = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const { user, logout } = useToolsUser();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
    setToolsOpen(false);
  }, [location]);

  const navLinks = user
    ? [{ href: "/", label: "Home" }, { href: "/blog", label: "Blog" }]
    : [
        { href: "/", label: "Home" },
        { href: "/services", label: "Services" },
        { href: "/portfolio", label: "Portfolio" },
        { href: "/team", label: "Team" },
        { href: "/blog", label: "Blog" },
      ];

  const isToolsActive = location.startsWith("/tools");

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: expo }}
      className={`fixed top-0 w-full z-50 transition-all duration-500 ${
        isScrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-border/40 py-3 shadow-sm"
          : "bg-transparent py-5"
      }`}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <motion.img
              src={`${import.meta.env.BASE_URL}images/logo-icon.svg`}
              alt="Advantix Logo"
              className="w-8 h-8 object-contain"
              whileHover={{ rotate: -5, scale: 1.1 }}
              transition={{ type: "spring", stiffness: 300, damping: 15 }}
            />
            <span className="font-display font-bold text-xl tracking-tight group-hover:text-primary transition-colors duration-200">
              Advantix
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => {
              const isActive = location === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative text-sm font-medium transition-colors duration-200 hover:text-primary ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {link.label}
                  {isActive && (
                    <motion.span
                      layoutId="nav-underline"
                      className="absolute -bottom-1 left-0 right-0 h-0.5 bg-primary rounded-full"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                </Link>
              );
            })}

            {/* Tools dropdown */}
            <div className="relative">
              <button
                onClick={() => setToolsOpen(!toolsOpen)}
                onBlur={() => setTimeout(() => setToolsOpen(false), 150)}
                className={`relative flex items-center gap-1 text-sm font-medium transition-colors duration-200 hover:text-primary ${isToolsActive ? "text-primary" : "text-muted-foreground"}`}
              >
                <Wrench className="w-3.5 h-3.5" />
                Tools
                <motion.span animate={{ rotate: toolsOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown className="w-3.5 h-3.5" />
                </motion.span>
                {isToolsActive && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute -bottom-1 left-0 right-0 h-0.5 bg-primary rounded-full"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </button>

              <AnimatePresence>
                {toolsOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    transition={{ duration: 0.18, ease: expo }}
                    className="absolute top-full mt-3 left-1/2 -translate-x-1/2 w-60 bg-card border border-border/60 rounded-2xl shadow-xl overflow-hidden"
                  >
                    <div className="p-1.5">
                      {tools.map((tool) => {
                        const Icon = tool.icon;
                        return (
                          <Link key={tool.label} href={tool.href}>
                            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors hover:bg-secondary/60 cursor-pointer">
                              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                <Icon className="w-4 h-4 text-primary" />
                              </div>
                              <div className="text-left">
                                <p className="text-sm font-semibold text-foreground leading-none mb-0.5">{tool.label}</p>
                                <p className="text-xs text-muted-foreground">{tool.desc}</p>
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                    <div className="border-t border-border/50 px-4 py-3">
                      <Link href="/tools">
                        <p className="text-xs text-center text-primary font-medium hover:underline">View all tools →</p>
                      </Link>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Conditional: logged-in user OR login button */}
            {user ? (
              <div className="flex items-center gap-1.5">
                <Link href="/tools/dashboard">
                  <div className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm font-semibold transition-colors duration-200 hover:text-primary hover:bg-primary/5 ${location === "/tools/dashboard" ? "text-primary bg-primary/5" : "text-muted-foreground"}`}>
                    <LayoutDashboard className="w-4 h-4" />
                    Dashboard
                    {location === "/tools/dashboard" && (
                      <motion.span
                        layoutId="nav-underline"
                        className="absolute -bottom-1 left-2 right-2 h-0.5 bg-primary rounded-full"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                  </div>
                </Link>
                <button
                  onClick={logout}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                  title={`Sign out (${user.name})`}
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Button variant="ghost" size="sm" className="font-semibold gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => setLoginOpen(true)}>
                <LogIn className="w-4 h-4" /> Login
              </Button>
            )}

            {/* Report Bugs */}
            <button
              onClick={() => setBugReportOpen(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-red-400 transition-colors duration-200"
              title="Report a Bug"
            >
              <Bug className="w-3.5 h-3.5" />
              Report Bug
            </button>

            {!user && (
              <Link href="/contact">
                <motion.div
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  <Button size="sm" className="font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/20">
                    Get Started
                  </Button>
                </motion.div>
              </Link>
            )}
          </nav>

          {/* Mobile hamburger */}
          <motion.button
            className="md:hidden text-foreground p-2 rounded-lg hover:bg-secondary/50 transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle Menu"
            whileTap={{ scale: 0.92 }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {mobileMenuOpen ? (
                <motion.span key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.18 }}>
                  <X size={22} />
                </motion.span>
              ) : (
                <motion.span key="menu" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.18 }}>
                  <Menu size={22} />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </div>

      {/* Login Modal */}
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />

      {/* Bug Report Modal */}
      <BugReportModal open={bugReportOpen} onClose={() => setBugReportOpen(false)} />

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: expo }}
            className="md:hidden bg-background/95 backdrop-blur-xl border-b border-border/50 overflow-hidden"
          >
            <nav className="flex flex-col p-4 gap-1">
              {navLinks.map((link, i) => (
                <motion.div
                  key={link.href}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.3, ease: expo }}
                >
                  <Link
                    href={link.href}
                    className={`block px-3 py-2.5 rounded-xl text-base font-medium transition-colors hover:bg-secondary/60 hover:text-primary ${
                      location === link.href ? "text-primary bg-primary/5" : "text-muted-foreground"
                    }`}
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}

              {/* Tools section in mobile */}
              <motion.div
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.18, duration: 0.3, ease: expo }}
              >
                <p className="px-3 py-1.5 text-xs font-bold text-muted-foreground uppercase tracking-widest mt-2">Tools</p>
                {tools.map(tool => {
                  const Icon = tool.icon;
                  const isActive = isToolsActive && location.includes(tool.href.split("/tools/")[1] ?? "");
                  return (
                    <Link key={tool.label} href={tool.href}>
                      <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary/60">
                        <Icon className="w-4 h-4 text-primary" />
                        <span className={`text-base font-medium ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                          {tool.label}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </motion.div>

              {/* Report Bug in mobile */}
              <motion.div
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.22, duration: 0.3, ease: expo }}
              >
                <button
                  onClick={() => { setMobileMenuOpen(false); setBugReportOpen(true); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary/60 transition-colors"
                >
                  <Bug className="w-4 h-4 text-red-400" />
                  <span className="text-base font-medium text-muted-foreground">Report a Bug</span>
                </button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.24, duration: 0.3, ease: expo }}
                className="pt-2 flex flex-col gap-2"
              >
                {user ? (
                  <>
                    <Link href="/tools/dashboard" className="block">
                      <Button variant="outline" className="w-full font-semibold gap-2">
                        <LayoutDashboard className="w-4 h-4" /> My Dashboard
                      </Button>
                    </Link>
                    <Button variant="ghost" className="w-full font-semibold gap-2 text-muted-foreground" onClick={logout}>
                      <LogOut className="w-4 h-4" /> Sign out
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" className="w-full font-semibold gap-2"
                    onClick={() => { setMobileMenuOpen(false); setLoginOpen(true); }}>
                    <LogIn className="w-4 h-4" /> Login
                  </Button>
                )}
                {!user && (
                  <Link href="/contact">
                    <Button className="w-full font-semibold bg-primary hover:bg-primary/90 text-primary-foreground">
                      Get Started
                    </Button>
                  </Link>
                )}
              </motion.div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
