import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import NotFound from "@/pages/not-found";

import Home from "@/pages/Home";
import Portfolio from "@/pages/Portfolio";
import Team from "@/pages/Team";
import Contact from "@/pages/Contact";
import Tools from "@/pages/Tools";
import UrlShortener from "@/pages/UrlShortener";
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
            <Route path="/portfolio" component={Portfolio} />
            <Route path="/team" component={Team} />
            <Route path="/contact" component={Contact} />
            <Route path="/tools" component={Tools} />
            <Route path="/tools/url-shortener" component={UrlShortener} />
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
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
