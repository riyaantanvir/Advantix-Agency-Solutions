import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";

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
const Integrations = lazy(() => import("./pages/Integrations"));
const Tools = lazy(() => import("./pages/Tools"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogEditor = lazy(() => import("./pages/BlogEditor"));
const BugReports = lazy(() => import("./pages/BugReports"));
const WebsiteAnalytics = lazy(() => import("./pages/WebsiteAnalytics"));
const MarketingReports = lazy(() => import("./pages/MarketingReports"));
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

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-7 h-7 animate-spin text-primary" />
    </div>
  );
}

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AdminLayout>
        <Suspense fallback={<PageLoader />}>
          {children}
        </Suspense>
      </AdminLayout>
    </ProtectedRoute>
  );
}

function Router() {
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

      <Route path="/user-management">
        <ProtectedLayout><UserManagement /></ProtectedLayout>
      </Route>

      <Route path="/manage-ai">
        <ProtectedLayout><ManageAI /></ProtectedLayout>
      </Route>

      <Route path="/integrations">
        <ProtectedLayout><Integrations /></ProtectedLayout>
      </Route>

      <Route path="/tasks">
        <ProtectedLayout><Tasks /></ProtectedLayout>
      </Route>

      <Route path="/notifications">
        <ProtectedLayout><Notifications /></ProtectedLayout>
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

      <Route path="/website-analytics">
        <ProtectedLayout><WebsiteAnalytics /></ProtectedLayout>
      </Route>

      <Route path="/marketing-reports">
        <ProtectedLayout><MarketingReports /></ProtectedLayout>
      </Route>

      <Route>
        <ProtectedLayout><NotFound /></ProtectedLayout>
      </Route>
    </Switch>
  );
}

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
