import { motion } from "framer-motion";
import { useLocation, Link } from "wouter";
import { ArrowLeft, Zap } from "lucide-react";
import { LoginForm, expo } from "@/components/LoginForm";
import { useToolsUser } from "@/context/ToolsUserContext";
import type { ToolUser } from "@/lib/toolsApi";
import { useEffect } from "react";
import { useSearch } from "wouter";

export default function Login() {
  const [, navigate] = useLocation();
  const { setUser } = useToolsUser();
  const search = useSearch();

  // Handle Google OAuth error states
  useEffect(() => {
    const params = new URLSearchParams(search);
    const err = params.get("error");
    if (err) {
      // errors are shown via URL param — could toast here
      console.warn("[login] OAuth error:", err);
    }
  }, [search]);

  const handleUserSuccess = (user: ToolUser) => {
    setUser(user);
    navigate("/tools/dashboard");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-16 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-blue-500/3 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: expo }}
        className="w-full max-w-md relative z-10"
      >
        <Link href="/">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors mb-8">
            <ArrowLeft className="w-4 h-4" /> Back to home
          </button>
        </Link>

        <div className="bg-card border border-border/50 rounded-3xl p-8 shadow-2xl shadow-black/20 backdrop-blur-sm">
          {/* Header */}
          <div className="text-center mb-7">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4 ring-1 ring-primary/20">
              <Zap className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-display font-extrabold tracking-tight">Advantix Portal</h1>
            <p className="text-sm text-muted-foreground mt-1">Access your tools &amp; dashboard</p>
          </div>

          <LoginForm onUserSuccess={handleUserSuccess} />
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Admin? Go to{" "}
          <a href="/admin/" className="text-muted-foreground/70 hover:text-foreground underline underline-offset-2 transition-colors">
            /admin
          </a>
        </p>
      </motion.div>
    </div>
  );
}
