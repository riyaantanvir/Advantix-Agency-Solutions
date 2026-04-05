import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { ToolsUserProvider } from "@/context/ToolsUserContext";
import NotFound from "@/pages/not-found";

import Home from "@/pages/Home";
import Services from "@/pages/Services";
import Portfolio from "@/pages/Portfolio";
import Team from "@/pages/Team";
import Contact from "@/pages/Contact";
import Tools from "@/pages/Tools";
import UrlShortener from "@/pages/UrlShortener";
import ToolsDashboard from "@/pages/ToolsDashboard";
import ScreenRecorder from "@/pages/ScreenRecorder";
import WarUpdate from "@/pages/WarUpdate";
import AccountSettings from "@/pages/AccountSettings";
import Login from "@/pages/Login";
import Redirect from "@/pages/Redirect";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <Switch>
      {/* Short URL redirect — outside AppLayout (no navbar/footer) */}
      <Route path="/s/:code" component={Redirect} />

      {/* Main app with layout */}
      <Route>
        <AppLayout>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/services" component={Services} />
            <Route path="/portfolio" component={Portfolio} />
            <Route path="/team" component={Team} />
            <Route path="/contact" component={Contact} />
            <Route path="/login" component={Login} />
            <Route path="/tools" component={Tools} />
            <Route path="/tools/dashboard" component={ToolsDashboard} />
            <Route path="/tools/url-shortener" component={UrlShortener} />
            <Route path="/tools/screen-recorder" component={ScreenRecorder} />
            <Route path="/tools/war-update" component={WarUpdate} />
            <Route path="/tools/settings" component={AccountSettings} />
            <Route component={NotFound} />
          </Switch>
        </AppLayout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ToolsUserProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </ToolsUserProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
