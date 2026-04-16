import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Settings, Megaphone, Save, Eye, EyeOff, Loader2, ExternalLink, Mail,
  Globe, Phone, MapPin, Twitter, Linkedin, Facebook, Instagram,
  Search, BarChart2, AlertTriangle, Image, Sparkles, Upload, X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

/* ─── Types ──────────────────────────────────────────────── */
type CTAConfig = { enabled: boolean; text: string; buttonText: string; buttonUrl: string; bg: string };
type NewsletterConfig = { enabled: boolean };
type GeneralSettings = {
  siteName: string; tagline: string; logo: string; aiLogo: string;
  contactEmail: string; contactPhone: string; contactAddress: string;
  twitter: string; linkedin: string; facebook: string; instagram: string;
  metaDescription: string; googleAnalyticsId: string;
  maintenanceMode: boolean; maintenanceMessage: string;
};

const GENERAL_DEFAULTS: GeneralSettings = {
  siteName: "Advantix", tagline: "Digital Agency", logo: "", aiLogo: "",
  contactEmail: "hello@advantix.digital", contactPhone: "", contactAddress: "",
  twitter: "", linkedin: "", facebook: "", instagram: "",
  metaDescription: "Advantix Digital — a full-service digital agency.",
  googleAnalyticsId: "", maintenanceMode: false,
  maintenanceMessage: "We're performing scheduled maintenance. We'll be back shortly.",
};

/* ─── Reusable input component ──────────────────────────── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20";

/* ─── Logo uploader ──────────────────────────────────────── */
function LogoUploader({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert("File must be under 2 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex items-center gap-4">
      <div className="w-16 h-16 rounded-xl border border-border/50 bg-secondary/30 flex items-center justify-center shrink-0 overflow-hidden">
        {value ? (
          <img src={value} alt={label} className="w-full h-full object-contain p-1" />
        ) : (
          <Image className="w-6 h-6 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 space-y-1.5">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">PNG, JPG or SVG — max 2 MB</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => ref.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary border border-border/50 rounded-lg text-xs font-medium text-foreground hover:bg-secondary/70 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" /> Upload Image
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Remove
            </button>
          )}
        </div>
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
    </div>
  );
}

/* ─── Section wrapper ────────────────────────────────────── */
function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-5">
        <Icon className="w-4 h-4 text-primary" /> {title}
      </h2>
      {children}
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════
   Main Component
═══════════════════════════════════════════════════════════ */
export default function SiteSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();

  /* ── CTA Bar ── */
  const { data: cta, isLoading: ctaLoading } = useQuery<CTAConfig>({
    queryKey: ["cta-bar"],
    queryFn: () => fetch("/api/settings/cta-bar", { credentials: "include" }).then(r => r.json()),
  });
  const [ctaForm, setCtaForm] = useState<CTAConfig>({ enabled: true, text: "", buttonText: "Get Started", buttonUrl: "/contact", bg: "primary" });
  useEffect(() => { if (cta) setCtaForm(cta); }, [cta]);
  const setC = (k: keyof CTAConfig, v: any) => setCtaForm(f => ({ ...f, [k]: v }));

  const ctaSave = useMutation({
    mutationFn: () => fetch("/api/admin/settings/cta-bar", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ctaForm) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cta-bar"] }); toast({ title: "CTA bar saved" }); },
    onError: () => toast({ variant: "destructive", title: "Save failed" }),
  });

  /* ── Newsletter ── */
  const { data: newsletter, isLoading: nlLoading } = useQuery<NewsletterConfig>({
    queryKey: ["newsletter-settings"],
    queryFn: () => fetch("/api/settings/newsletter", { credentials: "include" }).then(r => r.json()),
  });
  const [nlEnabled, setNlEnabled] = useState(true);
  useEffect(() => { if (newsletter) setNlEnabled(newsletter.enabled); }, [newsletter]);

  const nlSave = useMutation({
    mutationFn: (enabled: boolean) => fetch("/api/admin/settings/newsletter", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) }).then(r => r.json()),
    onSuccess: (d: NewsletterConfig) => { setNlEnabled(d.enabled); qc.invalidateQueries({ queryKey: ["newsletter-settings"] }); toast({ title: d.enabled ? "Newsletter enabled" : "Newsletter disabled" }); },
    onError: () => toast({ variant: "destructive", title: "Save failed" }),
  });

  /* ── General Settings ── */
  const { data: general, isLoading: genLoading } = useQuery<GeneralSettings>({
    queryKey: ["general-settings"],
    queryFn: () => fetch("/api/settings/general", { credentials: "include" }).then(r => r.json()),
  });
  const [gen, setGen] = useState<GeneralSettings>(GENERAL_DEFAULTS);
  useEffect(() => { if (general) setGen(general); }, [general]);
  const setG = (k: keyof GeneralSettings, v: any) => setGen(f => ({ ...f, [k]: v }));

  const genSave = useMutation({
    mutationFn: () => fetch("/api/admin/settings/general", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(gen) }).then(r => r.json()),
    onSuccess: (d: GeneralSettings) => { setGen(d); qc.invalidateQueries({ queryKey: ["general-settings"] }); toast({ title: "Settings saved successfully" }); },
    onError: () => toast({ variant: "destructive", title: "Save failed" }),
  });

  const SaveBtn = ({ onClick, pending, label = "Save Settings" }: { onClick: () => void; pending: boolean; label?: string }) => (
    <div className="flex justify-end pt-2">
      <button onClick={onClick} disabled={pending} className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60">
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {pending ? "Saving…" : label}
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Settings className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Site Settings</h1>
          <p className="text-sm text-muted-foreground">Manage branding, contact info, SEO, social media, and more</p>
        </div>
      </div>

      {genLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading settings…
        </div>
      ) : (
        <>
          {/* ── Site Identity ── */}
          <Section icon={Globe} title="Site Identity">
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Site Name">
                  <input value={gen.siteName} onChange={e => setG("siteName", e.target.value)} placeholder="Advantix" className={inputCls} />
                </Field>
                <Field label="Tagline">
                  <input value={gen.tagline} onChange={e => setG("tagline", e.target.value)} placeholder="Digital Agency" className={inputCls} />
                </Field>
              </div>
              <div className="border border-border/40 rounded-xl p-4 space-y-4">
                <LogoUploader label="Site Logo" value={gen.logo} onChange={v => setG("logo", v)} />
                <div className="border-t border-border/40 pt-4">
                  <LogoUploader label="AI Chat Logo" value={gen.aiLogo} onChange={v => setG("aiLogo", v)} />
                </div>
              </div>
              <SaveBtn onClick={() => genSave.mutate()} pending={genSave.isPending} />
            </div>
          </Section>

          {/* ── Contact Information ── */}
          <Section icon={Phone} title="Contact Information">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Contact Email">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input value={gen.contactEmail} onChange={e => setG("contactEmail", e.target.value)} placeholder="hello@example.com" className={`${inputCls} pl-8`} />
                  </div>
                </Field>
                <Field label="Phone Number">
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input value={gen.contactPhone} onChange={e => setG("contactPhone", e.target.value)} placeholder="+1 (555) 000-0000" className={`${inputCls} pl-8`} />
                  </div>
                </Field>
              </div>
              <Field label="Office Address">
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 w-3.5 h-3.5 text-muted-foreground" />
                  <textarea value={gen.contactAddress} onChange={e => setG("contactAddress", e.target.value)} rows={2} placeholder="123 Main St, City, Country" className={`${inputCls} pl-8 resize-none`} />
                </div>
              </Field>
              <SaveBtn onClick={() => genSave.mutate()} pending={genSave.isPending} />
            </div>
          </Section>

          {/* ── Social Media ── */}
          <Section icon={Twitter} title="Social Media Links">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Twitter / X">
                  <div className="relative">
                    <Twitter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input value={gen.twitter} onChange={e => setG("twitter", e.target.value)} placeholder="https://twitter.com/yourhandle" className={`${inputCls} pl-8`} />
                  </div>
                </Field>
                <Field label="LinkedIn">
                  <div className="relative">
                    <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input value={gen.linkedin} onChange={e => setG("linkedin", e.target.value)} placeholder="https://linkedin.com/company/..." className={`${inputCls} pl-8`} />
                  </div>
                </Field>
                <Field label="Facebook">
                  <div className="relative">
                    <Facebook className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input value={gen.facebook} onChange={e => setG("facebook", e.target.value)} placeholder="https://facebook.com/yourpage" className={`${inputCls} pl-8`} />
                  </div>
                </Field>
                <Field label="Instagram">
                  <div className="relative">
                    <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input value={gen.instagram} onChange={e => setG("instagram", e.target.value)} placeholder="https://instagram.com/yourhandle" className={`${inputCls} pl-8`} />
                  </div>
                </Field>
              </div>
              <SaveBtn onClick={() => genSave.mutate()} pending={genSave.isPending} />
            </div>
          </Section>

          {/* ── SEO ── */}
          <Section icon={Search} title="SEO & Analytics">
            <div className="space-y-4">
              <Field label="Meta Description">
                <textarea
                  value={gen.metaDescription}
                  onChange={e => setG("metaDescription", e.target.value)}
                  rows={3}
                  placeholder="A short description of your site for search engines (150–160 characters recommended)"
                  className={`${inputCls} resize-none`}
                />
                <p className={`text-xs mt-1 ${gen.metaDescription.length > 160 ? "text-red-400" : "text-muted-foreground"}`}>
                  {gen.metaDescription.length}/160 characters
                </p>
              </Field>
              <Field label="Google Analytics Measurement ID">
                <div className="relative">
                  <BarChart2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input value={gen.googleAnalyticsId} onChange={e => setG("googleAnalyticsId", e.target.value)} placeholder="G-XXXXXXXXXX" className={`${inputCls} pl-8`} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Paste your GA4 Measurement ID to enable Google Analytics on the website.</p>
              </Field>
              <SaveBtn onClick={() => genSave.mutate()} pending={genSave.isPending} />
            </div>
          </Section>

          {/* ── Maintenance Mode ── */}
          <Section icon={AlertTriangle} title="Maintenance Mode">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl border border-border/40">
                <div>
                  <p className="text-sm font-medium text-foreground">Enable Maintenance Mode</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Shows a maintenance page to all visitors when enabled</p>
                </div>
                <button
                  onClick={() => setG("maintenanceMode", !gen.maintenanceMode)}
                  className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors focus:outline-none ${gen.maintenanceMode ? "bg-amber-500" : "bg-secondary"}`}
                >
                  <span className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform ${gen.maintenanceMode ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
              {gen.maintenanceMode && (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-400 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Maintenance mode is active — visitors will see the maintenance page
                </div>
              )}
              <Field label="Maintenance Message">
                <textarea value={gen.maintenanceMessage} onChange={e => setG("maintenanceMessage", e.target.value)} rows={2} placeholder="We'll be back shortly…" className={`${inputCls} resize-none`} />
              </Field>
              <SaveBtn onClick={() => genSave.mutate()} pending={genSave.isPending} />
            </div>
          </Section>
        </>
      )}

      {/* ── CTA Bar ── */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-primary" /> Sticky CTA Bar
          </h2>
          <button
            onClick={() => setC("enabled", !ctaForm.enabled)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${ctaForm.enabled ? "bg-green-500/10 text-green-400 hover:bg-green-500/20" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
          >
            {ctaForm.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {ctaForm.enabled ? "Enabled" : "Disabled"}
          </button>
        </div>
        {ctaLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : (
          <div className="space-y-4">
            <Field label="Message Text *">
              <textarea value={ctaForm.text} onChange={e => setC("text", e.target.value)} rows={2} placeholder="Ready to transform your business?" className={`${inputCls} resize-none`} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Button Text *">
                <input value={ctaForm.buttonText} onChange={e => setC("buttonText", e.target.value)} placeholder="Get Started" className={inputCls} />
              </Field>
              <Field label="Button URL *">
                <div className="relative">
                  <input value={ctaForm.buttonUrl} onChange={e => setC("buttonUrl", e.target.value)} placeholder="/contact or https://..." className={`${inputCls} pr-8`} />
                  {ctaForm.buttonUrl.startsWith("http") && <ExternalLink className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />}
                </div>
              </Field>
            </div>
            <div className="rounded-xl overflow-hidden border border-border/50">
              <p className="text-xs text-muted-foreground px-3 py-2 bg-secondary/30 border-b border-border/50">Live Preview</p>
              {ctaForm.enabled ? (
                <div className="bg-primary px-4 py-3 flex items-center gap-4 justify-between">
                  <p className="text-primary-foreground text-sm font-medium flex-1 line-clamp-1">{ctaForm.text || "Your message here…"}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-4 py-1.5 bg-white text-primary font-semibold text-sm rounded-lg">{ctaForm.buttonText || "Button"}</span>
                    <span className="w-6 h-6 flex items-center justify-center rounded bg-white/10 text-primary-foreground text-xs">✕</span>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-4 text-center text-muted-foreground text-sm bg-secondary/10">CTA bar is disabled — it won't show on the website.</div>
              )}
            </div>
            <SaveBtn onClick={() => ctaSave.mutate()} pending={ctaSave.isPending} />
          </div>
        )}
      </Card>

      {/* ── Newsletter ── */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Mail className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Newsletter Subscription</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {nlLoading ? "Loading…" : nlEnabled ? "Visitors can subscribe via the newsletter form." : "Subscription form is hidden from visitors."}
              </p>
            </div>
          </div>
          {nlLoading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : (
            <button
              onClick={() => { const next = !nlEnabled; setNlEnabled(next); nlSave.mutate(next); }}
              disabled={nlSave.isPending}
              className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors focus:outline-none disabled:opacity-60 ${nlEnabled ? "bg-green-500" : "bg-secondary"}`}
            >
              <span className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform ${nlEnabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          )}
        </div>
        {!nlLoading && (
          <div className={`mt-4 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium w-fit ${nlEnabled ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-secondary/60 text-muted-foreground border border-border/40"}`}>
            {nlEnabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {nlEnabled ? "Subscriptions are ON — visitors can sign up" : "Subscriptions are OFF — form hidden from visitors"}
          </div>
        )}
      </Card>
    </div>
  );
}
