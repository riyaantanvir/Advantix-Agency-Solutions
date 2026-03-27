import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, Link } from "wouter";
import { Lock, Mail, User, Eye, EyeOff, ArrowLeft, Loader2, Shield, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toolsApi } from "@/lib/toolsApi";
import { useToolsUser } from "@/context/ToolsUserContext";

const expo = [0.22, 1, 0.36, 1] as const;

const BASE = "/api";

async function adminLogin(username: string, password: string): Promise<{ success: boolean; username: string }> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Invalid credentials");
  return data;
}

export default function Login() {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [signupPass, setSignupPass] = useState("");
  const [showSignupPass, setShowSignupPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [, navigate] = useLocation();
  const { setUser } = useToolsUser();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Try tool user login first (email)
      try {
        const { user } = await toolsApi.auth.login(identifier.trim(), password);
        setUser(user);
        navigate("/tools/dashboard");
        return;
      } catch {
        // Not a tool user — try admin
      }

      // Try admin login
      try {
        await adminLogin(identifier.trim(), password);
        // Admin success — redirect to admin panel
        window.location.href = "/admin/";
        return;
      } catch {
        // Neither
      }

      setError("Invalid email/username or password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { user } = await toolsApi.auth.register(name.trim(), email.trim(), signupPass);
      setUser(user);
      navigate("/tools/dashboard");
    } catch (err: any) {
      setError(err.message ?? "Could not create account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-16 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: expo }}
        className="w-full max-w-md relative z-10"
      >
        {/* Back to home */}
        <Link href="/">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors mb-8">
            <ArrowLeft className="w-4 h-4" /> Back to home
          </button>
        </Link>

        {/* Card */}
        <div className="bg-card border border-border/60 rounded-3xl p-8 shadow-2xl shadow-black/20">
          {/* Logo + title */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-display font-extrabold">Advantix Portal</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {tab === "signin" ? "Sign in to your account or admin panel" : "Create a new user account"}
            </p>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-6 bg-secondary/40 p-1 rounded-xl">
            {[
              { key: "signin", label: "Sign In" },
              { key: "signup", label: "Sign Up" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { setTab(key as "signin" | "signup"); setError(""); }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  tab === key ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {tab === "signin" ? (
              <motion.form
                key="signin"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.25, ease: expo }}
                onSubmit={handleSignIn}
                className="space-y-4"
              >
                <div>
                  <Label className="mb-1.5 block text-sm font-medium">Email or Username</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="you@example.com or admin"
                      value={identifier}
                      onChange={e => setIdentifier(e.target.value)}
                      className="pl-10 h-11"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <Label className="mb-1.5 block text-sm font-medium">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type={showPass ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="pl-10 pr-10 h-11"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="text-destructive text-sm bg-destructive/10 px-4 py-3 rounded-xl leading-snug">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={loading}>
                  {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing in…</> : "Sign In"}
                </Button>

                {/* Info pills */}
                <div className="pt-2 flex flex-wrap gap-2 justify-center">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/50 rounded-full px-3 py-1">
                    <Wrench className="w-3 h-3" /> Email → Tools Dashboard
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/50 rounded-full px-3 py-1">
                    <Shield className="w-3 h-3" /> Username → Admin Panel
                  </div>
                </div>
              </motion.form>
            ) : (
              <motion.form
                key="signup"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.25, ease: expo }}
                onSubmit={handleSignUp}
                className="space-y-4"
              >
                <div>
                  <Label className="mb-1.5 block text-sm font-medium">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Your name"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="pl-10 h-11"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <Label className="mb-1.5 block text-sm font-medium">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="pl-10 h-11"
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label className="mb-1.5 block text-sm font-medium">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type={showSignupPass ? "text" : "password"}
                      placeholder="Min. 6 characters"
                      value={signupPass}
                      onChange={e => setSignupPass(e.target.value)}
                      className="pl-10 pr-10 h-11"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPass(!showSignupPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showSignupPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="text-destructive text-sm bg-destructive/10 px-4 py-3 rounded-xl leading-snug">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={loading}>
                  {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating account…</> : "Create Account"}
                </Button>

                <p className="text-center text-xs text-muted-foreground pt-1">
                  This creates a <strong>user account</strong> for Advantix Tools.
                </p>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          By signing in, you agree to our terms of service.
        </p>
      </motion.div>
    </div>
  );
}
