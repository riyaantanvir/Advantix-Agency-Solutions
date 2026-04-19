import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Wallet, PlusCircle, ListChecks, BarChart2, CalendarClock, Repeat,
  Tag as TagIcon, CreditCard, Upload, Download, Trash2, Edit2, Save, X,
  TrendingUp, TrendingDown, Filter, FileSpreadsheet, ArrowLeft, Settings as SettingsIcon, Coins,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToolsUser } from "@/context/ToolsUserContext";

type View = "dashboard" | "add" | "all" | "planned" | "subs" | "settings";

interface Tag { id: number; name: string; color: string | null; }
interface PaymentMethod { id: number; name: string; }
interface FinanceSettings { userId: number; currencyCode: string; currencySymbol: string; }
interface Entry { id: number; date: string; type: "expense" | "income"; amount: string; details: string | null; tagId: number | null; paymentMethodId: number | null; }
interface PlannedPayment { id: number; tagId: number | null; amount: string; frequency: string; startDate: string; notes: string | null; }
interface Subscription { id: number; name: string; amount: string; frequency: string; nextDueDate: string; notes: string | null; active: boolean; }
interface DashboardData {
  income: number; expense: number; net: number;
  monthIncome: number; monthExpense: number; monthNet: number;
  byTag: { tagId: number | null; tagName: string; amount: number }[];
  byPaymentMethod: { pmId: number | null; pmName: string; amount: number }[];
  series: { date: string; type: string; amount: number }[];
}

// Currency symbol — mutated when user settings load. Read fresh on every render.
let CURRENCY_SYMBOL = "৳";
const BDT = (n: number | string) =>
  `${CURRENCY_SYMBOL} ` + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

async function api<T = any>(url: string, opts: RequestInit = {}): Promise<T> {
  const r = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  if (!r.ok) {
    let msg = `Request failed (${r.status})`;
    try { msg = (await r.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  return r.json();
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const NAV: { id: View; label: string; icon: any }[] = [
  { id: "dashboard", label: "Dashboard", icon: BarChart2 },
  { id: "add", label: "Add Entry", icon: PlusCircle },
  { id: "all", label: "All Entries", icon: ListChecks },
  { id: "planned", label: "Planned Payments", icon: CalendarClock },
  { id: "subs", label: "Subscriptions", icon: Repeat },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export default function FinancePage() {
  const { user, loading } = useToolsUser();
  const [, navigate] = useLocation();
  const [view, setView] = useState<View>("dashboard");
  const [tags, setTags] = useState<Tag[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/login"); return; }
    refreshLookups();
    api<FinanceSettings>("/api/tools/finance/settings").then(s => { setSettings(s); CURRENCY_SYMBOL = s.currencySymbol || "৳"; }).catch(() => {});
  }, [user, loading]);

  // Keep module-level symbol in sync if settings change later
  useEffect(() => {
    if (settings?.currencySymbol) CURRENCY_SYMBOL = settings.currencySymbol;
  }, [settings?.currencySymbol]);

  function refreshLookups() {
    api<Tag[]>("/api/tools/finance/tags").then(setTags).catch(() => {});
    api<PaymentMethod[]>("/api/tools/finance/payment-methods").then(setMethods).catch(() => {});
  }
  function bumpRefresh() { setRefreshKey(k => k + 1); refreshLookups(); }
  function onSettingsSaved(s: FinanceSettings) { setSettings(s); CURRENCY_SYMBOL = s.currencySymbol || "৳"; bumpRefresh(); }

  if (loading) return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-emerald-950/10 pt-20 pb-20">
      <div className="container max-w-7xl mx-auto px-4">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-8 gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/tools/dashboard")} className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition" title="Back">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Wallet className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Finance Management</h1>
              <p className="text-sm text-muted-foreground">Track income, expenses, plans &amp; subscriptions in BDT</p>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
          {/* Sidebar */}
          <nav className="bg-card/50 border border-border rounded-2xl p-2 h-max sticky top-24 backdrop-blur">
            {NAV.map(n => {
              const Icon = n.icon;
              const active = view === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => setView(n.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition mb-1 ${
                    active ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground border border-transparent"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{n.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Content */}
          <div className="min-w-0">
            {view === "dashboard" && <DashboardView refreshKey={refreshKey} tags={tags} methods={methods} onJump={setView} />}
            {view === "add" && <AddEntryView tags={tags} methods={methods} onSaved={bumpRefresh} onManageTags={() => setView("settings")} onManageMethods={() => setView("settings")} />}
            {view === "all" && <AllEntriesView refreshKey={refreshKey} tags={tags} methods={methods} onChange={bumpRefresh} />}
            {view === "planned" && <PlannedView refreshKey={refreshKey} tags={tags} onChange={bumpRefresh} />}
            {view === "subs" && <SubscriptionsView refreshKey={refreshKey} onChange={bumpRefresh} />}
            {view === "settings" && <SettingsView settings={settings} tags={tags} methods={methods} onChange={bumpRefresh} onSettingsSaved={onSettingsSaved} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── DATE PRESETS ─────────────── */
type DatePreset = "this-month" | "last-month" | "this-year" | "last-7" | "last-30" | "all" | "custom";
const ymd = (d: Date) => d.toISOString().slice(0, 10);
function presetRange(p: DatePreset): { from: string; to: string } {
  const today = new Date();
  const y = today.getFullYear(), m = today.getMonth();
  if (p === "this-month") return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) };
  if (p === "last-month") return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
  if (p === "this-year") return { from: ymd(new Date(y, 0, 1)), to: ymd(new Date(y, 11, 31)) };
  if (p === "last-7") { const s = new Date(today); s.setDate(s.getDate() - 6); return { from: ymd(s), to: ymd(today) }; }
  if (p === "last-30") { const s = new Date(today); s.setDate(s.getDate() - 29); return { from: ymd(s), to: ymd(today) }; }
  return { from: "", to: "" };
}

/* ─────────────── DASHBOARD ─────────────── */
function DashboardView({ refreshKey, tags, methods, onJump }: { refreshKey: number; tags: Tag[]; methods: PaymentMethod[]; onJump: (v: View) => void }) {
  const initial = presetRange("this-month");
  const [preset, setPreset] = useState<DatePreset>("this-month");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [tagId, setTagId] = useState("");
  const [pmId, setPmId] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<"tag" | "pm">("tag");

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (tagId) qs.set("tagId", tagId);
    if (pmId) qs.set("paymentMethodId", pmId);
    api<DashboardData>("/api/tools/finance/dashboard?" + qs.toString())
      .then(setData)
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, [from, to, tagId, pmId, refreshKey]);

  const breakdown = data ? (report === "tag" ? data.byTag.map(b => ({ name: b.tagName, amount: b.amount })) : data.byPaymentMethod.map(b => ({ name: b.pmName, amount: b.amount }))) : [];
  const breakdownTotal = breakdown.reduce((s, b) => s + b.amount, 0);

  return (
    <div className="space-y-6">
      <FilterBar
        from={from} to={to}
        setFrom={(v) => { setPreset("custom"); setFrom(v); }}
        setTo={(v) => { setPreset("custom"); setTo(v); }}
        tagId={tagId} setTagId={setTagId} pmId={pmId} setPmId={setPmId}
        tags={tags} methods={methods}
        preset={preset}
        setPreset={(p) => { setPreset(p); const r = presetRange(p); setFrom(r.from); setTo(r.to); }}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Income" value={loading ? "…" : BDT(data?.income || 0)} icon={TrendingUp} color="text-green-400" bg="bg-green-500/10" />
        <StatCard label="Total Expense" value={loading ? "…" : BDT(data?.expense || 0)} icon={TrendingDown} color="text-red-400" bg="bg-red-500/10" />
        <StatCard label="Net Balance" value={loading ? "…" : BDT(data?.net || 0)} icon={Wallet} color={data && data.net >= 0 ? "text-emerald-400" : "text-amber-400"} bg="bg-emerald-500/10" />
        <StatCard label="This Month" value={loading ? "…" : BDT(data?.monthNet || 0)} sub={data ? `In: ${BDT(data.monthIncome)} · Out: ${BDT(data.monthExpense)}` : ""} icon={CalendarClock} color="text-violet-400" bg="bg-violet-500/10" />
      </div>

      <div className="bg-card/50 border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="font-semibold">Expense Breakdown</h3>
          <div className="flex gap-2">
            <button onClick={() => setReport("tag")} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${report === "tag" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-muted/40 text-muted-foreground border border-transparent"}`}>By Tag</button>
            <button onClick={() => setReport("pm")} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${report === "pm" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-muted/40 text-muted-foreground border border-transparent"}`}>By Payment Method</button>
          </div>
        </div>
        {breakdown.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No expense data for this filter.</p>
        ) : (
          <div className="space-y-2">
            {breakdown.sort((a, b) => b.amount - a.amount).map(b => {
              const pct = breakdownTotal ? (b.amount / breakdownTotal) * 100 : 0;
              return (
                <div key={b.name} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{b.name}</span>
                    <span className="text-muted-foreground">{BDT(b.amount)} <span className="text-xs">({pct.toFixed(1)}%)</span></span>
                  </div>
                  <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => onJump("add")} className="bg-emerald-600 hover:bg-emerald-700"><PlusCircle className="w-4 h-4 mr-2" />Add Entry</Button>
        <Button variant="outline" onClick={() => onJump("all")}><ListChecks className="w-4 h-4 mr-2" />View All Entries</Button>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, color, bg }: { label: string; value: string; sub?: string; icon: any; color: string; bg: string }) {
  return (
    <div className="bg-card/50 border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
      </div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function FilterBar({ from, to, setFrom, setTo, tagId, setTagId, pmId, setPmId, tags, methods, type, setType, preset, setPreset }: {
  from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void;
  tagId: string; setTagId: (v: string) => void; pmId: string; setPmId: (v: string) => void;
  tags: Tag[]; methods: PaymentMethod[]; type?: string; setType?: (v: string) => void;
  preset?: DatePreset; setPreset?: (p: DatePreset) => void;
}) {
  const presets: { key: DatePreset; label: string }[] = [
    { key: "this-month", label: "This Month" },
    { key: "last-month", label: "Last Month" },
    { key: "last-7", label: "Last 7 Days" },
    { key: "last-30", label: "Last 30 Days" },
    { key: "this-year", label: "This Year" },
    { key: "all", label: "All Time" },
  ];
  return (
    <div className="bg-card/50 border border-border rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
        <Filter className="w-4 h-4" /> Filters
      </div>
      {setPreset && (
        <div className="flex flex-wrap gap-2 mb-3">
          {presets.map(p => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                preset === p.key
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                  : "bg-muted/30 text-muted-foreground border-transparent hover:border-border"
              }`}
            >
              {p.label}
            </button>
          ))}
          {preset === "custom" && (
            <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-500/20 text-violet-300 border border-violet-500/30">Custom</span>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">From</label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">To</label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Tag</label>
          <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={tagId} onChange={e => setTagId(e.target.value)}>
            <option value="">All</option>
            {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Payment</label>
          <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={pmId} onChange={e => setPmId(e.target.value)}>
            <option value="">All</option>
            {methods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        {setType && (
          <div>
            <label className="text-xs text-muted-foreground">Type</label>
            <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={type} onChange={e => setType(e.target.value)}>
              <option value="">All</option>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────── ADD ENTRY ─────────────── */
function AddEntryView({ tags, methods, onSaved, onManageTags, onManageMethods }: { tags: Tag[]; methods: PaymentMethod[]; onSaved: () => void; onManageTags: () => void; onManageMethods: () => void }) {
  const [date, setDate] = useState(todayStr());
  const [type, setType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [details, setDetails] = useState("");
  const [tagId, setTagId] = useState("");
  const [pmId, setPmId] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function save() {
    if (!amount || Number(amount) <= 0) { setMsg("Amount must be > 0"); return; }
    setSaving(true); setMsg("");
    try {
      await api("/api/tools/finance/entries", {
        method: "POST",
        body: JSON.stringify({ date, type, amount, details, tagId: tagId || null, paymentMethodId: pmId || null }),
      });
      setAmount(""); setDetails("");
      setMsg("✓ Entry saved");
      onSaved();
      setTimeout(() => setMsg(""), 2500);
    } catch (e: any) { setMsg(e.message); } finally { setSaving(false); }
  }

  async function importCsv(file: File) {
    const text = await file.text();
    setMsg("Importing…");
    try {
      const r = await api<{ imported: number; skipped: number }>("/api/tools/finance/entries/import", {
        method: "POST", body: JSON.stringify({ csv: text }),
      });
      setMsg(`✓ Imported ${r.imported}, skipped ${r.skipped}`);
      onSaved();
    } catch (e: any) { setMsg(e.message); }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-6">
      <div className="bg-card/50 border border-border rounded-2xl p-6 space-y-4">
        <h3 className="font-semibold text-lg flex items-center gap-2"><PlusCircle className="w-5 h-5 text-emerald-400" />New Entry</h3>

        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-muted-foreground">Date</label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div>
            <label className="text-xs text-muted-foreground">Type</label>
            <div className="flex gap-2 mt-1">
              <button type="button" onClick={() => setType("expense")} className={`flex-1 py-2 rounded-md text-sm font-medium border ${type === "expense" ? "bg-red-500/15 text-red-300 border-red-500/40" : "bg-muted/30 text-muted-foreground border-transparent"}`}>Expense</button>
              <button type="button" onClick={() => setType("income")} className={`flex-1 py-2 rounded-md text-sm font-medium border ${type === "income" ? "bg-green-500/15 text-green-300 border-green-500/40" : "bg-muted/30 text-muted-foreground border-transparent"}`}>Income</button>
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Amount (BDT)</label>
          <Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Details</label>
          <Input value={details} onChange={e => setDetails(e.target.value)} placeholder="What was it for?" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between"><label className="text-xs text-muted-foreground">Tag</label><button onClick={onManageTags} className="text-[11px] text-emerald-400 hover:underline">Manage</button></div>
            <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={tagId} onChange={e => setTagId(e.target.value)}>
              <option value="">— None —</option>
              {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between"><label className="text-xs text-muted-foreground">Payment Method</label><button onClick={onManageMethods} className="text-[11px] text-emerald-400 hover:underline">Manage</button></div>
            <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={pmId} onChange={e => setPmId(e.target.value)}>
              <option value="">— None —</option>
              {methods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            <Save className="w-4 h-4 mr-2" />{saving ? "Saving…" : "Save Entry"}
          </Button>
          {msg && <span className={`text-sm ${msg.startsWith("✓") ? "text-green-400" : "text-amber-400"}`}>{msg}</span>}
        </div>
      </div>

      <div className="bg-card/50 border border-border rounded-2xl p-6 space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-violet-400" />Bulk CSV Import</h3>
        <p className="text-sm text-muted-foreground">Upload a CSV with columns: Date, Type, Amount, Details, Tag, PaymentMethod. Tags &amp; methods are auto-created.</p>
        <div className="flex flex-wrap gap-3">
          <a href="/api/tools/finance/entries/template.csv" className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-muted/40 hover:bg-muted/60 text-sm border border-border">
            <Download className="w-4 h-4" /> Download Template
          </a>
          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-violet-600 hover:bg-violet-700 text-sm text-white cursor-pointer">
            <Upload className="w-4 h-4" /> Upload CSV
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => e.target.files?.[0] && importCsv(e.target.files[0])} />
          </label>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── ALL ENTRIES ─────────────── */
function AllEntriesView({ refreshKey, tags, methods, onChange }: { refreshKey: number; tags: Tag[]; methods: PaymentMethod[]; onChange: () => void }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tagId, setTagId] = useState("");
  const [pmId, setPmId] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;
  const [data, setData] = useState<{ rows: Entry[]; total: number }>({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<number | null>(null);
  const [editVals, setEditVals] = useState<Partial<Entry>>({});

  const tagMap = useMemo(() => new Map(tags.map(t => [t.id, t.name])), [tags]);
  const pmMap = useMemo(() => new Map(methods.map(m => [m.id, m.name])), [methods]);

  function reload() {
    setLoading(true);
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (tagId) qs.set("tagId", tagId);
    if (pmId) qs.set("paymentMethodId", pmId);
    if (type) qs.set("type", type);
    qs.set("limit", String(PAGE_SIZE));
    qs.set("offset", String(page * PAGE_SIZE));
    api<{ rows: Entry[]; total: number }>("/api/tools/finance/entries?" + qs.toString())
      .then(setData).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(reload, [from, to, tagId, pmId, type, page, refreshKey]);
  useEffect(() => { setPage(0); }, [from, to, tagId, pmId, type]);

  async function del(id: number) {
    if (!confirm("Delete this entry?")) return;
    await api(`/api/tools/finance/entries/${id}`, { method: "DELETE" });
    reload(); onChange();
  }
  async function delAll() {
    if (!confirm("Delete ALL your entries? This cannot be undone.")) return;
    await api("/api/tools/finance/entries", { method: "DELETE" });
    reload(); onChange();
  }
  function startEdit(e: Entry) {
    setEditId(e.id);
    setEditVals({ date: e.date, type: e.type, amount: e.amount, details: e.details || "", tagId: e.tagId, paymentMethodId: e.paymentMethodId });
  }
  async function saveEdit() {
    if (editId == null) return;
    await api(`/api/tools/finance/entries/${editId}`, { method: "PATCH", body: JSON.stringify(editVals) });
    setEditId(null); reload(); onChange();
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const exportUrl = useMemo(() => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    return "/api/tools/finance/entries/export.csv?" + qs.toString();
  }, [from, to]);

  return (
    <div className="space-y-4">
      <FilterBar from={from} to={to} setFrom={setFrom} setTo={setTo} tagId={tagId} setTagId={setTagId} pmId={pmId} setPmId={setPmId} tags={tags} methods={methods} type={type} setType={setType} />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm text-muted-foreground">{data.total} entries</div>
        <div className="flex gap-2">
          <a href={exportUrl} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/40 hover:bg-muted/60 text-sm border border-border">
            <Download className="w-4 h-4" /> Export CSV
          </a>
          <Button variant="destructive" size="sm" onClick={delAll}><Trash2 className="w-4 h-4 mr-1" />Delete All</Button>
        </div>
      </div>

      <div className="bg-card/50 border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left p-3">Date</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">Details</th>
                <th className="text-right p-3">Amount</th>
                <th className="text-left p-3">Tag</th>
                <th className="text-left p-3">Payment</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Loading…</td></tr>}
              {!loading && data.rows.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No entries found.</td></tr>}
              {!loading && data.rows.map(e => editId === e.id ? (
                <tr key={e.id} className="border-t border-border bg-emerald-500/5">
                  <td className="p-2"><Input type="date" value={editVals.date as string} onChange={ev => setEditVals(v => ({ ...v, date: ev.target.value }))} className="h-8" /></td>
                  <td className="p-2">
                    <select className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs" value={editVals.type} onChange={ev => setEditVals(v => ({ ...v, type: ev.target.value as any }))}>
                      <option value="expense">Expense</option><option value="income">Income</option>
                    </select>
                  </td>
                  <td className="p-2"><Input value={editVals.details as string || ""} onChange={ev => setEditVals(v => ({ ...v, details: ev.target.value }))} className="h-8" /></td>
                  <td className="p-2"><Input type="number" value={editVals.amount as string} onChange={ev => setEditVals(v => ({ ...v, amount: ev.target.value }))} className="h-8 text-right" /></td>
                  <td className="p-2">
                    <select className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs" value={editVals.tagId || ""} onChange={ev => setEditVals(v => ({ ...v, tagId: ev.target.value ? Number(ev.target.value) : null }))}>
                      <option value="">—</option>{tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                  <td className="p-2">
                    <select className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs" value={editVals.paymentMethodId || ""} onChange={ev => setEditVals(v => ({ ...v, paymentMethodId: ev.target.value ? Number(ev.target.value) : null }))}>
                      <option value="">—</option>{methods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </td>
                  <td className="p-2 text-right">
                    <button onClick={saveEdit} className="p-1.5 text-green-400 hover:bg-green-500/10 rounded"><Save className="w-4 h-4" /></button>
                    <button onClick={() => setEditId(null)} className="p-1.5 text-muted-foreground hover:bg-muted/40 rounded"><X className="w-4 h-4" /></button>
                  </td>
                </tr>
              ) : (
                <tr key={e.id} className="border-t border-border hover:bg-muted/20">
                  <td className="p-3 whitespace-nowrap text-muted-foreground">{e.date}</td>
                  <td className="p-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${e.type === "income" ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>{e.type}</span>
                  </td>
                  <td className="p-3 max-w-xs truncate">{e.details || <span className="text-muted-foreground italic">—</span>}</td>
                  <td className={`p-3 text-right font-mono font-semibold ${e.type === "income" ? "text-green-400" : "text-red-400"}`}>{BDT(e.amount)}</td>
                  <td className="p-3 text-muted-foreground">{e.tagId ? tagMap.get(e.tagId) || "—" : "—"}</td>
                  <td className="p-3 text-muted-foreground">{e.paymentMethodId ? pmMap.get(e.paymentMethodId) || "—" : "—"}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <button onClick={() => startEdit(e)} className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded" title="Edit"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => del(e.id)} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded" title="Delete"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-border bg-muted/20">
            <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="px-3 py-1 rounded text-sm bg-muted hover:bg-muted/70 disabled:opacity-40">Prev</button>
            <span className="text-sm text-muted-foreground">Page {page + 1} / {totalPages}</span>
            <button disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 rounded text-sm bg-muted hover:bg-muted/70 disabled:opacity-40">Next</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────── PLANNED PAYMENTS ─────────────── */
function PlannedView({ refreshKey, tags, onChange }: { refreshKey: number; tags: Tag[]; onChange: () => void }) {
  const [list, setList] = useState<PlannedPayment[]>([]);
  const [tagId, setTagId] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [startDate, setStartDate] = useState(todayStr());
  const [notes, setNotes] = useState("");
  const [totalExpense, setTotalExpense] = useState(0);

  function reload() {
    api<PlannedPayment[]>("/api/tools/finance/planned").then(setList).catch(() => {});
    api<DashboardData>("/api/tools/finance/dashboard").then(d => setTotalExpense(d.expense)).catch(() => {});
  }
  useEffect(reload, [refreshKey]);

  async function add() {
    if (!amount || Number(amount) <= 0) return;
    await api("/api/tools/finance/planned", {
      method: "POST",
      body: JSON.stringify({ tagId: tagId || null, amount, frequency, startDate, notes }),
    });
    setAmount(""); setNotes(""); reload(); onChange();
  }
  async function del(id: number) {
    if (!confirm("Delete this plan?")) return;
    await api(`/api/tools/finance/planned/${id}`, { method: "DELETE" });
    reload();
  }

  const totalPlanned = list.reduce((s, p) => s + Number(p.amount), 0);
  const tagMap = new Map(tags.map(t => [t.id, t.name]));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Total Planned" value={BDT(totalPlanned)} icon={CalendarClock} color="text-blue-400" bg="bg-blue-500/10" />
        <StatCard label="Total Expense (so far)" value={BDT(totalExpense)} icon={TrendingDown} color="text-red-400" bg="bg-red-500/10" />
      </div>

      <div className="bg-card/50 border border-border rounded-2xl p-5 space-y-3">
        <h3 className="font-semibold">Add Planned Payment</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Tag</label>
            <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={tagId} onChange={e => setTagId(e.target.value)}>
              <option value="">— None —</option>
              {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div><label className="text-xs text-muted-foreground">Amount</label><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" /></div>
          <div>
            <label className="text-xs text-muted-foreground">Frequency</label>
            <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={frequency} onChange={e => setFrequency(e.target.value)}>
              <option value="once">One-time</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option>
            </select>
          </div>
          <div><label className="text-xs text-muted-foreground">Start Date</label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
          <div className="flex items-end"><Button onClick={add} className="w-full bg-emerald-600 hover:bg-emerald-700">Add Plan</Button></div>
        </div>
        <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {list.length === 0 && <p className="text-muted-foreground text-sm col-span-2 text-center py-8">No planned payments yet.</p>}
        {list.map(p => (
          <div key={p.id} className="bg-card/50 border border-border rounded-2xl p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="text-xs text-muted-foreground">{p.tagId ? tagMap.get(p.tagId) || "Untagged" : "Untagged"}</div>
                <div className="text-2xl font-bold text-emerald-400">{BDT(p.amount)}</div>
              </div>
              <button onClick={() => del(p.id)} className="text-red-400 hover:bg-red-500/10 p-1 rounded"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div><span className="capitalize">{p.frequency}</span> · from {p.startDate}</div>
              {p.notes && <div className="italic">{p.notes}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────── SUBSCRIPTIONS ─────────────── */
function SubscriptionsView({ refreshKey, onChange }: { refreshKey: number; onChange: () => void }) {
  const [list, setList] = useState<Subscription[]>([]);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [nextDueDate, setNextDueDate] = useState(todayStr());
  const [notes, setNotes] = useState("");

  function reload() { api<Subscription[]>("/api/tools/finance/subscriptions").then(setList).catch(() => {}); }
  useEffect(reload, [refreshKey]);

  async function add() {
    if (!name || !amount) return;
    await api("/api/tools/finance/subscriptions", {
      method: "POST",
      body: JSON.stringify({ name, amount, frequency, nextDueDate, notes, active: true }),
    });
    setName(""); setAmount(""); setNotes(""); reload(); onChange();
  }
  async function del(id: number) {
    if (!confirm("Delete this subscription?")) return;
    await api(`/api/tools/finance/subscriptions/${id}`, { method: "DELETE" });
    reload();
  }
  async function toggleActive(s: Subscription) {
    await api(`/api/tools/finance/subscriptions/${s.id}`, { method: "PATCH", body: JSON.stringify({ active: !s.active }) });
    reload();
  }

  const monthlyCost = list.filter(s => s.active).reduce((sum, s) => {
    const amt = Number(s.amount);
    if (s.frequency === "monthly") return sum + amt;
    if (s.frequency === "yearly") return sum + amt / 12;
    if (s.frequency === "weekly") return sum + amt * 4.33;
    return sum;
  }, 0);

  return (
    <div className="space-y-5">
      <StatCard label="Estimated Monthly Cost (active)" value={BDT(monthlyCost)} icon={Repeat} color="text-violet-400" bg="bg-violet-500/10" />

      <div className="bg-card/50 border border-border rounded-2xl p-5 space-y-3">
        <h3 className="font-semibold">Add Subscription</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div><label className="text-xs text-muted-foreground">Name</label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Netflix" /></div>
          <div><label className="text-xs text-muted-foreground">Amount</label><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="500" /></div>
          <div>
            <label className="text-xs text-muted-foreground">Frequency</label>
            <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={frequency} onChange={e => setFrequency(e.target.value)}>
              <option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option>
            </select>
          </div>
          <div><label className="text-xs text-muted-foreground">Next Due</label><Input type="date" value={nextDueDate} onChange={e => setNextDueDate(e.target.value)} /></div>
          <div className="flex items-end"><Button onClick={add} className="w-full bg-emerald-600 hover:bg-emerald-700">Add</Button></div>
        </div>
        <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {list.length === 0 && <p className="text-muted-foreground text-sm col-span-2 text-center py-8">No subscriptions yet.</p>}
        {list.map(s => (
          <div key={s.id} className={`border rounded-2xl p-4 ${s.active ? "bg-card/50 border-border" : "bg-muted/20 border-border opacity-60"}`}>
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="font-semibold">{s.name}</div>
                <div className="text-2xl font-bold text-emerald-400">{BDT(s.amount)} <span className="text-xs text-muted-foreground font-normal">/ {s.frequency}</span></div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => toggleActive(s)} className={`text-xs px-2 py-1 rounded ${s.active ? "bg-green-500/15 text-green-400" : "bg-muted/40 text-muted-foreground"}`}>{s.active ? "Active" : "Paused"}</button>
                <button onClick={() => del(s.id)} className="text-red-400 hover:bg-red-500/10 p-1 rounded"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>Next due: {s.nextDueDate}</div>
              {s.notes && <div className="italic">{s.notes}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────── SETTINGS ─────────────── */
const PRESET_CURRENCIES: { code: string; symbol: string; label: string }[] = [
  { code: "BDT", symbol: "৳", label: "Bangladeshi Taka (৳)" },
  { code: "USD", symbol: "$", label: "US Dollar ($)" },
  { code: "EUR", symbol: "€", label: "Euro (€)" },
  { code: "GBP", symbol: "£", label: "British Pound (£)" },
  { code: "INR", symbol: "₹", label: "Indian Rupee (₹)" },
  { code: "JPY", symbol: "¥", label: "Japanese Yen (¥)" },
  { code: "AED", symbol: "د.إ", label: "UAE Dirham (د.إ)" },
  { code: "SAR", symbol: "﷼", label: "Saudi Riyal (﷼)" },
  { code: "PKR", symbol: "₨", label: "Pakistani Rupee (₨)" },
];

function SettingsView({ settings, tags, methods, onChange, onSettingsSaved }: {
  settings: FinanceSettings | null; tags: Tag[]; methods: PaymentMethod[];
  onChange: () => void; onSettingsSaved: (s: FinanceSettings) => void;
}) {
  const [tab, setTab] = useState<"general" | "tags" | "methods">("general");
  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-border">
        {([
          { k: "general", l: "General", i: Coins },
          { k: "tags", l: "Tags", i: TagIcon },
          { k: "methods", l: "Payment Methods", i: CreditCard },
        ] as const).map(t => {
          const Icon = t.i;
          const active = tab === t.k;
          return (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                active ? "border-emerald-500 text-emerald-300" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" /> {t.l}
            </button>
          );
        })}
      </div>
      {tab === "general" && <GeneralSettings settings={settings} onSaved={onSettingsSaved} />}
      {tab === "tags" && <TagsView tags={tags} onChange={onChange} />}
      {tab === "methods" && <MethodsView methods={methods} onChange={onChange} />}
    </div>
  );
}

function GeneralSettings({ settings, onSaved }: { settings: FinanceSettings | null; onSaved: (s: FinanceSettings) => void }) {
  const [code, setCode] = useState(settings?.currencyCode || "BDT");
  const [symbol, setSymbol] = useState(settings?.currencySymbol || "৳");
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!settings) return;
    setCode(settings.currencyCode);
    setSymbol(settings.currencySymbol);
    setCustom(!PRESET_CURRENCIES.some(p => p.code === settings.currencyCode));
  }, [settings?.currencyCode, settings?.currencySymbol]);

  function pick(c: string) {
    if (c === "__custom") { setCustom(true); return; }
    setCustom(false);
    const found = PRESET_CURRENCIES.find(p => p.code === c);
    if (found) { setCode(found.code); setSymbol(found.symbol); }
  }

  async function save() {
    setBusy(true); setMsg("");
    try {
      const saved = await api<FinanceSettings>("/api/tools/finance/settings", {
        method: "PUT",
        body: JSON.stringify({ currencyCode: code.trim().toUpperCase(), currencySymbol: symbol.trim() }),
      });
      onSaved(saved);
      setMsg("Saved ✓");
      setTimeout(() => setMsg(""), 2000);
    } catch (e: any) {
      setMsg(e.message || "Failed to save");
    } finally { setBusy(false); }
  }

  return (
    <div className="bg-card/50 border border-border rounded-2xl p-5 space-y-5">
      <div>
        <h3 className="font-semibold flex items-center gap-2 mb-1"><Coins className="w-4 h-4 text-amber-400" /> Currency</h3>
        <p className="text-xs text-muted-foreground">All amounts on the dashboard, entries, and reports use this currency.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <label className="text-xs text-muted-foreground">Preset</label>
          <select
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={custom ? "__custom" : code}
            onChange={e => pick(e.target.value)}
          >
            {PRESET_CURRENCIES.map(p => <option key={p.code} value={p.code}>{p.label}</option>)}
            <option value="__custom">Custom…</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Symbol</label>
          <Input value={symbol} onChange={e => setSymbol(e.target.value.slice(0, 8))} disabled={!custom} maxLength={8} />
        </div>
      </div>

      {custom && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Currency Code (3–8 letters)</label>
            <Input value={code} onChange={e => setCode(e.target.value.toUpperCase().slice(0, 8))} placeholder="e.g. CAD" maxLength={8} />
          </div>
        </div>
      )}

      <div className="rounded-xl bg-muted/30 p-4">
        <p className="text-xs text-muted-foreground mb-1">Preview</p>
        <p className="text-2xl font-bold tabular-nums">{symbol} {(12345.67).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</p>
        <p className="text-xs text-muted-foreground mt-1">{code}</p>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={busy || !code.trim() || !symbol.trim()} className="bg-emerald-600 hover:bg-emerald-700">
          <Save className="w-4 h-4 mr-2" /> {busy ? "Saving…" : "Save"}
        </Button>
        {msg && <span className={`text-sm ${msg.startsWith("Saved") ? "text-emerald-400" : "text-red-400"}`}>{msg}</span>}
      </div>
    </div>
  );
}

/* ─────────────── TAGS ─────────────── */
function TagsView({ tags, onChange }: { tags: Tag[]; onChange: () => void }) {
  const [name, setName] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [msg, setMsg] = useState("");

  async function add() {
    if (!name.trim()) return;
    try {
      await api("/api/tools/finance/tags", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
      setName(""); onChange();
    } catch (e: any) { setMsg(e.message); setTimeout(() => setMsg(""), 2500); }
  }
  async function del(id: number) {
    if (!confirm("Delete this tag? Entries using it will become untagged.")) return;
    await api(`/api/tools/finance/tags/${id}`, { method: "DELETE" });
    onChange();
  }
  async function saveEdit() {
    if (editId == null) return;
    await api(`/api/tools/finance/tags/${editId}`, { method: "PATCH", body: JSON.stringify({ name: editName }) });
    setEditId(null); onChange();
  }
  async function initDefaults() {
    await api("/api/tools/finance/tags/init", { method: "POST" });
    onChange();
  }

  return (
    <div className="space-y-5">
      <div className="bg-card/50 border border-border rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2"><TagIcon className="w-5 h-5 text-emerald-400" />Manage Tags</h3>
          <Button variant="outline" size="sm" onClick={initDefaults}>Initialize Defaults</Button>
        </div>
        <div className="flex gap-2">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="New tag name" onKeyDown={e => e.key === "Enter" && add()} />
          <Button onClick={add} className="bg-emerald-600 hover:bg-emerald-700"><PlusCircle className="w-4 h-4 mr-1" />Add</Button>
        </div>
        {msg && <p className="text-amber-400 text-xs">{msg}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {tags.length === 0 && <p className="text-muted-foreground text-sm col-span-2 text-center py-8">No tags yet. Add one above or initialize defaults.</p>}
        {tags.map(t => (
          <div key={t.id} className="bg-card/50 border border-border rounded-xl p-3 flex items-center justify-between">
            {editId === t.id ? (
              <>
                <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8 mr-2" />
                <div className="flex gap-1">
                  <button onClick={saveEdit} className="p-1.5 text-green-400 hover:bg-green-500/10 rounded"><Save className="w-4 h-4" /></button>
                  <button onClick={() => setEditId(null)} className="p-1.5 text-muted-foreground hover:bg-muted/40 rounded"><X className="w-4 h-4" /></button>
                </div>
              </>
            ) : (
              <>
                <span className="font-medium">{t.name}</span>
                <div className="flex gap-1">
                  <button onClick={() => { setEditId(t.id); setEditName(t.name); }} className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => del(t.id)} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded"><Trash2 className="w-4 h-4" /></button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────── PAYMENT METHODS ─────────────── */
function MethodsView({ methods, onChange }: { methods: PaymentMethod[]; onChange: () => void }) {
  const [name, setName] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [msg, setMsg] = useState("");

  async function add() {
    if (!name.trim()) return;
    try {
      await api("/api/tools/finance/payment-methods", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
      setName(""); onChange();
    } catch (e: any) { setMsg(e.message); setTimeout(() => setMsg(""), 2500); }
  }
  async function del(id: number) {
    if (!confirm("Delete this payment method?")) return;
    await api(`/api/tools/finance/payment-methods/${id}`, { method: "DELETE" });
    onChange();
  }
  async function saveEdit() {
    if (editId == null) return;
    await api(`/api/tools/finance/payment-methods/${editId}`, { method: "PATCH", body: JSON.stringify({ name: editName }) });
    setEditId(null); onChange();
  }

  return (
    <div className="space-y-5">
      <div className="bg-card/50 border border-border rounded-2xl p-5 space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><CreditCard className="w-5 h-5 text-emerald-400" />Manage Payment Methods</h3>
        <div className="flex gap-2">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Cash, bKash, Bank Transfer…" onKeyDown={e => e.key === "Enter" && add()} />
          <Button onClick={add} className="bg-emerald-600 hover:bg-emerald-700"><PlusCircle className="w-4 h-4 mr-1" />Add</Button>
        </div>
        {msg && <p className="text-amber-400 text-xs">{msg}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {methods.length === 0 && <p className="text-muted-foreground text-sm col-span-2 text-center py-8">No payment methods yet.</p>}
        {methods.map(m => (
          <div key={m.id} className="bg-card/50 border border-border rounded-xl p-3 flex items-center justify-between">
            {editId === m.id ? (
              <>
                <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8 mr-2" />
                <div className="flex gap-1">
                  <button onClick={saveEdit} className="p-1.5 text-green-400 hover:bg-green-500/10 rounded"><Save className="w-4 h-4" /></button>
                  <button onClick={() => setEditId(null)} className="p-1.5 text-muted-foreground hover:bg-muted/40 rounded"><X className="w-4 h-4" /></button>
                </div>
              </>
            ) : (
              <>
                <span className="font-medium">{m.name}</span>
                <div className="flex gap-1">
                  <button onClick={() => { setEditId(m.id); setEditName(m.name); }} className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => del(m.id)} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded"><Trash2 className="w-4 h-4" /></button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
