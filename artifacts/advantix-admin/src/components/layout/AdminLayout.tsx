import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Mail,
  TrendingUp,
  LogOut,
  Menu,
  X,
  Package,
  HeadphonesIcon,
  UserCog,
  Sparkles,
  Plug,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const navLinks = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/tools", label: "Advantix Tools", icon: Zap },
  { path: "/contacts", label: "Contacts", icon: Mail },
  { path: "/leads", label: "Leads", icon: TrendingUp },
  { path: "/assistant-requests", label: "Assistant Requests", icon: HeadphonesIcon },
  { path: "/manage-ai", label: "Manage Advantix AI", icon: Sparkles },
  { path: "/integrations", label: "Integrations", icon: Plug },
  { path: "/portfolio", label: "Portfolio", icon: Briefcase },
  { path: "/services", label: "Services", icon: Package },
  { path: "/team", label: "Team", icon: Users },
  { path: "/user-management", label: "User Management", icon: UserCog },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const logoutMutation = useLogout();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        window.location.href = "/";
      },
      onError: () => toast({ variant: "destructive", title: "Error", description: "Could not log out. Please try again." }),
    });
  };

  const SidebarContent = () => (
    <>
      <div className="p-6">
        <div className="flex items-center gap-3">
          <img src="/images/logo-icon.svg" alt="Advantix" className="w-8 h-8 object-contain" />
          <span className="font-display font-bold text-xl tracking-tight text-foreground">Advantix</span>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-4">
        {navLinks.map((link) => {
          const isActive = location === link.path;
          const Icon = link.icon;
          return (
            <Link 
              key={link.path} 
              href={link.path}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                isActive 
                  ? "bg-primary/10 text-primary font-semibold" 
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground font-medium"
              }`}
            >
              <Icon className={`w-5 h-5 transition-colors ${isActive ? "text-primary" : "group-hover:text-foreground"}`} />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 mt-auto">
        <button
          onClick={handleLogout}
          disabled={logoutMutation.isPending}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors font-medium group"
        >
          <LogOut className="w-5 h-5 group-hover:text-destructive transition-colors" />
          {logoutMutation.isPending ? "Logging out..." : "Logout"}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border/50 bg-card/50 backdrop-blur-xl fixed inset-y-0 z-20">
        <SidebarContent />
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-16 border-b border-border/50 bg-background/80 backdrop-blur-xl z-30 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <img src="/images/logo-icon.svg" alt="Advantix" className="w-8 h-8 object-contain" />
          <span className="font-display font-bold text-lg">Advantix</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(true)}>
          <Menu className="w-6 h-6 text-foreground" />
        </Button>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 bg-card border-r border-border z-50 flex flex-col md:hidden"
            >
              <div className="absolute right-4 top-4">
                <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 md:ml-64 pt-16 md:pt-0">
        <div className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {children}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
