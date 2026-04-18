import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Facebook, Save, Loader2, Eye, EyeOff, CheckCircle2,
  AlertCircle, ExternalLink, Copy, Check, Webhook, Info,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const API = "/api";

interface FbSettings {
  FACEBOOK_APP_ID: string;
  FACEBOOK_APP_SECRET: string;
  FACEBOOK_WEBHOOK_VERIFY_TOKEN: string;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

export default function FacebookSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState<FbSettings>({
    FACEBOOK_APP_ID: "",
    FACEBOOK_APP_SECRET: "",
    FACEBOOK_WEBHOOK_VERIFY_TOKEN: "",
  });
  const [dirty, setDirty] = useState<Record<string, boolean>>({});

  const { data: current, isLoading } = useQuery<FbSettings>({
    queryKey: ["admin-fb-settings"],
    queryFn: async () => {
      const d = await apiFetch("/admin/facebook/settings");
      setForm(d);
      return d;
    },
  });

  const save = useMutation({
    mutationFn: () => apiFetch("/admin/facebook/settings", {
      method: "PUT",
      body: JSON.stringify(
        Object.fromEntries(Object.entries(form).filter(([k]) => dirty[k]))
      ),
    }),
    onSuccess: () => {
      toast({ title: "Saved!", description: "Facebook settings saved to database." });
      setDirty({});
      qc.invalidateQueries({ queryKey: ["admin-fb-settings"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const copyVerifyToken = () => {
    const val = form.FACEBOOK_WEBHOOK_VERIFY_TOKEN || "advantix_fb_verify_2025";
    navigator.clipboard.writeText(val).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const set = (key: keyof FbSettings, value: string) => {
    setForm(f => ({ ...f, [key]: value }));
    setDirty(d => ({ ...d, [key]: true }));
  };

  const hasDirty = Object.values(dirty).some(Boolean);

  return (
    <div className="p-6 max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
          <Facebook className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Facebook Auto-Reply Settings</h1>
          <p className="text-sm text-muted-foreground">App credentials stored securely in the database</p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && (
        <>
          {/* Status */}
          <Card className={`p-4 border flex items-start gap-3 ${current?.FACEBOOK_APP_ID ? "border-green-500/30 bg-green-500/5" : "border-yellow-500/30 bg-yellow-500/5"}`}>
            {current?.FACEBOOK_APP_ID
              ? <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
              : <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />}
            <div>
              <p className={`text-sm font-semibold ${current?.FACEBOOK_APP_ID ? "text-green-300" : "text-yellow-300"}`}>
                {current?.FACEBOOK_APP_ID ? "App ID configured ✓" : "App ID not set — Connect Page will fail"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {current?.FACEBOOK_APP_ID
                  ? "Users can now connect their Facebook pages."
                  : "Enter your Facebook App ID and Secret below to enable OAuth."}
              </p>
            </div>
          </Card>

          {/* Form */}
          <Card className="p-5 border-border/40 space-y-5">
            <p className="font-semibold text-sm flex items-center gap-2">
              <Facebook className="w-4 h-4 text-blue-400" />
              Facebook App Credentials
            </p>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                App ID
                <span className="text-red-400 ml-0.5">*</span>
              </Label>
              <Input
                placeholder="e.g. 1234567890123456"
                value={form.FACEBOOK_APP_ID}
                onChange={e => set("FACEBOOK_APP_ID", e.target.value)}
                className={dirty.FACEBOOK_APP_ID ? "border-blue-500/50" : ""}
              />
              <p className="text-xs text-muted-foreground">
                developers.facebook.com → My Apps → তোমার App → Settings → Basic → <strong>App ID</strong>
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                App Secret
                <span className="text-red-400 ml-0.5">*</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  type={showSecret ? "text" : "password"}
                  placeholder={current?.FACEBOOK_APP_SECRET ? "••••••••••••" : "Enter App Secret"}
                  value={form.FACEBOOK_APP_SECRET}
                  onChange={e => set("FACEBOOK_APP_SECRET", e.target.value)}
                  className={`flex-1 ${dirty.FACEBOOK_APP_SECRET ? "border-blue-500/50" : ""}`}
                />
                <Button variant="outline" size="icon" onClick={() => setShowSecret(s => !s)}>
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Settings → Basic → Show <strong>App Secret</strong>
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Webhook className="w-3 h-3" />
                Webhook Verify Token
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="advantix_fb_verify_2025"
                  value={form.FACEBOOK_WEBHOOK_VERIFY_TOKEN}
                  onChange={e => set("FACEBOOK_WEBHOOK_VERIFY_TOKEN", e.target.value)}
                  className={`flex-1 ${dirty.FACEBOOK_WEBHOOK_VERIFY_TOKEN ? "border-blue-500/50" : ""}`}
                />
                <Button variant="outline" size="icon" onClick={copyVerifyToken} title="Copy current value">
                  {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Default: <code className="bg-muted/40 px-1 rounded">advantix_fb_verify_2025</code> — Facebook Webhook setup-এ এটা paste করো।
              </p>
            </div>

            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || !hasDirty}
              className="w-full"
            >
              {save.isPending
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
                : <><Save className="w-4 h-4 mr-2" />Save to Database</>}
            </Button>
          </Card>

          {/* Setup guide */}
          <Card className="p-5 border-border/40 space-y-3">
            <p className="font-semibold text-sm flex items-center gap-2">
              <Info className="w-4 h-4 text-muted-foreground" />
              Facebook App Setup Guide
            </p>
            {[
              { n: 1, text: "developers.facebook.com → My Apps → Create App → Business type নির্বাচন করো" },
              { n: 2, text: "App তৈরি হলে Settings → Basic থেকে App ID এবং App Secret copy করো" },
              { n: 3, text: "উপরের form-এ App ID এবং App Secret দিয়ে Save করো" },
              { n: 4, text: "Products → Messenger বা Facebook Login add করো" },
              { n: 5, text: "Webhooks section-এ Callback URL হিসেবে website-এর Webhook tab থেকে URL copy করো" },
              { n: 6, text: "Verify Token হিসেবে উপরের Webhook Verify Token paste করো" },
              { n: 7, text: "Fields: messages, messaging_postbacks, feed subscribe করো" },
              { n: 8, text: "এখন user dashboard থেকে Facebook Page connect করা যাবে" },
            ].map(({ n, text }) => (
              <div key={n} className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-blue-500/15 text-blue-400 text-xs flex items-center justify-center shrink-0 font-bold mt-0.5">
                  {n}
                </span>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            ))}
            <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="mt-1">
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />Open Facebook Developers
              </Button>
            </a>
          </Card>
        </>
      )}
    </div>
  );
}
