import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import ChatPage from "@/pages/ChatPage";
import AuthPage from "@/pages/AuthPage";
import { UserProvider, useUser } from "@/context/UserContext";
import { ThemeProvider } from "@/context/ThemeContext";

const queryClient = new QueryClient();

function AppRouter() {
  const { user, loading } = useUser();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/" component={user ? ChatPage : AuthPage} />
      <Route path="/auth" component={AuthPage} />
      <Route component={user ? ChatPage : AuthPage} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <UserProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRouter />
          </WouterRouter>
          <Toaster />
        </UserProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
