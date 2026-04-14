import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Mail, User, Eye, EyeOff, Loader2, ArrowLeft, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toolsApi, type ToolUser } from "@/lib/toolsApi";
import { useQuery } from "@tanstack/react-query";

export const expo = [0.22, 1, 0.36, 1] as const;

// Google SVG icon
function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

// Cloudflare Turnstile widget (optional — only shown if site key is set)
function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  const siteKey = import.meta.env.VITE_CF_TURNSTILE_SITE_KEY as string | undefined;
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;

    const render = () => {
      if (!containerRef.current) return;
      if (widgetId.current !== null) return;
      if (typeof (window as any).turnstile === "undefined") return;
      widgetId.current = (window as any).turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => onToken(token),
        "expired-callback": () => onToken(""),
        theme: "dark",
        size: "normal",
      });
    };

    if (typeof (window as any).turnstile !== "undefined") {
      render();
    } else {
      const existing = document.querySelector('script[src*="turnstile"]');
      if (!existing) {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
        script.async = true;
        script.defer = true;
        script.onload = render;
        document.head.appendChild(script);
      } else {
        existing.addEventListener("load", render);
      }
    }

    return () => {
      if (widgetId.current !== null && typeof (window as any).turnstile !== "undefined") {
        (window as any).turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [siteKey]);

  if (!siteKey) return null;
  return <div ref={containerRef} className="flex justify-center mt-2" />;
}

type Step = "main" | "verify" | "forgot" | "forgot-sent" | "reset-sent";

export interface LoginFormProps {
  onUserSuccess: (user: ToolUser) => void;
}

export function LoginForm({ onUserSuccess }: LoginFormProps) {
  const { data: authConfig } = useQuery({
    queryKey: ["auth-config"],
    queryFn: () => toolsApi.auth.config(),
    staleTime: 5 * 60 * 1000,
  });
  const googleEnabled = authConfig?.googleEnabled ?? false;

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [step, setStep] = useState<Step>("main");

  // Main form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>(undefined);

  // Verification
  const [verifyEmail, setVerifyEmail] = useState("");
  const [code, setCode] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  // Forgot password
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");

  // Resend countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const switchMode = (m: "login" | "signup") => {
    setMode(m); setError(""); setStep("main");
  };

  // ── Google Sign-In ──────────────────────────────────────────────────────────
  const handleGoogleSignIn = () => {
    window.location.href = "/api/tools/auth/google";
  };

  // ── Submit login/signup ────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        const { user } = await toolsApi.auth.login(email.trim(), password, turnstileToken);
        onUserSuccess(user);
      } else {
        const result = await toolsApi.auth.register(name.trim(), email.trim(), password, turnstileToken);
        if (result.needsVerification) {
          setVerifyEmail(result.email);
          setStep("verify");
          setResendCooldown(60);
        }
      }
    } catch (err: any) {
      if (err.needsVerification) {
        setVerifyEmail(err.email || email.trim());
        setStep("verify");
        setResendCooldown(60);
      } else {
        setError(err.message ?? "Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Verify email code ──────────────────────────────────────────────────────
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyError("");
    setVerifyLoading(true);
    try {
      const { user } = await toolsApi.auth.verifyEmail(verifyEmail, code.trim());
      onUserSuccess(user);
    } catch (err: any) {
      setVerifyError(err.message ?? "Invalid code");
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    try {
      await toolsApi.auth.resendCode(verifyEmail);
      setResendCooldown(60);
    } catch {}
  };

  // ── Forgot password ────────────────────────────────────────────────────────
  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError("");
    setForgotLoading(true);
    try {
      await toolsApi.auth.forgotPassword(forgotEmail.trim());
      setStep("forgot-sent");
    } catch (err: any) {
      setForgotError(err.message ?? "Something went wrong");
    } finally {
      setForgotLoading(false);
    }
  };

  // ── Render steps ───────────────────────────────────────────────────────────
  if (step === "verify") {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="verify"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25, ease: expo }}
        >
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Mail className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-lg font-bold">Check your inbox</h3>
            <p className="text-sm text-muted-foreground mt-1">
              We sent a 6-digit code to <span className="text-foreground font-medium">{verifyEmail}</span>
            </p>
          </div>

          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <Label className="mb-1.5 block text-sm font-medium">Verification Code</Label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="000000"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="h-12 text-center text-2xl font-bold tracking-widest"
                maxLength={6}
                required
                autoFocus
              />
            </div>

            {verifyError && (
              <p className="text-sm text-destructive bg-destructive/10 px-4 py-3 rounded-xl">{verifyError}</p>
            )}

            <Button type="submit" className="w-full h-11 font-semibold" disabled={verifyLoading || code.length !== 6}>
              {verifyLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Verifying…</> : <>
                <CheckCircle2 className="w-4 h-4 mr-2" />Confirm Email
              </>}
            </Button>
          </form>

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => { setStep("main"); setCode(""); setVerifyError(""); }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  if (step === "forgot") {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="forgot"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25, ease: expo }}
        >
          <div className="mb-5">
            <button
              type="button"
              onClick={() => { setStep("main"); setForgotError(""); setForgotEmail(""); }}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              <ArrowLeft className="w-4 h-4" /> Back to sign in
            </button>
            <h3 className="text-lg font-bold">Forgot password?</h3>
            <p className="text-sm text-muted-foreground mt-1">Enter your email and we'll send a reset link.</p>
          </div>

          <form onSubmit={handleForgot} className="space-y-4">
            <div>
              <Label className="mb-1.5 block text-sm font-medium">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  className="pl-10 h-11"
                  required
                  autoFocus
                />
              </div>
            </div>

            {forgotError && (
              <p className="text-sm text-destructive bg-destructive/10 px-4 py-3 rounded-xl">{forgotError}</p>
            )}

            <Button type="submit" className="w-full h-11 font-semibold" disabled={forgotLoading}>
              {forgotLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending…</> : "Send Reset Link"}
            </Button>
          </form>
        </motion.div>
      </AnimatePresence>
    );
  }

  if (step === "forgot-sent") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-4"
      >
        <div className="w-14 h-14 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 className="w-7 h-7 text-green-500" />
        </div>
        <h3 className="text-lg font-bold">Check your inbox</h3>
        <p className="text-sm text-muted-foreground mt-2 mb-5">
          If an account exists for <span className="text-foreground font-medium">{forgotEmail}</span>, you'll receive a reset link shortly.
        </p>
        <button
          type="button"
          onClick={() => { setStep("main"); setForgotEmail(""); }}
          className="text-sm text-primary hover:underline"
        >
          Back to sign in
        </button>
      </motion.div>
    );
  }

  // ── Main sign in / sign up form ────────────────────────────────────────────
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="main"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2, ease: expo }}
      >
        {/* Google Sign-In (only shown when configured) */}
        {googleEnabled && (
          <>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-3 h-11 px-4 bg-background border border-border/70 rounded-xl text-sm font-medium hover:bg-muted/50 transition-all duration-200 hover:border-border mb-4"
            >
              <GoogleIcon />
              Continue with Google
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-border/50" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-border/50" />
            </div>
          </>
        )}

        {/* Mode toggle */}
        <div className="flex gap-1.5 mb-5 bg-muted/40 p-1 rounded-xl">
          {(["login", "signup"] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                mode === m
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "login" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.form
            key={mode}
            initial={{ opacity: 0, x: mode === "login" ? -10 : 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: mode === "login" ? 10 : -10 }}
            transition={{ duration: 0.18, ease: expo }}
            onSubmit={handleSubmit}
            className="space-y-3.5"
          >
            {mode === "signup" && (
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
                    autoFocus={mode === "signup"}
                  />
                </div>
              </div>
            )}

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
                  autoFocus={mode === "login"}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-sm font-medium">Password</Label>
                {mode === "login" && (
                  <button
                    type="button"
                    onClick={() => { setForgotEmail(email); setStep("forgot"); setError(""); }}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type={showPass ? "text" : "password"}
                  placeholder={mode === "signup" ? "Min. 6 characters" : "••••••••"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="pl-10 pr-10 h-11"
                  required
                  minLength={mode === "signup" ? 6 : undefined}
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

            {/* Turnstile widget */}
            <TurnstileWidget onToken={setTurnstileToken} />

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 px-4 py-3 rounded-xl">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full h-11 text-sm font-semibold !mt-5"
              disabled={loading}
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{mode === "login" ? "Signing in…" : "Creating account…"}</>
              ) : (
                mode === "login" ? "Sign In" : "Create Account"
              )}
            </Button>
          </motion.form>
        </AnimatePresence>

        <p className="text-center text-xs text-muted-foreground mt-4">
          By continuing, you agree to our{" "}
          <a href="/terms" className="underline hover:text-foreground transition-colors">terms of service</a>.
        </p>
      </motion.div>
    </AnimatePresence>
  );
}
