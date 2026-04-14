import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { ToolsUserProvider } from "@/context/ToolsUserContext";
import { PageTracker } from "@/components/PageTracker";
import { PushNotificationPrompt } from "@/components/PushNotificationPrompt";
import { EmailCaptureModal } from "@/components/EmailCaptureModal";
import { StickyCTABar } from "@/components/StickyCTABar";

const Home = lazy(() => import("@/pages/Home"));
const Blog = lazy(() => import("@/pages/Blog"));
const BlogPost = lazy(() => import("@/pages/BlogPost"));
const Services = lazy(() => import("@/pages/Services"));
const Portfolio = lazy(() => import("@/pages/Portfolio"));
const Team = lazy(() => import("@/pages/Team"));
const Contact = lazy(() => import("@/pages/Contact"));
const Tools = lazy(() => import("@/pages/Tools"));
const UrlShortener = lazy(() => import("@/pages/UrlShortener"));
const ToolsDashboard = lazy(() => import("@/pages/ToolsDashboard"));
const ScreenRecorder = lazy(() => import("@/pages/ScreenRecorder"));
const WarUpdate = lazy(() => import("@/pages/WarUpdate"));
const AccountSettings = lazy(() => import("@/pages/AccountSettings"));
const Login = lazy(() => import("@/pages/Login"));
const Redirect = lazy(() => import("@/pages/Redirect"));
const Careers = lazy(() => import("@/pages/Careers"));
const ContestDetail = lazy(() => import("@/pages/ContestDetail"));
const CustomPage = lazy(() => import("@/pages/CustomPage"));
const Favorites = lazy(() => import("@/pages/Favorites"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const NotFound = lazy(() => import("@/pages/not-found"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/s/:code">
        <Suspense fallback={null}>
          <Redirect />
        </Suspense>
      </Route>

      <Route>
        <AppLayout>
          <Suspense fallback={<PageLoader />}>
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/blog/:slug" component={BlogPost} />
              <Route path="/blog" component={Blog} />
              <Route path="/services" component={Services} />
              <Route path="/portfolio" component={Portfolio} />
              <Route path="/team" component={Team} />
              <Route path="/contact" component={Contact} />
              <Route path="/login" component={Login} />
              <Route path="/reset-password" component={ResetPassword} />
              <Route path="/tools" component={Tools} />
              <Route path="/tools/dashboard" component={ToolsDashboard} />
              <Route path="/tools/url-shortener" component={UrlShortener} />
              <Route path="/tools/screen-recorder" component={ScreenRecorder} />
              <Route path="/tools/war-update" component={WarUpdate} />
              <Route path="/tools/settings" component={AccountSettings} />
              <Route path="/careers" component={Careers} />
              <Route path="/contests/:id" component={ContestDetail} />
              <Route path="/pages/:slug" component={CustomPage} />
              <Route path="/favorites" component={Favorites} />
              <Route component={NotFound} />
            </Switch>
          </Suspense>
        </AppLayout>
      </Route>
    </Switch>
  );
}

function App() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(
        import.meta.env.BASE_URL + "sw.js"
      ).catch(() => {});
    }
  }, []);

  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ToolsUserProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <PageTracker />
              <Router />
              <EmailCaptureModal />
              <PushNotificationPrompt />
              <StickyCTABar />
            </WouterRouter>
          </ToolsUserProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
