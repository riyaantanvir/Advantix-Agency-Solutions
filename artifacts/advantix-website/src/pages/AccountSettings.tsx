import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft, User, Building2, Phone, Globe, Lock,
  CheckCircle, AlertCircle, Loader2, Eye, EyeOff, Save
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToolsUser } from "@/context/ToolsUserContext";
import { toolsApi, type ToolUserProfile } from "@/lib/toolsApi";

const expo = [0.22, 1, 0.36, 1] as const;

function Alert({ type, msg }: { type: "success" | "error"; msg: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-start gap-2 text-sm rounded-xl px-4 py-3 ${
        type === "success"
          ? "bg-green-500/10 border border-green-500/20 text-green-400"
          : "bg-destructive/10 border border-destructive/20 text-destructive"
      }`}
    >
      {type === "success"
        ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
        : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
      <span>{msg}</span>
    </motion.div>
  );
}

export default function AccountSettings() {
  const { user, loading, setUser } = useToolsUser();
  const [, navigate] = useLocation();

  const [profile, setProfile] = useState<ToolUserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [user, loading]);

  useEffect(() => {
    if (!user) return;
    toolsApi.auth.profile()
      .then((p) => {
        setProfile(p);
        setName(p.name);
        setCompanyName(p.companyName ?? "");
        setPhone(p.phone ?? "");
        setWebsite(p.website ?? "");
      })
      .catch(() => {})
      .finally(() => setLoadingProfile(false));
  }, [user]);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setProfileSaving(true);
    try {
      const res = await toolsApi.auth.updateProfile({
        name, companyName, phone, website,
      });
      setUser({ ...user!, name: res.name });
      setProfileMsg({ type: "success", text: "Profile updated successfully!" });
    } catch (err: any) {
      setProfileMsg({ type: "error", text: err.message ?? "Update failed. Please try again." });
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (newPw !== confirmPw) { setPwMsg({ type: "error", text: "New passwords don't match." }); return; }
    if (newPw.length < 6) { setPwMsg({ type: "error", text: "Password must be at least 6 characters." }); return; }
    setPwSaving(true);
    try {
      await toolsApi.auth.changePassword(currentPw, newPw);
      setPwMsg({ type: "success", text: "Password changed successfully!" });
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (err: any) {
      setPwMsg({ type: "error", text: err.message ?? "Password change failed. Please try again." });
    } finally {
      setPwSaving(false);
    }
  };

  if (loading || loadingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return null;

  const initials = user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="pt-28 pb-24 min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-2xl">

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8">
          <Link href="/tools/dashboard">
            <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
              <ArrowLeft className="w-4 h-4" /> Dashboard
            </button>
          </Link>
        </motion.div>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: expo }}
          className="flex items-center gap-4 mb-10">
          <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center text-primary font-bold text-lg font-display">
            {initials}
          </div>
          <div>
            <h1 className="text-3xl font-display font-extrabold tracking-tight">Account Settings</h1>
            <p className="text-muted-foreground mt-0.5">{user.email}</p>
          </div>
        </motion.div>

        <div className="space-y-6">

          {/* ── Profile Info ──────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: expo, delay: 0.05 }}>
            <Card className="p-6 border-border/50">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-display font-bold text-lg leading-none">Profile Information</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Update your name and contact details</p>
                </div>
              </div>

              <form onSubmit={handleProfileSave} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Full Name <span className="text-destructive">*</span></Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your full name"
                        className="pl-9"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="company">Company Name</Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="company"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="Your company (optional)"
                        className="pl-9"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Phone Number</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="phone"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+880 ..."
                        className="pl-9"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="website">Website</Label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="website"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="https://yoursite.com"
                        className="pl-9"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Email Address</Label>
                  <Input value={user.email} disabled className="bg-secondary/30 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Email address cannot be changed.</p>
                </div>

                {profileMsg && <Alert type={profileMsg.type} msg={profileMsg.text} />}

                <Button
                  type="submit"
                  className="w-full h-11 font-semibold gap-2"
                  disabled={profileSaving}
                >
                  {profileSaving
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                    : <><Save className="w-4 h-4" /> Save Profile</>}
                </Button>
              </form>
            </Card>
          </motion.div>

          {/* ── Change Password ───────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: expo, delay: 0.1 }}>
            <Card className="p-6 border-border/50">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
                  <Lock className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <h2 className="font-display font-bold text-lg leading-none">Change Password</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Use a strong password with 6+ characters</p>
                </div>
              </div>

              <form onSubmit={handlePasswordSave} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="current-pw">Current Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="current-pw"
                      type={showCurrent ? "text" : "password"}
                      value={currentPw}
                      onChange={(e) => setCurrentPw(e.target.value)}
                      placeholder="••••••••"
                      className="pl-9 pr-10"
                      required
                    />
                    <button type="button" onClick={() => setShowCurrent(!showCurrent)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-pw">New Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="new-pw"
                        type={showNew ? "text" : "password"}
                        value={newPw}
                        onChange={(e) => setNewPw(e.target.value)}
                        placeholder="Min. 6 characters"
                        className="pl-9 pr-10"
                        required
                      />
                      <button type="button" onClick={() => setShowNew(!showNew)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                        {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirm-pw">Confirm New Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="confirm-pw"
                        type="password"
                        value={confirmPw}
                        onChange={(e) => setConfirmPw(e.target.value)}
                        placeholder="Re-enter new password"
                        className="pl-9"
                        required
                      />
                    </div>
                  </div>
                </div>

                {newPw && confirmPw && newPw !== confirmPw && (
                  <p className="text-xs text-destructive">Passwords don't match.</p>
                )}

                {pwMsg && <Alert type={pwMsg.type} msg={pwMsg.text} />}

                <Button
                  type="submit"
                  variant="outline"
                  className="w-full h-11 font-semibold gap-2 border-orange-500/30 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300"
                  disabled={pwSaving}
                >
                  {pwSaving
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Changing…</>
                    : <><Lock className="w-4 h-4" /> Change Password</>}
                </Button>
              </form>
            </Card>
          </motion.div>

        </div>
      </div>
    </div>
  );
}
