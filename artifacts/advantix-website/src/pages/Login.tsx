import { motion } from "framer-motion";
import { useLocation, Link } from "wouter";
import { ArrowLeft, Lock } from "lucide-react";
import { LoginForm, expo } from "@/components/LoginForm";
import { useToolsUser } from "@/context/ToolsUserContext";
import type { ToolUser } from "@/lib/toolsApi";

export default function Login() {
  const [, navigate] = useLocation();
  const { setUser } = useToolsUser();

  const handleUserSuccess = (user: ToolUser) => {
    setUser(user);
    navigate("/tools/dashboard");
  };

  const handleAdminSuccess = () => {
    window.location.href = "/admin/";
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-16 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: expo }}
        className="w-full max-w-md relative z-10"
      >
        <Link href="/">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors mb-8">
            <ArrowLeft className="w-4 h-4" /> Back to home
          </button>
        </Link>

        <div className="bg-card border border-border/60 rounded-3xl p-8 shadow-2xl shadow-black/20">
          <div className="text-center mb-7">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-display font-extrabold">Advantix Portal</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in to your account</p>
          </div>

          <LoginForm
            onUserSuccess={handleUserSuccess}
            onAdminSuccess={handleAdminSuccess}
          />
        </div>
      </motion.div>
    </div>
  );
}
