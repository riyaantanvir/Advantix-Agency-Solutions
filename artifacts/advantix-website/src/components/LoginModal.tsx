import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { Lock, Mail, User, Eye, EyeOff, Loader2, Shield, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toolsApi } from "@/lib/toolsApi";
import { useToolsUser } from "@/context/ToolsUserContext";

const expo = [0.22, 1, 0.36, 1] as const;
const BASE = "/api";

async function adminLogin(username: string, password: string) {
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

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

export function LoginModal({ open, onClose }: LoginModalProps) {
  const [userMode, setUserMode] = useState<"login" | "signup">("login");
  const [userEmail, setUserEmail] = useState("");
  const [userPass, setUserPass] = useState("");
  const [showUserPass, setShowUserPass] = useState(false);
  const [userName, setUserName] = useState("");
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState("");

  const [showAdmin, setShowAdmin] = useState(false);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [showAdminPass, setShowAdminPass] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");

  const [, navigate] = useLocation();
  const { setUser } = useToolsUser();

  const reset = () => {
    setUserMode("login");
    setUserEmail(""); setUserPass(""); setShowUserPass(false);
    setUserName(""); setUserError("");
    setShowAdmin(false);
    setAdminUsername(""); setAdminPass(""); setShowAdminPass(false);
    setAdminError("");
  };

  const handleClose = () => { reset(); onClose(); };

  const handleUserLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserError("");
    setUserLoading(true);
    try {
      const { user } = await toolsApi.auth.login(userEmail.trim(), userPass);
      setUser(user);
      handleClose();
      navigate("/tools/dashboard");
    } catch (err: any) {
      setUserError(err.message ?? "Invalid email or password");
    } finally {
      setUserLoading(false);
    }
  };

  const handleUserSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserError("");
    setUserLoading(true);
    try {
      const { user } = await toolsApi.auth.register(userName.trim(), userEmail.trim(), userPass);
      setUser(user);
      handleClose();
      navigate("/tools/dashboard");
    } catch (err: any) {
      setUserError(err.message ?? "Could not create account");
    } finally {
      setUserLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError("");
    setAdminLoading(true);
    try {
      await adminLogin(adminUsername.trim(), adminPass);
      window.location.href = "/admin/";
    } catch (err: any) {
      setAdminError(err.message ?? "Invalid username or password");
    } finally {
      setAdminLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-md p-0 border-border/60 bg-card rounded-3xl overflow-hidden shadow-2xl">
        <DialogTitle className="sr-only">Advantix Portal Login</DialogTitle>
        <DialogDescription className="sr-only">Sign in to your account or create a new one</DialogDescription>

        <div className="p-7">
          {/* Logo + title */}
          <div className="text-center mb-7">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Lock className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-2xl font-display font-extrabold">Advantix Portal</h2>
            <p className="text-sm text-muted-foreground mt-1">Sign in to your account</p>
          </div>

          {/* Sign In / Sign Up toggle */}
          <div className="flex gap-2 mb-5 bg-secondary/40 p-1 rounded-xl">
            {(["login", "signup"] as const).map(mode => (
              <button
                key={mode}
                onClick={() => { setUserMode(mode); setUserError(""); }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  userMode === mode
                    ? "bg-background shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode === "login" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          {/* User forms */}
          <AnimatePresence mode="wait">
            {userMode === "login" ? (
              <motion.form
                key="modal-login"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.2, ease: expo }}
                onSubmit={handleUserLogin}
                className="space-y-4"
              >
                <div>
                  <Label className="mb-1.5 block text-sm font-medium">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input type="email" placeholder="you@example.com" value={userEmail}
                      onChange={e => setUserEmail(e.target.value)} className="pl-10 h-11" required autoFocus />
                  </div>
                </div>
                <div>
                  <Label className="mb-1.5 block text-sm font-medium">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input type={showUserPass ? "text" : "password"} placeholder="••••••••" value={userPass}
                      onChange={e => setUserPass(e.target.value)} className="pl-10 pr-10 h-11" required />
                    <button type="button" onClick={() => setShowUserPass(!showUserPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showUserPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {userError && (
                  <p className="text-sm text-destructive bg-destructive/10 px-4 py-3 rounded-xl">{userError}</p>
                )}
                <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={userLoading}>
                  {userLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Signing in…</> : "Sign In"}
                </Button>
              </motion.form>
            ) : (
              <motion.form
                key="modal-signup"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2, ease: expo }}
                onSubmit={handleUserSignup}
                className="space-y-4"
              >
                <div>
                  <Label className="mb-1.5 block text-sm font-medium">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input type="text" placeholder="Your name" value={userName}
                      onChange={e => setUserName(e.target.value)} className="pl-10 h-11" required autoFocus />
                  </div>
                </div>
                <div>
                  <Label className="mb-1.5 block text-sm font-medium">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input type="email" placeholder="you@example.com" value={userEmail}
                      onChange={e => setUserEmail(e.target.value)} className="pl-10 h-11" required />
                  </div>
                </div>
                <div>
                  <Label className="mb-1.5 block text-sm font-medium">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input type={showUserPass ? "text" : "password"} placeholder="Min. 6 characters" value={userPass}
                      onChange={e => setUserPass(e.target.value)} className="pl-10 pr-10 h-11" required minLength={6} />
                    <button type="button" onClick={() => setShowUserPass(!showUserPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showUserPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {userError && (
                  <p className="text-sm text-destructive bg-destructive/10 px-4 py-3 rounded-xl">{userError}</p>
                )}
                <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={userLoading}>
                  {userLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating account…</> : "Create Account"}
                </Button>
              </motion.form>
            )}
          </AnimatePresence>

          {/* Admin Login toggle */}
          <div className="mt-5 pt-5 border-t border-border/40">
            <button
              type="button"
              onClick={() => { setShowAdmin(!showAdmin); setAdminError(""); }}
              className="flex items-center justify-center gap-1.5 w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Shield className="w-3.5 h-3.5" />
              Admin Login
              <motion.span animate={{ rotate: showAdmin ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown className="w-3.5 h-3.5" />
              </motion.span>
            </button>

            <AnimatePresence>
              {showAdmin && (
                <motion.form
                  key="modal-admin"
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: "auto", marginTop: 16 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  transition={{ duration: 0.28, ease: expo }}
                  style={{ overflow: "hidden" }}
                  onSubmit={handleAdminLogin}
                  className="space-y-3"
                >
                  <div>
                    <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Username</Label>
                    <div className="relative">
                      <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input type="text" placeholder="admin" value={adminUsername}
                        onChange={e => setAdminUsername(e.target.value)} className="pl-10 h-10 text-sm" required />
                    </div>
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input type={showAdminPass ? "text" : "password"} placeholder="••••••••" value={adminPass}
                        onChange={e => setAdminPass(e.target.value)} className="pl-10 pr-10 h-10 text-sm" required />
                      <button type="button" onClick={() => setShowAdminPass(!showAdminPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showAdminPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  {adminError && (
                    <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-xl">{adminError}</p>
                  )}
                  <Button type="submit" variant="secondary" className="w-full h-10 text-sm font-semibold" disabled={adminLoading}>
                    {adminLoading
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Signing in…</>
                      : "Sign In to Admin Panel"}
                  </Button>
                </motion.form>
              )}
            </AnimatePresence>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-5">
            By signing in, you agree to our terms of service.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
