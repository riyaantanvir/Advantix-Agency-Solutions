import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, Megaphone, Save, Eye, EyeOff, Loader2, ExternalLink, Mail } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

type CTAConfig = {
  enabled: boolean; text: string; buttonText: string; buttonUrl: string; bg: string;
};

type NewsletterConfig = { enabled: boolean };

export default function SiteSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();

  /* ── CTA Bar ── */
  const { data: cta, isLoading: ctaLoading } = useQuery<CTAConfig>({
    queryKey: ["cta-bar"],
    queryFn: () => fetch("/api/settings/cta-bar", { credentials: "include" })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
  });

  const [form, setForm] = useState<CTAConfig>({
    enabled: true,
    text: "Ready to transform your business? Let's build something amazing together.",
    buttonText: "Get Started",
    buttonUrl: "/contact",
    bg: "primary",
  });

  useEffect(() => { if (cta) setForm(cta); }, [cta]);

  const ctaSaveMutation = useMutation({
    mutationFn: () =>
      fetch("/api/admin/settings/cta-bar", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cta-bar"] });
      toast({ title: "Settings saved", description: "CTA bar updated successfully." });
    },
    onError: () => toast({ variant: "destructive", title: "Save failed" }),
  });

  const set = (key: keyof CTAConfig, val: any) => setForm(f => ({ ...f, [key]: val }));

  /* ── Newsletter ── */
  const { data: newsletter, isLoading: nlLoading } = useQuery<NewsletterConfig>({
    queryKey: ["newsletter-settings"],
    queryFn: () => fetch("/api/settings/newsletter", { credentials: "include" })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
  });

  const [nlEnabled, setNlEnabled] = useState(true);
  useEffect(() => { if (newsletter) setNlEnabled(newsletter.enabled); }, [newsletter]);

  const nlSaveMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      fetch("/api/admin/settings/newsletter", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      }).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
    onSuccess: (data: NewsletterConfig) => {
      setNlEnabled(data.enabled);
      qc.invalidateQueries({ queryKey: ["newsletter-settings"] });
      toast({
        title: data.enabled ? "Newsletter enabled" : "Newsletter disabled",
        description: data.enabled
          ? "Visitors can now subscribe on the website."
          : "The subscription form will be hidden from visitors.",
      });
    },
    onError: () => toast({ variant: "destructive", title: "Save failed" }),
  });

  const handleNlToggle = () => {
    const next = !nlEnabled;
    setNlEnabled(next);
    nlSaveMutation.mutate(next);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Settings className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Site Settings</h1>
          <p className="text-sm text-muted-foreground">Configure website-wide elements like the CTA bar</p>
        </div>
      </div>

      {/* CTA Bar Editor */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-primary" /> Sticky CTA Bar
          </h2>
          <button
            onClick={() => set("enabled", !form.enabled)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              form.enabled
                ? "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {form.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {form.enabled ? "Enabled" : "Disabled"}
          </button>
        </div>

        {ctaLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Message Text *</label>
              <textarea
                value={form.text}
                onChange={e => set("text", e.target.value)}
                rows={2}
                placeholder="Ready to transform your business? Let's build something amazing."
                className="w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Button Text *</label>
                <input
                  type="text"
                  value={form.buttonText}
                  onChange={e => set("buttonText", e.target.value)}
                  placeholder="Get Started"
                  className="w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Button URL *</label>
                <div className="relative">
                  <input
                    type="text"
                    value={form.buttonUrl}
                    onChange={e => set("buttonUrl", e.target.value)}
                    placeholder="/contact or https://..."
                    className="w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 pr-8"
                  />
                  {form.buttonUrl.startsWith("http") && (
                    <ExternalLink className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>
              </div>
            </div>

            {/* Live Preview */}
            <div className="rounded-xl overflow-hidden border border-border/50">
              <p className="text-xs text-muted-foreground px-3 py-2 bg-secondary/30 border-b border-border/50">Live Preview</p>
              {form.enabled ? (
                <div className="bg-primary px-4 py-3 flex items-center gap-4 justify-between">
                  <p className="text-primary-foreground text-sm font-medium flex-1 line-clamp-1">{form.text || "Your message here…"}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-4 py-1.5 bg-white text-primary font-semibold text-sm rounded-lg whitespace-nowrap">
                      {form.buttonText || "Button"}
                    </span>
                    <span className="w-6 h-6 flex items-center justify-center rounded bg-white/10 text-primary-foreground text-xs">✕</span>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-4 text-center text-muted-foreground text-sm bg-secondary/10">
                  CTA bar is disabled — it won't show on the website.
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => ctaSaveMutation.mutate()}
                disabled={ctaSaveMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {ctaSaveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {ctaSaveMutation.isPending ? "Saving…" : "Save Settings"}
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Newsletter Subscription Toggle */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Mail className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Newsletter Subscription</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {nlLoading
                  ? "Loading…"
                  : nlEnabled
                    ? "Visitors can subscribe via the newsletter form on the website."
                    : "Subscription form is hidden. New sign-ups are rejected."}
              </p>
            </div>
          </div>

          {nlLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : (
            <button
              onClick={handleNlToggle}
              disabled={nlSaveMutation.isPending}
              className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors focus:outline-none disabled:opacity-60 ${
                nlEnabled ? "bg-green-500" : "bg-secondary"
              }`}
              title={nlEnabled ? "Click to disable newsletter" : "Click to enable newsletter"}
            >
              <span
                className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform ${
                  nlEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          )}
        </div>

        {/* Status badge */}
        {!nlLoading && (
          <div className={`mt-4 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium w-fit ${
            nlEnabled
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : "bg-secondary/60 text-muted-foreground border border-border/40"
          }`}>
            {nlEnabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {nlEnabled ? "Subscriptions are ON — visitors can sign up" : "Subscriptions are OFF — form hidden from visitors"}
          </div>
        )}
      </Card>
    </div>
  );
}
