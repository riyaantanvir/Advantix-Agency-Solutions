import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Menu, X, LogIn, Wrench, LayoutDashboard, LogOut, Bug, Shield } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useToolsUser } from "@/context/ToolsUserContext";
import { LoginModal } from "@/components/LoginModal";
import { BugReportModal } from "@/components/BugReportModal";
import { useQuery } from "@tanstack/react-query";

const expo = [0.22, 1, 0.36, 1] as const;

export function Navbar() {
  const [location] = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const { user, isAdmin, logout } = useToolsUser();

  const { data: adminMe } = useQuery<{ authenticated: boolean; username: string }>({
    queryKey: ["admin-me-navbar"],
    queryFn: () => fetch("/api/auth/me", { credentials: "include" }).then(r => r.ok ? r.json() : { authenticated: false }),
    staleTime: 60_000,
    retry: false,
  });
  const isAdminLoggedIn = isAdmin || adminMe?.authenticated === true;

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/services", label: "Services" },
    { href: "/portfolio", label: "Portfolio" },
    { href: "/team", label: "Team" },
    { href: "/blog", label: "Blog" },
    { href: "/careers", label: "Careers" },
    { href: "/tools", label: "Tools", icon: Wrench },
  ];

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
              const isActive = link.href === "/tools"
                ? location.startsWith("/tools")
                : location === link.href;
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative flex items-center gap-1 text-sm font-medium transition-colors duration-200 hover:text-primary ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {Icon && <Icon className="w-3.5 h-3.5" />}
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

            {/* Conditional: admin / logged-in user / login button */}
            {isAdminLoggedIn ? (
              <div className="flex items-center gap-2">
                <a
                  href="/tools/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm font-semibold transition-colors duration-200 hover:text-primary hover:bg-primary/5 text-muted-foreground"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Tools Dashboard
                </a>
                <a href="/admin/" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm font-semibold text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors duration-200">
                  <Shield className="w-4 h-4" />
                  Admin Panel
                </a>
              </div>
            ) : user ? (
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

            {!user && !isAdmin && (
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
              {navLinks.map((link, i) => {
                const isActive = link.href === "/tools"
                  ? location.startsWith("/tools")
                  : location === link.href;
                const Icon = link.icon;
                return (
                  <motion.div
                    key={link.href}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06, duration: 0.3, ease: expo }}
                  >
                    <Link
                      href={link.href}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-base font-medium transition-colors hover:bg-secondary/60 hover:text-primary ${
                        isActive ? "text-primary bg-primary/5" : "text-muted-foreground"
                      }`}
                    >
                      {Icon && <Icon className="w-4 h-4" />}
                      {link.label}
                    </Link>
                  </motion.div>
                );
              })}

              {/* Report Bug in mobile */}
              <motion.div
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.42, duration: 0.3, ease: expo }}
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
                transition={{ delay: 0.48, duration: 0.3, ease: expo }}
                className="pt-2 flex flex-col gap-2"
              >
                {isAdminLoggedIn ? (
                  <>
                    <a href="/tools/dashboard" target="_blank" rel="noopener noreferrer" className="w-full">
                      <Button variant="outline" className="w-full font-semibold gap-2">
                        <LayoutDashboard className="w-4 h-4" /> Tools Dashboard
                      </Button>
                    </a>
                    <a href="/admin/" className="w-full">
                      <Button variant="outline" className="w-full font-semibold gap-2 border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300">
                        <Shield className="w-4 h-4" /> Admin Panel
                      </Button>
                    </a>
                  </>
                ) : user ? (
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
                {!user && !isAdmin && (
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
