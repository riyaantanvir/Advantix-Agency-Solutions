import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Mail, User, Eye, EyeOff, Loader2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toolsApi, type ToolUser } from "@/lib/toolsApi";

export const expo = [0.22, 1, 0.36, 1] as const;

export interface LoginFormProps {
  onUserSuccess: (user: ToolUser) => void;
  onAdminClick: () => void;
}

export function LoginForm({ onUserSuccess, onAdminClick }: LoginFormProps) {
  const [userMode, setUserMode] = useState<"login" | "signup">("login");
  const [userEmail, setUserEmail] = useState("");
  const [userPass, setUserPass] = useState("");
  const [showUserPass, setShowUserPass] = useState(false);
  const [userName, setUserName] = useState("");
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState("");

  const handleUserLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserError("");
    setUserLoading(true);
    try {
      const { user } = await toolsApi.auth.login(userEmail.trim(), userPass);
      onUserSuccess(user);
    } catch (err: unknown) {
      setUserError(err instanceof Error ? err.message : "Invalid email or password");
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
      onUserSuccess(user);
    } catch (err: unknown) {
      setUserError(err instanceof Error ? err.message : "Could not create account");
    } finally {
      setUserLoading(false);
    }
  };

  return (
    <>
      {/* Sign In / Sign Up toggle */}
      <div className="flex gap-2 mb-5 bg-secondary/40 p-1 rounded-xl">
        {(["login", "signup"] as const).map(mode => (
          <button
            key={mode}
            type="button"
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
            key="form-login"
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
            key="form-signup"
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

      {/* Admin Login link */}
      <div className="mt-5 pt-4 border-t border-border/40 text-center">
        <button
          type="button"
          onClick={onAdminClick}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group"
        >
          <Shield className="w-3.5 h-3.5 group-hover:text-primary transition-colors" />
          Admin Login
        </button>
      </div>

      <p className="text-center text-xs text-muted-foreground mt-3">
        By signing in, you agree to our terms of service.
      </p>
    </>
  );
}
