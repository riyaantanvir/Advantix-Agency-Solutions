import { Component, lazy, Suspense, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminLayout } from "./components/layout/AdminLayout";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Contacts = lazy(() => import("./pages/Contacts"));
const Leads = lazy(() => import("./pages/Leads"));
const Portfolio = lazy(() => import("./pages/Portfolio"));
const Services = lazy(() => import("./pages/Services"));
const Team = lazy(() => import("./pages/Team"));
const AssistantRequests = lazy(() => import("./pages/AssistantRequests"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const ManageAI = lazy(() => import("./pages/ManageAI"));
const ManageAssistant = lazy(() => import("./pages/ManageAssistant"));
const Integrations = lazy(() => import("./pages/Integrations"));
const Tools = lazy(() => import("./pages/Tools"));
const Tasks = lazy(() => import("./pages/Tasks"));
const TaskDetail = lazy(() => import("./pages/TaskDetail"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogEditor = lazy(() => import("./pages/BlogEditor"));
const BugReports = lazy(() => import("./pages/BugReports"));
const WebsiteAnalytics = lazy(() => import("./pages/WebsiteAnalytics"));
const MarketingReports = lazy(() => import("./pages/MarketingReports"));
const PushNotifications = lazy(() => import("./pages/PushNotifications"));
const EmailSubscribers  = lazy(() => import("./pages/EmailSubscribers"));
const SiteSettings      = lazy(() => import("./pages/SiteSettings"));
const UserPermission    = lazy(() => import("./pages/UserPermission"));
const ContentPlanner    = lazy(() => import("./pages/ContentPlanner"));
const EmailMarketing    = lazy(() => import("./pages/EmailMarketing"));
const InboxPage         = lazy(() => import("./pages/InboxPage"));
const Contests          = lazy(() => import("./pages/Contests"));
const AllProjects       = lazy(() => import("./pages/AllProjects"));
const ProjectDetail     = lazy(() => import("./pages/ProjectDetail"));
const MyTasksPage       = lazy(() => import("./pages/MyTasksPage"));
const AssignedToMePage  = lazy(() => import("./pages/AssignedToMePage"));
const TodayOverduePage  = lazy(() => import("./pages/TodayOverduePage"));
const PMRepliesPage     = lazy(() => import("./pages/PMRepliesPage"));
const AssignedCommentsPage = lazy(() => import("./pages/AssignedCommentsPage"));
const UserWorkspaces    = lazy(() => import("./pages/UserWorkspaces"));
const SocialMedia = lazy(() => import("./pages/SocialMedia"));
const SocialMediaSchedule = lazy(() => import("./pages/SocialMediaSchedule"));
const SocialMediaSettings = lazy(() => import("./pages/SocialMediaSettings"));
const FacebookSettings = lazy(() => import("./pages/FacebookSettings"));
const CustomPages = lazy(() => import("./pages/CustomPages"));
const CustomPageEditor = lazy(() => import("./pages/CustomPageEditor"));
const InvoiceGenerator = lazy(() => import("./pages/InvoiceGenerator"));
const PostComposer  = lazy(() => import("./pages/PostComposer"));
const ImageStudio   = lazy(() => import("./pages/ImageStudio"));
const AssistantUsage = lazy(() => import("./pages/AssistantUsage"));
const AdminAssistant = lazy(() => import("./pages/AdminAssistant"));
const PersonalGPT = lazy(() => import("./pages/PersonalGPT"));
const NotFound = lazy(() => import("./pages/not-found"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
    },
  },
});

/* ── Error Boundary ──────────────────────────────────────────────────────── */
interface EBState { hasError: boolean; error: Error | null }

class PageErrorBoundary extends Component<{ children: React.ReactNode }, EBState> {
  state: EBState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, error };
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-destructive" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            This page ran into an unexpected error. Try refreshing or clicking below to retry.
          </p>
          {this.state.error && (
            <p className="text-xs text-destructive/70 font-mono mt-3 bg-destructive/5 rounded-lg px-3 py-2 max-w-md mx-auto break-words">
              {this.state.error.message}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="sm" onClick={this.reset}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      </div>
    );
  }
}

/* ── Loaders ─────────────────────────────────────────────────────────────── */
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-7 h-7 animate-spin text-primary" />
    </div>
  );
}

/* ── Protected layout wrapper ────────────────────────────────────────────── */
function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AdminLayout>
        <PageErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            {children}
          </Suspense>
        </PageErrorBoundary>
      </AdminLayout>
    </ProtectedRoute>
  );
}

/* ── Router ──────────────────────────────────────────────────────────────── */
function Router() {
  const [, setLocation] = useLocation();

  // Any page that gets a 401 from an API call fires "admin-unauthorized".
  // We catch it here (inside Wouter context) and navigate to /login within
  // the SPA — no full-page reload, no session race condition.
  useEffect(() => {
    function handleUnauthorized() {
      queryClient.removeQueries({ queryKey: ["auth-me"] });
      queryClient.clear();
      setLocation("/login");
    }
    window.addEventListener("admin-unauthorized", handleUnauthorized);
    return () => window.removeEventListener("admin-unauthorized", handleUnauthorized);
  }, [setLocation]);

  return (
    <Switch>
      <Route path="/login">
        <Suspense fallback={null}>
          <Login />
        </Suspense>
      </Route>

      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>

      <Route path="/dashboard">
        <ProtectedLayout><Dashboard /></ProtectedLayout>
      </Route>

      <Route path="/contacts">
        <ProtectedLayout><Contacts /></ProtectedLayout>
      </Route>

      <Route path="/leads">
        <ProtectedLayout><Leads /></ProtectedLayout>
      </Route>

      <Route path="/portfolio">
        <ProtectedLayout><Portfolio /></ProtectedLayout>
      </Route>

      <Route path="/services">
        <ProtectedLayout><Services /></ProtectedLayout>
      </Route>

      <Route path="/team">
        <ProtectedLayout><Team /></ProtectedLayout>
      </Route>

      <Route path="/assistant-requests">
        <ProtectedLayout><AssistantRequests /></ProtectedLayout>
      </Route>

      <Route path="/assistant-usage">
        <ProtectedLayout><AssistantUsage /></ProtectedLayout>
      </Route>

      <Route path="/user-management">
        <ProtectedLayout><UserManagement /></ProtectedLayout>
      </Route>

      <Route path="/manage-ai">
        <ProtectedLayout><ManageAI /></ProtectedLayout>
      </Route>

      <Route path="/manage-assistant">
        <ProtectedLayout><ManageAssistant /></ProtectedLayout>
      </Route>

      <Route path="/integrations">
        <ProtectedLayout><Integrations /></ProtectedLayout>
      </Route>

      <Route path="/tasks/:id">
        <ProtectedLayout><TaskDetail /></ProtectedLayout>
      </Route>

      <Route path="/tasks">
        <ProtectedLayout><Tasks /></ProtectedLayout>
      </Route>

      <Route path="/notifications">
        <ProtectedLayout><Notifications /></ProtectedLayout>
      </Route>

      <Route path="/custom-pages/new">
        <ProtectedLayout><CustomPageEditor /></ProtectedLayout>
      </Route>

      <Route path="/custom-pages/:id/edit">
        <ProtectedLayout><CustomPageEditor /></ProtectedLayout>
      </Route>

      <Route path="/custom-pages">
        <ProtectedLayout><CustomPages /></ProtectedLayout>
      </Route>

      <Route path="/blog/new">
        <ProtectedLayout><BlogEditor /></ProtectedLayout>
      </Route>

      <Route path="/blog/:id/edit">
        <ProtectedLayout><BlogEditor /></ProtectedLayout>
      </Route>

      <Route path="/blog">
        <ProtectedLayout><Blog /></ProtectedLayout>
      </Route>

      <Route path="/tools">
        <ProtectedLayout><Tools /></ProtectedLayout>
      </Route>

      <Route path="/bug-reports">
        <ProtectedLayout><BugReports /></ProtectedLayout>
      </Route>

      <Route path="/social-media/schedule">
        <ProtectedLayout><SocialMediaSchedule /></ProtectedLayout>
      </Route>

      <Route path="/social-media/settings">
        <ProtectedLayout><SocialMediaSettings /></ProtectedLayout>
      </Route>

      <Route path="/facebook-settings">
        <ProtectedLayout><FacebookSettings /></ProtectedLayout>
      </Route>

      <Route path="/social-media">
        <ProtectedLayout><SocialMedia /></ProtectedLayout>
      </Route>

      <Route path="/website-analytics">
        <ProtectedLayout><WebsiteAnalytics /></ProtectedLayout>
      </Route>

      <Route path="/marketing-reports">
        <ProtectedLayout><MarketingReports /></ProtectedLayout>
      </Route>

      <Route path="/push-notifications">
        <ProtectedLayout><PushNotifications /></ProtectedLayout>
      </Route>

      <Route path="/email-subscribers">
        <ProtectedLayout><EmailSubscribers /></ProtectedLayout>
      </Route>

      <Route path="/site-settings">
        <ProtectedLayout><SiteSettings /></ProtectedLayout>
      </Route>

      <Route path="/user-permission">
        <ProtectedLayout><UserPermission /></ProtectedLayout>
      </Route>

      <Route path="/content-planner">
        <ProtectedLayout><ContentPlanner /></ProtectedLayout>
      </Route>

      <Route path="/inbox">
        <ProtectedLayout><InboxPage /></ProtectedLayout>
      </Route>
      <Route path="/email-marketing">
        <ProtectedLayout><EmailMarketing /></ProtectedLayout>
      </Route>

      <Route path="/contests">
        <ProtectedLayout><Contests /></ProtectedLayout>
      </Route>

      <Route path="/pm/all-projects">
        <ProtectedLayout><AllProjects /></ProtectedLayout>
      </Route>

      <Route path="/pm/user-workspaces">
        <ProtectedLayout><UserWorkspaces /></ProtectedLayout>
      </Route>

      <Route path="/pm/projects/:id">
        <ProtectedLayout><ProjectDetail /></ProtectedLayout>
      </Route>

      <Route path="/pm/my-tasks">
        <ProtectedLayout><MyTasksPage /></ProtectedLayout>
      </Route>

      <Route path="/pm/assigned-to-me">
        <ProtectedLayout><AssignedToMePage /></ProtectedLayout>
      </Route>

      <Route path="/pm/today-overdue">
        <ProtectedLayout><TodayOverduePage /></ProtectedLayout>
      </Route>

      <Route path="/pm/replies">
        <ProtectedLayout><PMRepliesPage /></ProtectedLayout>
      </Route>

      <Route path="/pm/assigned-comments">
        <ProtectedLayout><AssignedCommentsPage /></ProtectedLayout>
      </Route>

      <Route path="/personal-gpt">
        <ProtectedLayout><PersonalGPT /></ProtectedLayout>
      </Route>

      <Route path="/admin-assistant">
        <ProtectedLayout><AdminAssistant /></ProtectedLayout>
      </Route>

      <Route path="/finance/invoice-generator">
        <ProtectedLayout><InvoiceGenerator /></ProtectedLayout>
      </Route>

      <Route path="/content/post-composer">
        <ProtectedLayout><PostComposer /></ProtectedLayout>
      </Route>

      <Route path="/content/image-studio">
        <ProtectedLayout><ImageStudio /></ProtectedLayout>
      </Route>

      <Route>
        <ProtectedLayout><NotFound /></ProtectedLayout>
      </Route>
    </Switch>
  );
}

/* ── App ─────────────────────────────────────────────────────────────────── */
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
