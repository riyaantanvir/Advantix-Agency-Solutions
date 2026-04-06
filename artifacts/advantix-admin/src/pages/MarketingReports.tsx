import { useState, useEffect, useCallback } from "react";
import {
  Loader2, TrendingUp, TrendingDown, Users, Eye, Target, Mail,
  BarChart2, Flame, DollarSign, Plus, Trash2, Edit2, Check, X,
  ArrowDown, Megaphone, Globe, ChevronRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const API = "/api";

/* ── Types ───────────────────────────────────────────────── */
type KPI = { current: number; previous: number; change: number };
type WeeklyData = {
  kpis: { sessions: KPI; pageviews: KPI; leads: KPI; contacts: KPI; urlClicks: KPI; avgTime: number; avgScroll: number };
  dailyTraffic: Array<{ day: string; dow: number; date: string; sessions: string; pageviews: string }>;
  dailyLeads: Array<{ day: string; dow: number; leads: string }>;
  topPages: Array<{ page_path: string; views: string; sessions: string }>;
  topSources: Array<{ source: string; sessions: string }>;
};

type FunnelStage = { stage: string; count: number; color: string; icon: string; rate?: number };
type FunnelData = {
  funnel: FunnelStage[];
  conversionRates: { visitorToEngaged: number; visitorToLead: number; leadToContact: number; overallRate: number };
  byChannel: Array<{ channel: string; visitors: string }>;
  dailyFunnel: Array<{ day: string; visitors: string }>;
};

type Campaign = {
  id: number; name: string; channel: string;
  spend: string; revenue: string; roi: string | null;
  start_date: string; end_date: string | null;
  status: "active" | "paused" | "completed"; notes: string | null;
  created_at: string;
};

/* ── Helpers ─────────────────────────────────────────────── */
const CHANNEL_OPTIONS = ["Google Ads", "Facebook Ads", "Instagram", "TikTok Ads", "Email", "WhatsApp", "Organic SEO", "YouTube", "LinkedIn", "Telegram", "Direct / Referral", "Other"];
const CHANNEL_ICONS: Record<string, string> = {
  "Google Ads": "🔍", "Facebook Ads": "📘", "Instagram": "📸", "TikTok Ads": "🎵",
  "Email": "📧", "WhatsApp": "💬", "Organic SEO": "🌿", "YouTube": "🎬",
  "LinkedIn": "💼", "Telegram": "✈️", "Direct / Referral": "🔗", "Other": "📡",
};

function fmtBDT(val: number) {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(val);
}
function fmtNum(n: number) { return n.toLocaleString(); }
function formatTime(s: number) { return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`; }

/* ── KPI Card ────────────────────────────────────────────── */
function KpiCard({ label, kpi, icon: Icon, color, suffix = "" }: {
  label: string; kpi: KPI; icon: React.ElementType; color: string; suffix?: string;
}) {
  const up = kpi.change >= 0;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${up ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
          {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {up ? "+" : ""}{kpi.change}%
        </div>
      </div>
      <p className="text-2xl font-bold tabular-nums">{fmtNum(kpi.current)}{suffix}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-xs text-muted-foreground/60 mt-0.5">Last week: {fmtNum(kpi.previous)}</p>
    </Card>
  );
}

/* ── Mini Bar ────────────────────────────────────────────── */
function MiniBar({ label, value, max, color = "bg-primary" }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground truncate w-36 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold tabular-nums w-10 text-right">{value}</span>
    </div>
  );
}

/* ── Weekly Report Tab ───────────────────────────────────── */
function WeeklyReportTab() {
  const [data, setData] = useState<WeeklyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API}/marketing/weekly-report`, { credentials: "include" })
      .then(r => r.json()).then(setData)
      .catch(() => setError("Failed to load weekly report"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-24"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
  if (error || !data) return <p className="text-destructive text-center py-8">{error || "No data"}</p>;

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dailyMap: Record<number, { sessions: number; pageviews: number; leads: number }> = {};
  data.dailyTraffic.forEach(r => { dailyMap[r.dow] = { sessions: parseInt(r.sessions), pageviews: parseInt(r.pageviews), leads: 0 }; });
  data.dailyLeads.forEach(r => { if (dailyMap[r.dow]) dailyMap[r.dow].leads = parseInt(r.leads); else dailyMap[r.dow] = { sessions: 0, pageviews: 0, leads: parseInt(r.leads) }; });
  const maxSessions = Math.max(...Object.values(dailyMap).map(d => d.sessions), 1);
  const maxLeads = Math.max(...Object.values(dailyMap).map(d => d.leads), 1);
  const maxPageView = Math.max(...data.topPages.map(p => parseInt(p.views)), 1);
  const maxSource = Math.max(...data.topSources.map(s => parseInt(s.sessions)), 1);

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard label="Sessions"    kpi={data.kpis.sessions}  icon={Users}   color="bg-blue-500"   />
        <KpiCard label="Page Views"  kpi={data.kpis.pageviews} icon={Eye}     color="bg-violet-500" />
        <KpiCard label="Leads"       kpi={data.kpis.leads}     icon={Target}  color="bg-amber-500"  />
        <KpiCard label="Contacts"    kpi={data.kpis.contacts}  icon={Mail}    color="bg-green-500"  />
        <KpiCard label="Link Clicks" kpi={data.kpis.urlClicks} icon={BarChart2} color="bg-pink-500" />
      </div>

      {/* Engagement summary */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-5 text-center bg-secondary/30">
          <p className="text-3xl font-bold text-primary">{formatTime(data.kpis.avgTime)}</p>
          <p className="text-sm text-muted-foreground mt-1">Avg. Time on Page</p>
        </Card>
        <Card className="p-5 text-center bg-secondary/30">
          <p className="text-3xl font-bold text-primary">{data.kpis.avgScroll}%</p>
          <p className="text-sm text-muted-foreground mt-1">Avg. Scroll Depth</p>
        </Card>
      </div>

      {/* Day-by-day chart */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-primary" /> This Week — Day by Day
        </h3>
        <div className="flex items-end gap-3">
          {DAYS.map((d, i) => {
            const row = dailyMap[i];
            const s = row?.sessions ?? 0;
            const l = row?.leads ?? 0;
            const sPct = Math.max(4, Math.round((s / maxSessions) * 100));
            const lPct = l > 0 ? Math.max(4, Math.round((l / maxLeads) * 100)) : 0;
            return (
              <div key={d} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end justify-center gap-0.5 h-20" title={`${d}: ${s} sessions, ${l} leads`}>
                  <div className="flex-1 bg-blue-500/70 hover:bg-blue-500 rounded-sm transition-all cursor-default" style={{ height: `${sPct}%` }} />
                  {lPct > 0 && <div className="w-1.5 bg-amber-400 rounded-sm" style={{ height: `${lPct}%` }} />}
                </div>
                <span className="text-[10px] text-muted-foreground">{d}</span>
                <span className="text-[10px] font-semibold tabular-nums text-blue-400">{s}</span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-blue-500/70 rounded-sm inline-block" /> Sessions</span>
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-2 bg-amber-400 rounded-sm inline-block" /> Leads</span>
        </div>
      </Card>

      {/* Top pages + sources */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.topPages.length > 0 && (
          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Eye className="w-4 h-4 text-violet-400" /> Top Pages This Week
            </h3>
            <div className="space-y-2">
              {data.topPages.map(p => (
                <MiniBar key={p.page_path} label={p.page_path} value={parseInt(p.views)} max={maxPageView} color="bg-violet-500" />
              ))}
            </div>
          </Card>
        )}
        {data.topSources.length > 0 && (
          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Globe className="w-4 h-4 text-green-400" /> Traffic Sources This Week
            </h3>
            <div className="space-y-2">
              {data.topSources.map(s => (
                <MiniBar key={s.source} label={s.source} value={parseInt(s.sessions)} max={maxSource} color="bg-green-500" />
              ))}
            </div>
          </Card>
        )}
      </div>

      {data.kpis.sessions.current === 0 && (
        <Card className="p-8 text-center">
          <BarChart2 className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="font-semibold mb-1">No data for this week yet</p>
          <p className="text-muted-foreground text-sm">Weekly data resets every Monday. Come back once visitors start arriving.</p>
        </Card>
      )}
    </div>
  );
}

/* ── Conversion Funnel Tab ───────────────────────────────── */
function ConversionFunnelTab() {
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [days, setDays] = useState(30);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API}/marketing/funnel?days=${days}`, { credentials: "include" })
      .then(r => r.json()).then(setData)
      .catch(() => setError("Failed to load funnel data"))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center py-24"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
  if (error || !data) return <p className="text-destructive text-center py-8">{error || "No data"}</p>;

  const topCount = data.funnel[0]?.count ?? 1;
  const maxChannel = Math.max(...data.byChannel.map(c => parseInt(c.visitors)), 1);

  const CHANNEL_COLORS = ["bg-blue-500", "bg-green-500", "bg-violet-500", "bg-amber-500", "bg-pink-500", "bg-cyan-500", "bg-orange-500", "bg-teal-500"];

  return (
    <div className="space-y-6">
      {/* Period picker */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground mr-1">Period:</span>
        {([7, 14, 30, 90] as const).map(d => (
          <button key={d} onClick={() => setDays(d)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${days === d ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground hover:text-foreground"}`}>
            {d}d
          </button>
        ))}
      </div>

      {/* Funnel visualization */}
      <Card className="p-6">
        <h3 className="text-sm font-semibold mb-6 flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" /> Conversion Funnel — Last {days} Days
        </h3>
        <div className="space-y-3">
          {data.funnel.map((stage, i) => {
            const pct = topCount > 0 ? Math.max(10, Math.round((stage.count / topCount) * 100)) : 10;
            const dropPct = i > 0 && data.funnel[i - 1].count > 0
              ? (100 - Math.round((stage.count / data.funnel[i - 1].count) * 100))
              : null;

            return (
              <div key={stage.stage}>
                {i > 0 && (
                  <div className="flex items-center justify-center gap-2 my-2 text-xs text-muted-foreground">
                    <ArrowDown className="w-3.5 h-3.5" />
                    {dropPct !== null && dropPct > 0 && (
                      <span className="text-red-400 font-semibold">-{dropPct}% drop-off</span>
                    )}
                    {stage.rate !== undefined && (
                      <span className="text-green-400 font-semibold">{stage.rate}% conversion</span>
                    )}
                  </div>
                )}
                <div className="relative" style={{ width: `${pct}%`, minWidth: "40%", margin: "0 auto" }}>
                  <div className={`${stage.color} rounded-xl px-4 py-3 flex items-center justify-between text-white`}>
                    <span className="flex items-center gap-2 font-semibold text-sm">
                      <span className="text-lg">{stage.icon}</span> {stage.stage}
                    </span>
                    <span className="text-xl font-bold tabular-nums">{fmtNum(stage.count)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Rate cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Visitor → Engaged", value: data.conversionRates.visitorToEngaged, color: "text-violet-400" },
          { label: "Visitor → Lead", value: data.conversionRates.visitorToLead, color: "text-amber-400" },
          { label: "Lead → Contact", value: data.conversionRates.leadToContact, color: "text-green-400" },
          { label: "Overall Rate", value: data.conversionRates.overallRate, color: "text-primary" },
        ].map(r => (
          <Card key={r.label} className="p-4 text-center">
            <p className={`text-2xl font-bold ${r.color}`}>{r.value}%</p>
            <p className="text-xs text-muted-foreground mt-1">{r.label}</p>
          </Card>
        ))}
      </div>

      {/* Channel breakdown */}
      {data.byChannel.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-400" /> Visitors by Source
          </h3>
          <div className="space-y-2">
            {data.byChannel.map((c, i) => (
              <MiniBar key={c.channel} label={`${CHANNEL_ICONS[c.channel] ?? "📡"} ${c.channel}`} value={parseInt(c.visitors)} max={maxChannel} color={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />
            ))}
          </div>
        </Card>
      )}

      {data.funnel[0]?.count === 0 && (
        <Card className="p-8 text-center">
          <Target className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="font-semibold mb-1">No funnel data yet</p>
          <p className="text-muted-foreground text-sm">Funnel builds from website traffic and lead/contact submissions.</p>
        </Card>
      )}
    </div>
  );
}

/* ── Campaign Modal ──────────────────────────────────────── */
function CampaignModal({ open, campaign, onClose, onSaved }: {
  open: boolean; campaign: Campaign | null; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!campaign;
  const [form, setForm] = useState({ name: "", channel: "Google Ads", spend: "", revenue: "", startDate: "", endDate: "", status: "active", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (campaign) {
      setForm({
        name: campaign.name, channel: campaign.channel,
        spend: campaign.spend, revenue: campaign.revenue,
        startDate: campaign.start_date?.split("T")[0] ?? "",
        endDate: campaign.end_date?.split("T")[0] ?? "",
        status: campaign.status, notes: campaign.notes ?? "",
      });
    } else {
      setForm({ name: "", channel: "Google Ads", spend: "", revenue: "", startDate: new Date().toISOString().split("T")[0], endDate: "", status: "active", notes: "" });
    }
    setError("");
  }, [campaign, open]);

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim() || !form.startDate) { setError("Name and start date are required"); return; }
    setSaving(true); setError("");
    const body = {
      name: form.name.trim(), channel: form.channel,
      spend: parseFloat(form.spend || "0"), revenue: parseFloat(form.revenue || "0"),
      startDate: form.startDate, endDate: form.endDate || undefined,
      status: form.status, notes: form.notes.trim() || undefined,
    };
    try {
      const url = isEdit ? `${API}/marketing/campaigns/${campaign!.id}` : `${API}/marketing/campaigns`;
      const method = isEdit ? "PATCH" : "POST";
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? "Save failed"); }
      onSaved();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-primary" />
            {isEdit ? "Edit Campaign" : "New Campaign"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label className="mb-1.5 block">Campaign Name <span className="text-destructive">*</span></Label>
            <Input placeholder="e.g. Ramadan Google Ads 2026" value={form.name} onChange={e => set("name", e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block">Channel <span className="text-destructive">*</span></Label>
            <select value={form.channel} onChange={e => set("channel", e.target.value)}
              className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
              {CHANNEL_OPTIONS.map(c => <option key={c} value={c}>{CHANNEL_ICONS[c]} {c}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">Spend (৳ BDT)</Label>
              <Input type="number" placeholder="0.00" min={0} value={form.spend} onChange={e => set("spend", e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5 block">Revenue (৳ BDT)</Label>
              <Input type="number" placeholder="0.00" min={0} value={form.revenue} onChange={e => set("revenue", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">Start Date <span className="text-destructive">*</span></Label>
              <Input type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5 block">End Date</Label>
              <Input type="date" value={form.endDate} onChange={e => set("endDate", e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block">Status</Label>
            <select value={form.status} onChange={e => set("status", e.target.value)}
              className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
              <option value="active">🟢 Active</option>
              <option value="paused">🟡 Paused</option>
              <option value="completed">✅ Completed</option>
            </select>
          </div>
          <div>
            <Label className="mb-1.5 block">Notes (optional)</Label>
            <textarea value={form.notes} onChange={e => set("notes", e.target.value)}
              rows={3} placeholder="Campaign goals, audience, creative notes…"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          {error && <p className="text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : isEdit ? "Save Changes" : "Add Campaign"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── ROI Tracker Tab ─────────────────────────────────────── */
function RoiTrackerTab() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const loadCampaigns = useCallback(() => {
    setLoading(true);
    fetch(`${API}/marketing/campaigns`, { credentials: "include" })
      .then(r => r.json()).then(setCampaigns)
      .catch(() => setError("Failed to load campaigns"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  const handleDelete = async (id: number) => {
    setDeleting(id);
    await fetch(`${API}/marketing/campaigns/${id}`, { method: "DELETE", credentials: "include" });
    setCampaigns(prev => prev.filter(c => c.id !== id));
    setDeleting(null);
  };

  const handleSaved = () => { setModalOpen(false); setEditing(null); loadCampaigns(); };

  // Totals
  const totalSpend   = campaigns.reduce((a, c) => a + parseFloat(c.spend),   0);
  const totalRevenue = campaigns.reduce((a, c) => a + parseFloat(c.revenue), 0);
  const totalROI     = totalSpend > 0 ? Math.round(((totalRevenue - totalSpend) / totalSpend) * 100) : null;

  const STATUS_BADGE: Record<string, string> = {
    active:    "bg-green-500/15 text-green-400",
    paused:    "bg-yellow-500/15 text-yellow-400",
    completed: "bg-secondary text-muted-foreground",
  };

  const maxSpend   = Math.max(...campaigns.map(c => parseFloat(c.spend)), 1);
  const maxRevenue = Math.max(...campaigns.map(c => parseFloat(c.revenue)), 1);
  const chartMax   = Math.max(maxSpend, maxRevenue, 1);

  if (loading) return <div className="flex items-center justify-center py-24"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
  if (error) return <p className="text-destructive text-center py-8">{error}</p>;

  return (
    <div className="space-y-6">
      {/* Header + Add button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-lg">Campaign ROI Tracker</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Track spend &amp; revenue per marketing campaign</p>
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> Add Campaign
        </Button>
      </div>

      {/* Summary cards */}
      {campaigns.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-4 text-center bg-red-500/10 border-red-500/20">
            <DollarSign className="w-5 h-5 text-red-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-red-400">{fmtBDT(totalSpend)}</p>
            <p className="text-xs text-muted-foreground">Total Spend</p>
          </Card>
          <Card className="p-4 text-center bg-green-500/10 border-green-500/20">
            <TrendingUp className="w-5 h-5 text-green-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-green-400">{fmtBDT(totalRevenue)}</p>
            <p className="text-xs text-muted-foreground">Total Revenue</p>
          </Card>
          <Card className={`p-4 text-center border ${totalROI === null ? "bg-secondary/30" : totalROI >= 0 ? "bg-primary/10 border-primary/20" : "bg-red-500/10 border-red-500/20"}`}>
            <Flame className={`w-5 h-5 mx-auto mb-1 ${totalROI === null ? "text-muted-foreground" : totalROI >= 0 ? "text-primary" : "text-red-400"}`} />
            <p className={`text-2xl font-bold ${totalROI === null ? "text-muted-foreground" : totalROI >= 0 ? "text-primary" : "text-red-400"}`}>
              {totalROI === null ? "—" : `${totalROI > 0 ? "+" : ""}${totalROI}%`}
            </p>
            <p className="text-xs text-muted-foreground">Overall ROI</p>
          </Card>
        </div>
      )}

      {/* Bar chart: spend vs revenue */}
      {campaigns.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-primary" /> Spend vs Revenue by Campaign
          </h3>
          <div className="flex items-end gap-4 h-28 overflow-x-auto pb-2">
            {campaigns.map(c => {
              const s = parseFloat(c.spend);
              const r = parseFloat(c.revenue);
              const sPct = Math.max(4, Math.round((s / chartMax) * 100));
              const rPct = Math.max(4, Math.round((r / chartMax) * 100));
              const roi = parseFloat(c.roi ?? "0");
              return (
                <div key={c.id} className="flex flex-col items-center gap-1 shrink-0" style={{ minWidth: "60px" }}
                  title={`${c.name}\nSpend: ${fmtBDT(s)}\nRevenue: ${fmtBDT(r)}\nROI: ${c.roi ?? "—"}%`}>
                  <span className={`text-[10px] font-bold ${roi >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {c.roi ? `${roi > 0 ? "+" : ""}${roi}%` : "—"}
                  </span>
                  <div className="flex items-end gap-0.5 w-full h-20">
                    <div className="flex-1 bg-red-400/60 hover:bg-red-400 rounded-t-sm cursor-default transition-all" style={{ height: `${sPct}%` }} />
                    <div className="flex-1 bg-green-500/70 hover:bg-green-500 rounded-t-sm cursor-default transition-all" style={{ height: `${rPct}%` }} />
                  </div>
                  <span className="text-[9px] text-muted-foreground truncate max-w-[60px] text-center">{c.name.split(" ").slice(0, 2).join(" ")}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-red-400/60 rounded-sm inline-block" /> Spend</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-green-500/70 rounded-sm inline-block" /> Revenue</span>
          </div>
        </Card>
      )}

      {/* Campaign list */}
      {campaigns.length === 0 ? (
        <Card className="p-10 text-center">
          <Megaphone className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="font-semibold mb-1">No campaigns yet</p>
          <p className="text-muted-foreground text-sm mb-4">Add your first campaign to start tracking ROI.</p>
          <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> Add First Campaign
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => {
            const spend   = parseFloat(c.spend);
            const revenue = parseFloat(c.revenue);
            const roi     = parseFloat(c.roi ?? "0");
            const roiPositive = c.roi === null ? null : roi >= 0;

            return (
              <Card key={c.id} className="p-4 hover:border-primary/30 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="text-2xl shrink-0 mt-0.5">{CHANNEL_ICONS[c.channel] ?? "📡"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-semibold text-foreground">{c.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[c.status]}`}>
                        {c.status === "active" ? "🟢 Active" : c.status === "paused" ? "🟡 Paused" : "✅ Done"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{c.channel} · {c.start_date?.split("T")[0]} {c.end_date ? `→ ${c.end_date.split("T")[0]}` : "(ongoing)"}</p>

                    {/* Spend/Revenue row */}
                    <div className="flex items-center gap-6 flex-wrap text-sm">
                      <div>
                        <span className="text-muted-foreground text-xs">Spend</span>
                        <p className="font-semibold text-red-400">{fmtBDT(spend)}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                      <div>
                        <span className="text-muted-foreground text-xs">Revenue</span>
                        <p className="font-semibold text-green-400">{fmtBDT(revenue)}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                      <div>
                        <span className="text-muted-foreground text-xs">ROI</span>
                        <p className={`font-bold text-lg ${roiPositive === null ? "text-muted-foreground" : roiPositive ? "text-primary" : "text-red-400"}`}>
                          {c.roi === null ? "—" : `${roi > 0 ? "+" : ""}${roi}%`}
                        </p>
                      </div>
                    </div>

                    {/* ROI bar */}
                    {spend > 0 && (
                      <div className="mt-2 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${revenue >= spend ? "bg-green-500" : "bg-red-400"}`}
                          style={{ width: `${Math.min(100, Math.max(4, Math.round((revenue / Math.max(spend, revenue)) * 100)))}%` }}
                        />
                      </div>
                    )}

                    {c.notes && <p className="text-xs text-muted-foreground mt-1.5 italic">{c.notes}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => { setEditing(c); setModalOpen(true); }}
                      className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Edit">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(c.id)} disabled={deleting === c.id}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Delete">
                      {deleting === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <CampaignModal open={modalOpen} campaign={editing} onClose={() => { setModalOpen(false); setEditing(null); }} onSaved={handleSaved} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ */
export default function MarketingReports() {
  const [tab, setTab] = useState<"weekly" | "funnel" | "roi">("weekly");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-primary" /> Marketing Reports
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Weekly performance, conversion funnel &amp; campaign ROI in one place</p>
      </div>

      {/* Tab switcher */}
      <div className="flex bg-secondary/40 p-1 rounded-xl gap-1">
        {([
          { key: "weekly", label: "📅 Weekly Report" },
          { key: "funnel", label: "🎯 Conversion Funnel" },
          { key: "roi",    label: "💰 ROI Tracker" },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${tab === t.key ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "weekly" && <WeeklyReportTab />}
      {tab === "funnel" && <ConversionFunnelTab />}
      {tab === "roi"    && <RoiTrackerTab />}
    </div>
  );
}
