import React, { lazy, Suspense, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { ToolsUserProvider, useToolsUser } from "@/context/ToolsUserContext";
import { PageTracker } from "@/components/PageTracker";
import { PushNotificationPrompt } from "@/components/PushNotificationPrompt";
import { EmailCaptureModal } from "@/components/EmailCaptureModal";
import { StickyCTABar } from "@/components/StickyCTABar";

function ToolGuard({ slug, children }: { slug: string; children: React.ReactNode }) {
  const { user, allowedTools, loading } = useToolsUser();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (allowedTools && !allowedTools.includes(slug)) {
      navigate("/tools");
    }
  }, [user, allowedTools, loading, slug, navigate]);

  if (loading) return null;
  if (user && allowedTools && !allowedTools.includes(slug)) return null;
  return <>{children}</>;
}

function GoogleAnalytics() {
  const { data } = useQuery<{ googleAnalyticsId: string }>({
    queryKey: ["general-settings"],
    queryFn: () => fetch("/api/settings/general").then(r => r.ok ? r.json() : null),
    staleTime: 5 * 60_000,
    retry: false,
  });
  useEffect(() => {
    const id = data?.googleAnalyticsId?.trim();
    if (!id || document.getElementById("ga4-script")) return;
    const s1 = document.createElement("script");
    s1.id = "ga4-script";
    s1.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    s1.async = true;
    document.head.appendChild(s1);
    const s2 = document.createElement("script");
    s2.id = "ga4-init";
    s2.textContent = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');`;
    document.head.appendChild(s2);
  }, [data?.googleAnalyticsId]);
  return null;
}

const Home = lazy(() => import("@/pages/Home"));
const Blog = lazy(() => import("@/pages/Blog"));
const BlogPost = lazy(() => import("@/pages/BlogPost"));
const Services = lazy(() => import("@/pages/Services"));
const ServiceDetail = lazy(() => import("@/pages/ServiceDetail"));
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
const PdfAudio = lazy(() => import("@/pages/PdfAudio"));
const AssistantPage = lazy(() => import("@/pages/AssistantPage"));
const SocialMediaTool = lazy(() => import("@/pages/SocialMediaTool"));
const FacebookManager = lazy(() => import("@/pages/FacebookManager"));
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

function PrivacyPolicyRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate("/pages/privacy-policy", { replace: true }); }, [navigate]);
  return null;
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
              <Route path="/services/:id" component={ServiceDetail} />
              <Route path="/services" component={Services} />
              <Route path="/portfolio" component={Portfolio} />
              <Route path="/team" component={Team} />
              <Route path="/contact" component={Contact} />
              <Route path="/login" component={Login} />
              <Route path="/reset-password" component={ResetPassword} />
              <Route path="/tools/pdf-audio">
                <ToolGuard slug="pdf-audio"><PdfAudio /></ToolGuard>
              </Route>
              <Route path="/tools/assistant">
                <ToolGuard slug="advantix-assistant"><AssistantPage /></ToolGuard>
              </Route>
              <Route path="/tools/social-media">
                <ToolGuard slug="social-media-manager"><SocialMediaTool /></ToolGuard>
              </Route>
              <Route path="/tools/facebook">
                <ToolGuard slug="facebook-auto-reply"><FacebookManager /></ToolGuard>
              </Route>
              <Route path="/tools" component={Tools} />
              <Route path="/tools/dashboard" component={ToolsDashboard} />
              <Route path="/tools/url-shortener">
                <ToolGuard slug="url-shortener"><UrlShortener /></ToolGuard>
              </Route>
              <Route path="/tools/screen-recorder">
                <ToolGuard slug="screen-recorder"><ScreenRecorder /></ToolGuard>
              </Route>
              <Route path="/tools/war-update" component={WarUpdate} />
              <Route path="/tools/settings" component={AccountSettings} />
              <Route path="/careers" component={Careers} />
              <Route path="/contests/:id" component={ContestDetail} />
              <Route path="/pages/:slug" component={CustomPage} />
              <Route path="/favorites" component={Favorites} />
              <Route path="/privacy-policy" component={PrivacyPolicyRedirect} />
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
              <GoogleAnalytics />
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
