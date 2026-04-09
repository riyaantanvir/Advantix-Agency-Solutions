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
  CheckSquare,
  Bell,
  BookOpen,
  Bug,
  BarChart2,
  Megaphone,
  Settings,
  CalendarDays,
  ChevronDown,
  Inbox,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type NavLink = { path: string; label: string; icon: React.ComponentType<{ className?: string }> };

type NavGroup = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: NavLink[];
};

type NavItem = NavLink | NavGroup;

function isGroup(item: NavItem): item is NavGroup {
  return "children" in item;
}

const navItems: NavItem[] = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    label: "Management",
    icon: CheckSquare,
    children: [
      { path: "/tasks", label: "Tasks", icon: CheckSquare },
      { path: "/notifications", label: "Alerts", icon: Bell },
      { path: "/bug-reports", label: "Bug Reports", icon: Bug },
      { path: "/contacts", label: "Contacts", icon: Mail },
      { path: "/leads", label: "Leads", icon: TrendingUp },
      { path: "/user-management", label: "Users", icon: UserCog },
      { path: "/contests", label: "Contests", icon: Trophy },
    ],
  },
  {
    label: "Marketing",
    icon: Megaphone,
    children: [
      { path: "/email-marketing", label: "Email Marketing", icon: Mail },
      { path: "/inbox", label: "Inbox", icon: Inbox },
      { path: "/push-notifications", label: "Push Notifications", icon: Bell },
      { path: "/email-subscribers", label: "Email Subscribers", icon: Mail },
      { path: "/content-planner", label: "Content Planner", icon: CalendarDays },
      { path: "/marketing-reports", label: "Reports", icon: BarChart2 },
    ],
  },
  {
    label: "Content",
    icon: BookOpen,
    children: [
      { path: "/blog", label: "Blog", icon: BookOpen },
      { path: "/portfolio", label: "Portfolio", icon: Briefcase },
      { path: "/services", label: "Services", icon: Package },
      { path: "/team", label: "Team", icon: Users },
    ],
  },
  { path: "/website-analytics", label: "Website Analytics", icon: BarChart2 },
  {
    label: "System",
    icon: Settings,
    children: [
      { path: "/tools", label: "Advantix Tools", icon: Zap },
      { path: "/manage-ai", label: "Manage AI", icon: Sparkles },
      { path: "/integrations", label: "Integrations", icon: Plug },
      { path: "/assistant-requests", label: "Assistant Requests", icon: HeadphonesIcon },
      { path: "/site-settings", label: "Site Settings", icon: Settings },
    ],
  },
];

function getGroupDefaultOpen(group: NavGroup, currentPath: string): boolean {
  return group.children.some((child) => currentPath === child.path);
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const logoutMutation = useLogout();
  const queryClient = useQueryClient();
  const { toast } = useToast();


  const initialOpen: Record<string, boolean> = {};
  navItems.forEach((item) => {
    if (isGroup(item)) {
      initialOpen[item.label] = getGroupDefaultOpen(item, location);
    }
  });
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(initialOpen);

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        window.location.href = "/";
      },
      onError: () => toast({ variant: "destructive", title: "Error", description: "Could not log out. Please try again." }),
    });
  };

  const renderLink = (link: NavLink, indent = false) => {
    const isActive = location === link.path;
    const Icon = link.icon;
    return (
      <Link
        key={link.path}
        href={link.path}
        onClick={() => setIsMobileMenuOpen(false)}
        className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 group text-sm ${
          indent ? "ml-3 pl-5" : ""
        } ${
          isActive
            ? "bg-primary/10 text-primary font-semibold"
            : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground font-medium"
        }`}
      >
        <Icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? "text-primary" : "group-hover:text-foreground"}`} />
        <span className="truncate">{link.label}</span>
      </Link>
    );
  };

  const renderGroup = (group: NavGroup) => {
    const isOpen = openGroups[group.label] ?? false;
    const hasActiveChild = group.children.some((c) => location === c.path);
    const Icon = group.icon;
    return (
      <div key={group.label}>
        <button
          onClick={() => toggleGroup(group.label)}
          className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg transition-all duration-200 group text-sm ${
            hasActiveChild
              ? "text-primary font-semibold"
              : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground font-medium"
          }`}
        >
          <Icon className={`w-4 h-4 shrink-0 transition-colors ${hasActiveChild ? "text-primary" : "group-hover:text-foreground"}`} />
          <span className="truncate flex-1 text-left">{group.label}</span>
          <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
        </button>
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="py-1 space-y-0.5">
                {group.children.map((child) => renderLink(child, true))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const SidebarContent = () => (
    <>
      <div className="p-6 shrink-0">
        <div className="flex items-center gap-3">
          <img src="/images/logo-icon.svg" alt="Advantix" className="w-8 h-8 object-contain" />
          <span className="font-display font-bold text-xl tracking-tight text-foreground">Advantix</span>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-1 mt-2 overflow-y-auto">
        {navItems.map((item) =>
          isGroup(item) ? renderGroup(item) : renderLink(item)
        )}
      </nav>

      <div className="p-4 shrink-0 border-t border-border/50">
        <button
          onClick={handleLogout}
          disabled={logoutMutation.isPending}
          className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors font-medium group text-sm"
        >
          <LogOut className="w-4 h-4 group-hover:text-destructive transition-colors" />
          {logoutMutation.isPending ? "Logging out..." : "Logout"}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden md:flex flex-col w-64 border-r border-border/50 bg-card/50 backdrop-blur-xl fixed inset-y-0 z-20">
        <SidebarContent />
      </aside>

      <header className="md:hidden fixed top-0 left-0 right-0 h-16 border-b border-border/50 bg-background/80 backdrop-blur-xl z-30 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <img src="/images/logo-icon.svg" alt="Advantix" className="w-8 h-8 object-contain" />
          <span className="font-display font-bold text-lg">Advantix</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(true)}>
          <Menu className="w-6 h-6 text-foreground" />
        </Button>
      </header>

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
