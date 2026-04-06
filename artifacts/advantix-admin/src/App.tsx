import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Contacts from "./pages/Contacts";
import Leads from "./pages/Leads";
import Portfolio from "./pages/Portfolio";
import Services from "./pages/Services";
import Team from "./pages/Team";
import AssistantRequests from "./pages/AssistantRequests";
import UserManagement from "./pages/UserManagement";
import ManageAI from "./pages/ManageAI";
import Integrations from "./pages/Integrations";
import Tools from "./pages/Tools";
import Tasks from "./pages/Tasks";
import Notifications from "./pages/Notifications";
import Blog from "./pages/Blog";
import BlogEditor from "./pages/BlogEditor";

import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminLayout } from "./components/layout/AdminLayout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30 * 1000,
    },
  },
});

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AdminLayout>{children}</AdminLayout>
    </ProtectedRoute>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      
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
