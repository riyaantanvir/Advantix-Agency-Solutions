import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useLogout, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Settings2,
  CalendarDays,
  ChevronDown,
  Inbox,
  Trophy,
  FolderKanban,
  Reply,
  MessageSquareMore,
  ClipboardList,
  UserCheck,
  CalendarClock,
  Globe,
  Share2,
  Landmark,
  FileText,
  PenTool,
  ImagePlay,
  Wrench,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type NavLink = { path: string; label: string; icon: React.ComponentType<{ className?: string }>; href?: string };

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
  { path: "/tools-dashboard", label: "Tools Dashboard", icon: Wrench, href: "/tools/dashboard" },
  {
    label: "Management",
    icon: CheckSquare,
    children: [
      { path: "/bug-reports", label: "Bug Reports", icon: Bug },
      { path: "/contacts", label: "Contacts", icon: Mail },
      { path: "/leads", label: "Leads", icon: TrendingUp },
      { path: "/contests", label: "Contests", icon: Trophy },
    ],
  },
  {
    label: "Project Management",
    icon: FolderKanban,
    children: [
      { path: "/pm/all-projects", label: "All Projects", icon: FolderKanban },
      { path: "/tasks", label: "Tasks", icon: CheckSquare },
      { path: "/pm/replies", label: "Replies", icon: Reply },
      { path: "/pm/assigned-comments", label: "Assigned Comments", icon: MessageSquareMore },
      { path: "/pm/my-tasks", label: "My Tasks", icon: ClipboardList },
      { path: "/pm/assigned-to-me", label: "Assigned to me", icon: UserCheck },
      { path: "/pm/today-overdue", label: "Today & Overdue", icon: CalendarClock },
    ],
  },
  {
    label: "Mail Management",
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
    label: "Content Management",
    icon: BookOpen,
    children: [
      { path: "/blog", label: "Blog", icon: BookOpen },
      { path: "/portfolio", label: "Portfolio", icon: Briefcase },
      { path: "/services", label: "Services", icon: Package },
      { path: "/team", label: "Team", icon: Users },
    ],
  },
  {
    label: "AD Social Media",
    icon: Share2,
    children: [
      { path: "/social-media", label: "Overview", icon: Share2 },
      { path: "/social-media/schedule", label: "Schedule Post", icon: CalendarDays },
      { path: "/social-media/settings", label: "AD SMM Settings", icon: Settings2 },
    ],
  },
  { path: "/website-analytics", label: "Website Analytics", icon: BarChart2 },
  {
    label: "Generate Content",
    icon: Sparkles,
    children: [
      { path: "/content/post-composer",  label: "Post Composer",   icon: PenTool   },
      { path: "/content/image-studio",   label: "AI Image Studio", icon: ImagePlay  },
    ],
  },
  {
    label: "Advantix Finance",
    icon: Landmark,
    children: [
      { path: "/finance/invoice-generator", label: "Invoice Generator", icon: FileText },
    ],
  },
  {
    label: "System",
    icon: Settings,
    children: [
      { path: "/tools", label: "Advantix Tools", icon: Zap },
      { path: "/manage-ai", label: "Manage AI", icon: Sparkles },
      { path: "/assistant-requests", label: "Assistant Requests", icon: HeadphonesIcon },
    ],
  },
  {
    label: "Admin Settings",
    icon: Settings2,
    children: [
      { path: "/integrations", label: "Integrations", icon: Plug },
      { path: "/custom-pages", label: "Custom Pages", icon: Globe },
      { path: "/site-settings", label: "Site Settings", icon: Settings },
      { path: "/notifications", label: "Notification Alerts", icon: Bell },
      { path: "/user-management", label: "User Management", icon: UserCog },
      { path: "/user-permission", label: "User Permission", icon: ShieldCheck },
    ],
  },
];

function getGroupDefaultOpen(group: NavGroup, currentPath: string): boolean {
  return group.children.some((child) => currentPath === child.path);
}

function getSeenReplies(): Set<number> {
  try {
    const raw = localStorage.getItem("replies-seen-ids");
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

/* ── Page slug → nav group label / path mapping ────────────────── */
const PAGE_SLUG_MAP: Record<string, { type: "group"; label: string } | { type: "path"; path: string }> = {
  "dashboard":          { type: "path",  path: "/dashboard" },
  "management":         { type: "group", label: "Management" },
  "project-management": { type: "group", label: "Project Management" },
  "marketing":          { type: "group", label: "Mail Management" },
  "content":            { type: "group", label: "Content Management" },
  "social-media":       { type: "group", label: "AD Social Media" },
  "analytics":          { type: "path",  path: "/website-analytics" },
  "generate-content":   { type: "group", label: "Generate Content" },
  "finance":            { type: "group", label: "Advantix Finance" },
  "system":             { type: "group", label: "System" },
  "admin-settings":     { type: "group", label: "Admin Settings" },
};

function filterNavItems(items: NavItem[], allowedSlugs: string[]): NavItem[] {
  return items.filter(item => {
    if (isGroup(item)) {
      const entry = Object.values(PAGE_SLUG_MAP).find(v => v.type === "group" && (v as any).label === item.label);
      if (!entry) return true; // unknown group — keep
      const slug = Object.keys(PAGE_SLUG_MAP).find(k => PAGE_SLUG_MAP[k] === entry);
      return slug ? allowedSlugs.includes(slug) : true;
    } else {
      const entry = Object.entries(PAGE_SLUG_MAP).find(([, v]) => v.type === "path" && (v as any).path === item.path);
      if (!entry) return true; // not a restricted page — keep (e.g. Tools Dashboard external link)
      return allowedSlugs.includes(entry[0]);
    }
  });
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const logoutMutation = useLogout();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: me } = useQuery<{ authenticated: boolean; username: string; isSuperAdmin: boolean }>({
    queryKey: getGetMeQueryKey(), // same key as ProtectedRoute — shares the cached result
    queryFn: async () => {
      const r = await fetch("/api/auth/me", { credentials: "include" });
      if (!r.ok) { const err = new Error("Not authenticated") as any; err.status = r.status; throw err; }
      return r.json();
    },
    staleTime: 60_000,
  });

  const { data: myPerms } = useQuery<{ pages: string[]; isSuperAdmin: boolean }>({
    queryKey: ["my-admin-permissions"],
    queryFn: () => fetch("/api/auth/my-admin-permissions", { credentials: "include" }).then(r => r.ok ? r.json() : null),
    staleTime: 60_000,
    enabled: !!me,
  });

  const allowedNavItems: NavItem[] = (myPerms && !myPerms.isSuperAdmin)
    ? filterNavItems(navItems, myPerms.pages)
    : navItems;

  const { data: replies = [] } = useQuery<{ id: number }[]>({
    queryKey: ["pm-replies"],
    queryFn: () => fetch("/api/admin/pm/replies", { credentials: "include" }).then(r => r.ok ? r.json() : []),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const unreadReplies = replies.filter(r => !getSeenReplies().has(r.id)).length;

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

  const badgeFor = (path: string): number => {
    if (path === "/pm/replies") return unreadReplies;
    return 0;
  };

  const renderLink = (link: NavLink, indent = false) => {
    const isActive = !link.href && location === link.path;
    const Icon = link.icon;
    const badge = badgeFor(link.path);
    const cls = `flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 group text-sm ${
      indent ? "ml-3 pl-5" : ""
    } ${
      isActive
        ? "bg-primary/10 text-primary font-semibold"
        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground font-medium"
    }`;

    if (link.href) {
      return (
        <a key={link.path} href={link.href} target="_blank" rel="noopener noreferrer" className={cls} onClick={() => setIsMobileMenuOpen(false)}>
          <Icon className="w-4 h-4 shrink-0 transition-colors group-hover:text-foreground" />
          <span className="truncate flex-1">{link.label}</span>
        </a>
      );
    }

    return (
      <Link
        key={link.path}
        href={link.path}
        onClick={() => setIsMobileMenuOpen(false)}
        className={cls}
      >
        <Icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? "text-primary" : "group-hover:text-foreground"}`} />
        <span className="truncate flex-1">{link.label}</span>
        {badge > 0 && (
          <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none shrink-0">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </Link>
    );
  };

  const renderGroup = (group: NavGroup) => {
    const isOpen = openGroups[group.label] ?? false;
    const hasActiveChild = group.children.some((c) => location === c.path);
    const Icon = group.icon;
    const totalBadge = group.children.reduce((sum, c) => sum + badgeFor(c.path), 0);
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
          {totalBadge > 0 && !isOpen && (
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none shrink-0">
              {totalBadge > 99 ? "99+" : totalBadge}
            </span>
          )}
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
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 group"
          title="Go to homepage"
        >
          <img src="/images/logo-icon.svg" alt="Advantix" className="w-8 h-8 object-contain group-hover:opacity-80 transition-opacity" />
          <span className="font-display font-bold text-xl tracking-tight text-foreground group-hover:text-primary transition-colors">Advantix</span>
        </a>
      </div>

      <nav className="flex-1 px-3 space-y-1 mt-2 overflow-y-auto">
        {allowedNavItems.map((item) =>
          isGroup(item) ? renderGroup(item) : renderLink(item)
        )}
      </nav>

      <div className="shrink-0 border-t border-border/50">
        {me?.username && (
          <div className="px-4 pt-3 pb-2 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-primary">{me.username[0].toUpperCase()}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{me.username}</p>
              <p className="text-xs text-muted-foreground">{me.isSuperAdmin ? "Super Admin" : "Administrator"}</p>
            </div>
          </div>
        )}
        <div className="px-4 pb-4 space-y-1">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors font-medium group text-sm"
          >
            <Globe className="w-4 h-4 group-hover:text-foreground transition-colors" />
            Homepage
          </a>
          <button
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors font-medium group text-sm"
          >
            <LogOut className="w-4 h-4 group-hover:text-destructive transition-colors" />
            {logoutMutation.isPending ? "Logging out..." : "Logout"}
          </button>
        </div>
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
