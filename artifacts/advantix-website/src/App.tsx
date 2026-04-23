import React, { lazy, Suspense, useEffect, useState } from "react";
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

function CountdownTimer({ targetMs }: { targetMs: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, targetMs - now);
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  const Box = ({ value, label }: { value: number; label: string }) => (
    <div className="flex flex-col items-center">
      <div className="min-w-[68px] sm:min-w-[88px] px-3 py-3 sm:py-4 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/30 backdrop-blur-sm shadow-lg shadow-primary/5">
        <div className="text-3xl sm:text-5xl font-bold tabular-nums bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-transparent">
          {String(value).padStart(2, "0")}
        </div>
      </div>
      <div className="text-[10px] sm:text-xs uppercase tracking-widest text-muted-foreground mt-2 font-medium">{label}</div>
    </div>
  );
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3">
      <Box value={days} label="Days" />
      <Box value={hours} label="Hours" />
      <Box value={minutes} label="Minutes" />
      <Box value={seconds} label="Seconds" />
    </div>
  );
}

const PASS_STORAGE_KEY = "advantix_maintenance_pass";

function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data } = useQuery<{ maintenanceMode: boolean; maintenanceMessage: string; siteName: string; maintenanceLiveAt: string; maintenancePassEnabled: boolean }>({
    queryKey: ["general-settings"],
    queryFn: () => fetch("/api/settings/general").then(r => r.ok ? r.json() : null),
    staleTime: 60_000,
    retry: false,
  });

  /* Re-verify any locally stored pass against the server on each load so
     admins can revoke a code at any time by changing it. */
  const storedCode = typeof window !== "undefined" ? localStorage.getItem(PASS_STORAGE_KEY) || "" : "";
  const { data: passOk } = useQuery<{ ok: boolean }>({
    queryKey: ["maintenance-pass-revalidate", storedCode],
    queryFn: () => storedCode
      ? fetch("/api/maintenance/pass-verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: storedCode }),
        }).then(async r => {
          const j = await r.json().catch(() => ({ ok: false }));
          if (!r.ok || !j.ok) localStorage.removeItem(PASS_STORAGE_KEY);
          return j;
        })
      : Promise.resolve({ ok: false }),
    enabled: !!storedCode && !!data?.maintenanceMode,
    staleTime: 60_000,
    retry: false,
  });

  const [showPassModal, setShowPassModal] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [passError, setPassError] = useState("");
  const [passSubmitting, setPassSubmitting] = useState(false);

  const submitPass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passInput.trim()) return;
    setPassSubmitting(true);
    setPassError("");
    try {
      const r = await fetch("/api/maintenance/pass-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: passInput.trim() }),
      });
      const j = await r.json().catch(() => ({ ok: false, error: "Network error" }));
      if (r.ok && j.ok) {
        localStorage.setItem(PASS_STORAGE_KEY, passInput.trim());
        window.location.reload();
      } else {
        setPassError(j.error || "Invalid code");
      }
    } catch {
      setPassError("Could not verify — try again");
    } finally {
      setPassSubmitting(false);
    }
  };

  const path = location.split("?")[0].replace(/\/$/, "") || "/";
  const bypass = path === "/login" || path === "/reset-password" || passOk?.ok === true;
  if (data?.maintenanceMode && !bypass) {
    const siteName = data.siteName || "Advantix";
    const liveTs = data.maintenanceLiveAt ? new Date(data.maintenanceLiveAt).getTime() : 0;
    const hasCountdown = liveTs > 0 && !Number.isNaN(liveTs) && liveTs > Date.now();
    const liveDate = liveTs > 0 ? new Date(liveTs) : null;
    return (
      <div className="relative min-h-screen flex items-center justify-center bg-background px-6 py-12 overflow-hidden">
        {/* glow background */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-primary/15 blur-3xl" />
          <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-amber-500/10 blur-3xl" />
        </div>

        <div className="max-w-2xl w-full text-center space-y-7">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs font-semibold uppercase tracking-widest text-amber-400">
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" /></span>
            Under Maintenance
          </div>

          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-foreground">
            We're <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">Building</span> Something Better
          </h1>

          <p className="text-base sm:text-lg text-muted-foreground whitespace-pre-line max-w-xl mx-auto leading-relaxed">
            {data.maintenanceMessage || `${siteName} is performing scheduled maintenance. We'll be back shortly.`}
          </p>

          {hasCountdown && (
            <div className="space-y-4 pt-4">
              <p className="text-sm text-muted-foreground">
                {siteName} will be live in
              </p>
              <CountdownTimer targetMs={liveTs} />
              {liveDate && (
                <p className="text-xs text-muted-foreground/80 pt-2">
                  Estimated live time:{" "}
                  <span className="text-foreground/90 font-medium">
                    {liveDate.toLocaleString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </p>
              )}
            </div>
          )}

          {liveTs > 0 && !hasCountdown && (
            <p className="text-sm text-primary font-medium pt-2">We should be back online any moment now — try refreshing.</p>
          )}

          <div className="pt-6 text-xs text-muted-foreground/70">
            Thanks for your patience. — Team {siteName}
          </div>

          {/* Only show the pass button when the server actually has a code set
              — verify endpoint will respond with "disabled" otherwise, leading
              to a dead-end UX. The probe call below is cheap and cached. */}
          {data.maintenancePassEnabled && (
            <div className="pt-2">
              <button
                onClick={() => { setShowPassModal(true); setPassError(""); setPassInput(""); }}
                className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-4 decoration-dotted"
              >
                Do you have a priority pass?
              </button>
            </div>
          )}
        </div>

        {showPassModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" onClick={() => setShowPassModal(false)}>
            <form
              onSubmit={submitPass}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-5"
            >
              <div className="space-y-1.5">
                <h2 className="text-lg font-semibold text-foreground">Priority Pass</h2>
                <p className="text-xs text-muted-foreground">Enter your access code to view the site.</p>
              </div>
              <input
                type="text"
                autoFocus
                value={passInput}
                onChange={e => setPassInput(e.target.value)}
                placeholder="Enter code"
                className="w-full px-4 py-3 bg-secondary/50 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 tracking-wider"
                autoComplete="off"
              />
              {passError && (
                <p className="text-xs text-red-400 font-medium">{passError}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowPassModal(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground bg-secondary/40 hover:bg-secondary/60 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passSubmitting || !passInput.trim()}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {passSubmitting ? "Checking…" : "Unlock"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }
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
const FinancePage = lazy(() => import("@/pages/FinancePage"));
const WhatsAppPage = lazy(() => import("@/pages/WhatsAppPage"));
const ProjectManagement = lazy(() => import("@/pages/tools/ProjectManagement"));
const WorkspaceInvitePage = lazy(() => import("@/pages/tools/WorkspaceInvite").then(m => ({ default: m.WorkspaceEmailInvite })));
const WorkspaceQuickJoinPage = lazy(() => import("@/pages/tools/WorkspaceInvite").then(m => ({ default: m.WorkspaceQuickJoin })));
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

function TermsRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate("/pages/terms-of-service", { replace: true }); }, [navigate]);
  return null;
}

function DataDeletionRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate("/pages/data-deletion", { replace: true }); }, [navigate]);
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
              <Route path="/tools/finance">
                <ToolGuard slug="finance"><FinancePage /></ToolGuard>
              </Route>
              <Route path="/tools/project-management">
                <ToolGuard slug="project-management"><ProjectManagement /></ToolGuard>
              </Route>
              <Route path="/tools/project-management/projects/:id">
                <ToolGuard slug="project-management"><ProjectManagement /></ToolGuard>
              </Route>
              <Route path="/tools/project-management/members">
                <ToolGuard slug="project-management"><ProjectManagement /></ToolGuard>
              </Route>
              <Route path="/tools/project-management/telegram">
                <ToolGuard slug="project-management"><ProjectManagement /></ToolGuard>
              </Route>
              <Route path="/tools/workspace/join/:code"><WorkspaceQuickJoinPage /></Route>
              <Route path="/tools/workspace/invite/:token"><WorkspaceInvitePage /></Route>
              <Route path="/tools/whatsapp">
                <ToolGuard slug="whatsapp"><WhatsAppPage /></ToolGuard>
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
              <Route path="/terms-of-service" component={TermsRedirect} />
              <Route path="/data-deletion" component={DataDeletionRedirect} />
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
              <MaintenanceGate>
                <Router />
                <EmailCaptureModal />
                <PushNotificationPrompt />
                <StickyCTABar />
              </MaintenanceGate>
            </WouterRouter>
          </ToolsUserProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
