import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Mail, Send, FileText, Users, BarChart3, Settings2,
  Plus, Trash2, Copy, Search, Upload, Download, Loader2,
  ArrowRight, Eye, CheckCircle2, XCircle, MousePointerClick,
  MailOpen, AlertTriangle, UserMinus, Pencil, Star, X,
  PenLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (res.status === 401) { window.location.href = "/admin/"; throw new Error("Unauthorized"); }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Request failed");
  return res.json();
}

type Sender = { id: number; name: string; email: string; resendDomainId: string | null; status: string; isDefault: boolean; createdAt: string };
type Template = { id: number; name: string; subject: string; previewText: string; htmlBody: string; jsonBlocks: string; isSystem: boolean; createdAt: string; updatedAt: string };
type EmailContact = { id: number; email: string; name: string; tags: string; listName: string; source: string; unsubscribed: boolean; createdAt: string };
type Campaign = { id: number; name: string; subject: string; previewText: string; templateId: number | null; senderId: number | null; htmlContent: string; recipientListName: string; recipientCount: number; status: string; scheduledAt: string | null; sentAt: string | null; createdAt: string; updatedAt: string };
type EmailStats = { totalCampaigns: number; sentCampaigns: number; totalContacts: number; totalTemplates: number; totalSent: number; totalOpened: number; totalClicked: number; totalBounced: number; recentCampaigns: Campaign[] };
type ListInfo = { listName: string; count: number };
type CampaignReport = { campaign: Campaign; stats: { sent: number; delivered: number; opened: number; clicked: number; bounced: number; unsubscribed: number }; events: Array<{ id: number; campaignId: number; contactEmail: string; eventType: string; metadata: string; occurredAt: string }> };

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "compose", label: "Compose", icon: PenLine },
  { id: "campaigns", label: "Campaigns", icon: Send },
  { id: "templates", label: "Templates", icon: FileText },
  { id: "contacts", label: "Contacts", icon: Users },
  { id: "senders", label: "Senders", icon: Settings2 },
  { id: "reports", label: "Reports", icon: BarChart3 },
] as const;

type TabId = typeof TABS[number]["id"];

export default function EmailMarketing() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Mail className="w-6 h-6 text-primary" /> Email Marketing
        </h1>
        <p className="text-muted-foreground mt-1">Manage campaigns, templates, contacts, and track performance</p>
      </div>

      <div className="border-b border-border">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {activeTab === "dashboard" && <DashboardTab />}
      {activeTab === "compose" && <ComposeTab />}
      {activeTab === "campaigns" && <CampaignsTab />}
      {activeTab === "templates" && <TemplatesTab />}
      {activeTab === "contacts" && <ContactsTab />}
      {activeTab === "senders" && <SendersTab />}
      {activeTab === "reports" && <ReportsTab />}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

function DashboardTab() {
  const { data: stats, isLoading } = useQuery<EmailStats>({
    queryKey: ["email-stats"],
    queryFn: () => apiFetch("/api/email/stats"),
  });

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (!stats) return <div className="text-center py-20 text-muted-foreground">Failed to load stats</div>;

  const s = stats;
  const openRate = s.totalSent > 0 ? ((s.totalOpened / s.totalSent) * 100).toFixed(1) : "0";
  const clickRate = s.totalSent > 0 ? ((s.totalClicked / s.totalSent) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Sent" value={s.totalSent} icon={Send} color="bg-blue-500/10 text-blue-500" />
        <StatCard label="Open Rate" value={`${openRate}%`} icon={MailOpen} color="bg-green-500/10 text-green-500" />
        <StatCard label="Click Rate" value={`${clickRate}%`} icon={MousePointerClick} color="bg-purple-500/10 text-purple-500" />
        <StatCard label="Bounced" value={s.totalBounced} icon={AlertTriangle} color="bg-red-500/10 text-red-500" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Campaigns" value={s.totalCampaigns} icon={Send} color="bg-indigo-500/10 text-indigo-500" />
        <StatCard label="Sent Campaigns" value={s.sentCampaigns} icon={CheckCircle2} color="bg-emerald-500/10 text-emerald-500" />
        <StatCard label="Active Contacts" value={s.totalContacts} icon={Users} color="bg-amber-500/10 text-amber-500" />
        <StatCard label="Templates" value={s.totalTemplates} icon={FileText} color="bg-cyan-500/10 text-cyan-500" />
      </div>

      {s.recentCampaigns.length > 0 && (
        <div className="bg-card rounded-xl border border-border">
          <div className="p-5 border-b border-border">
            <h3 className="font-semibold">Recent Campaigns</h3>
          </div>
          <div className="divide-y divide-border">
            {s.recentCampaigns.map((c) => (
              <div key={c.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-sm text-muted-foreground">{c.subject}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={c.status === "sent" ? "default" : c.status === "draft" ? "secondary" : "outline"}>
                    {c.status}
                  </Badge>
                  <span className="text-sm text-muted-foreground">{c.recipientCount} recipients</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ComposeTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    to: "",
    toName: "",
    subject: "",
    senderId: "",
    templateId: "",
    htmlContent: "",
  });
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: senders = [] } = useQuery<Sender[]>({
    queryKey: ["email-senders"],
    queryFn: () => apiFetch("/api/email/senders"),
  });

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["email-templates"],
    queryFn: () => apiFetch("/api/email/templates"),
  });

  const { data: contacts = [] } = useQuery<EmailContact[]>({
    queryKey: ["email-contacts"],
    queryFn: () => apiFetch("/api/email/contacts"),
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      return apiFetch("/api/email/send-single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: form.to.trim(),
          toName: form.toName.trim() || undefined,
          subject: form.subject,
          htmlContent: form.htmlContent,
          senderId: form.senderId ? Number(form.senderId) : undefined,
          templateId: form.templateId ? Number(form.templateId) : undefined,
        }),
      });
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["email-campaigns"] });
      qc.invalidateQueries({ queryKey: ["email-stats"] });
      toast({ title: "Email sent!", description: `Sent to ${data.to}` });
      setForm({ to: "", toName: "", subject: "", senderId: "", templateId: "", htmlContent: "" });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Send failed", description: err.message }),
  });

  function handleTemplateChange(value: string) {
    const tmpl = templates.find((t) => t.id === Number(value));
    setForm({
      ...form,
      templateId: value,
      subject: tmpl?.subject || form.subject,
      htmlContent: tmpl?.htmlBody || form.htmlContent,
    });
  }

  const previewHtml = form.htmlContent
    .replace(/\{\{name\}\}/gi, form.toName || "Recipient")
    .replace(/\{\{email\}\}/gi, form.to || "recipient@example.com");

  const uniqueEmails = useMemo(() => {
    const seen = new Set<string>();
    return contacts.filter((c) => {
      if (c.unsubscribed || seen.has(c.email)) return false;
      seen.add(c.email);
      return true;
    });
  }, [contacts]);

  const [showSuggestions, setShowSuggestions] = useState(false);
  const filteredContacts = useMemo(() => {
    if (!form.to) return uniqueEmails.slice(0, 8);
    const q = form.to.toLowerCase();
    return uniqueEmails.filter((c) => c.email.toLowerCase().includes(q) || c.name?.toLowerCase().includes(q)).slice(0, 8);
  }, [form.to, uniqueEmails]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <PenLine className="w-5 h-5 text-primary" /> Compose Email
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Send a single email to any recipient</p>
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); sendMutation.mutate(); }}
        className="bg-card rounded-xl border border-border p-6 space-y-5"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="relative">
            <label className="text-sm font-medium mb-1.5 block">Recipient Email *</label>
            <Input
              type="email"
              placeholder="recipient@example.com"
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              required
            />
            {showSuggestions && filteredContacts.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredContacts.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors flex items-center justify-between"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setForm({ ...form, to: c.email, toName: c.name || form.toName });
                      setShowSuggestions(false);
                    }}
                  >
                    <span className="font-medium truncate">{c.email}</span>
                    {c.name && <span className="text-xs text-muted-foreground ml-2 shrink-0">{c.name}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Recipient Name</label>
            <Input
              placeholder="John Doe"
              value={form.toName}
              onChange={(e) => setForm({ ...form, toName: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">Subject *</label>
          <Input
            placeholder="Your email subject line"
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">From (Sender)</label>
            <select
              value={form.senderId}
              onChange={(e) => setForm({ ...form, senderId: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select sender...</option>
              {senders.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.email}){s.isDefault ? " ★" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Use Template</label>
            <select
              value={form.templateId}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">No template (custom HTML)</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium">Email Body (HTML)</label>
            {form.htmlContent && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPreviewOpen(true)}
                className="h-7 text-xs"
              >
                <Eye className="w-3.5 h-3.5 mr-1" /> Preview
              </Button>
            )}
          </div>
          <textarea
            value={form.htmlContent}
            onChange={(e) => setForm({ ...form, htmlContent: e.target.value })}
            rows={10}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y"
            placeholder={"<h1>Hello {{name}},</h1>\n<p>Your email content here...</p>\n<p>Best regards,<br/>Advantix Team</p>"}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Use <code className="bg-muted px-1 rounded">{"{{name}}"}</code> and <code className="bg-muted px-1 rounded">{"{{email}}"}</code> for personalization
          </p>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground">
            {form.to && form.subject ? "Ready to send" : "Fill in required fields"}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setForm({ to: "", toName: "", subject: "", senderId: "", templateId: "", htmlContent: "" })}
            >
              Clear
            </Button>
            <Button
              type="submit"
              disabled={sendMutation.isPending || !form.to || !form.subject}
              className="min-w-[120px]"
            >
              {sendMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</>
              ) : (
                <><Send className="w-4 h-4 mr-2" />Send Email</>
              )}
            </Button>
          </div>
        </div>
      </form>

      <Dialog open={previewOpen} onOpenChange={(o) => { if (!o) setPreviewOpen(false); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
          </DialogHeader>
          <div className="border rounded-lg overflow-auto max-h-[60vh] bg-white">
            <iframe
              srcDoc={previewHtml || "<p style='padding:20px;color:#888;'>No content to preview</p>"}
              className="w-full min-h-[400px] border-0"
              title="Email Preview"
              sandbox=""
            />
          </div>
          <div className="text-sm text-muted-foreground space-y-1">
            <p><strong>To:</strong> {form.toName ? `${form.toName} <${form.to}>` : form.to || "—"}</p>
            <p><strong>Subject:</strong> {form.subject || "—"}</p>
            {form.senderId && senders.find((s) => s.id === Number(form.senderId)) && (
              <p><strong>From:</strong> {senders.find((s) => s.id === Number(form.senderId))!.name} ({senders.find((s) => s.id === Number(form.senderId))!.email})</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CampaignsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", subject: "", previewText: "", recipientListName: "default", senderId: "", templateId: "", htmlContent: "" });
  const [reportId, setReportId] = useState<number | null>(null);

  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["email-campaigns"],
    queryFn: () => apiFetch("/api/email/campaigns"),
  });

  const { data: senders = [] } = useQuery<Sender[]>({
    queryKey: ["email-senders"],
    queryFn: () => apiFetch("/api/email/senders"),
  });

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["email-templates"],
    queryFn: () => apiFetch("/api/email/templates"),
  });

  const { data: lists = [] } = useQuery<ListInfo[]>({
    queryKey: ["email-lists"],
    queryFn: () => apiFetch("/api/email/lists"),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const url = editingId ? `/api/email/campaigns/${editingId}` : "/api/email/campaigns";
      return apiFetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          senderId: form.senderId ? Number(form.senderId) : null,
          templateId: form.templateId ? Number(form.templateId) : null,
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-campaigns"] });
      qc.invalidateQueries({ queryKey: ["email-stats"] });
      setModalOpen(false);
      resetForm();
      toast({ title: editingId ? "Campaign updated" : "Campaign created" });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/email/campaigns/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-campaigns"] }); qc.invalidateQueries({ queryKey: ["email-stats"] }); toast({ title: "Campaign deleted" }); },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/email/campaigns/${id}/duplicate`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-campaigns"] }); toast({ title: "Campaign duplicated" }); },
  });

  const sendMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/email/campaigns/${id}/send`, { method: "POST" }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["email-campaigns"] });
      qc.invalidateQueries({ queryKey: ["email-stats"] });
      toast({ title: "Campaign sent!", description: `Sent to ${data?.recipientCount ?? 0} recipients` });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Send failed", description: err.message }),
  });

  function resetForm() {
    setForm({ name: "", subject: "", previewText: "", recipientListName: "default", senderId: "", templateId: "", htmlContent: "" });
    setEditingId(null);
  }

  function openEdit(c: Campaign) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      subject: c.subject,
      previewText: c.previewText,
      recipientListName: c.recipientListName,
      senderId: c.senderId?.toString() ?? "",
      templateId: c.templateId?.toString() ?? "",
      htmlContent: c.htmlContent,
    });
    setModalOpen(true);
  }

  function openNew() {
    resetForm();
    setModalOpen(true);
  }

  const statusColor = (s: string) => {
    switch (s) {
      case "sent": return "default";
      case "draft": return "secondary";
      case "sending": return "outline";
      case "scheduled": return "outline";
      default: return "secondary";
    }
  };

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">All Campaigns ({campaigns.length})</h2>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" /> New Campaign</Button>
      </div>

      {campaigns.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Send className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">No campaigns yet. Create your first campaign to get started.</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border divide-y divide-border">
          {campaigns.map((c) => (
            <div key={c.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium truncate">{c.name}</p>
                  <Badge variant={statusColor(c.status) as any}>{c.status}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5 truncate">{c.subject}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {c.recipientCount} recipients &middot; List: {c.recipientListName}
                  {c.sentAt && ` · Sent: ${new Date(c.sentAt).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {c.status === "draft" && (
                  <Button size="sm" onClick={() => sendMutation.mutate(c.id)} disabled={sendMutation.isPending}>
                    <Send className="w-3.5 h-3.5 mr-1" /> Send
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="ghost" onClick={() => duplicateMutation.mutate(c.id)}><Copy className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Delete this campaign?")) deleteMutation.mutate(c.id); }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
                {c.status === "sent" && (
                  <Button size="sm" variant="outline" onClick={() => setReportId(c.id)}>
                    <BarChart3 className="w-3.5 h-3.5 mr-1" /> Report
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) { setModalOpen(false); resetForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Campaign" : "New Campaign"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Campaign Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="text-sm font-medium">Subject Line</label>
              <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
            </div>
            <div>
              <label className="text-sm font-medium">Preview Text</label>
              <Input value={form.previewText} onChange={(e) => setForm({ ...form, previewText: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Sender</label>
              <select
                value={form.senderId}
                onChange={(e) => setForm({ ...form, senderId: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select sender...</option>
                {senders.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.email})</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Template</label>
              <select
                value={form.templateId}
                onChange={(e) => setForm({ ...form, templateId: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">No template</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Recipient List</label>
              <select
                value={form.recipientListName}
                onChange={(e) => setForm({ ...form, recipientListName: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="default">default</option>
                {lists.map((l) => <option key={l.listName} value={l.listName}>{l.listName} ({l.count})</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Email HTML Content</label>
              <textarea
                value={form.htmlContent}
                onChange={(e) => setForm({ ...form, htmlContent: e.target.value })}
                rows={6}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                placeholder="<h1>Hello {{name}}</h1><p>Your email content here...</p>"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setModalOpen(false); resetForm(); }}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingId ? "Save Changes" : "Create Campaign"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {reportId && <CampaignReportDialog campaignId={reportId} onClose={() => setReportId(null)} />}
    </div>
  );
}

function CampaignReportDialog({ campaignId, onClose }: { campaignId: number; onClose: () => void }) {
  const { data, isLoading } = useQuery<CampaignReport>({
    queryKey: ["email-campaign-report", campaignId],
    queryFn: () => apiFetch(`/api/email/campaigns/${campaignId}/report`),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Campaign Report</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : data ? (
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-lg">{data.campaign.name}</h3>
              <p className="text-sm text-muted-foreground">{data.campaign.subject}</p>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              <div className="text-center p-3 bg-blue-500/10 rounded-lg">
                <p className="text-xl font-bold text-blue-500">{data.stats.sent}</p>
                <p className="text-xs text-muted-foreground">Sent</p>
              </div>
              <div className="text-center p-3 bg-green-500/10 rounded-lg">
                <p className="text-xl font-bold text-green-500">{data.stats.delivered}</p>
                <p className="text-xs text-muted-foreground">Delivered</p>
              </div>
              <div className="text-center p-3 bg-emerald-500/10 rounded-lg">
                <p className="text-xl font-bold text-emerald-500">{data.stats.opened}</p>
                <p className="text-xs text-muted-foreground">Opened</p>
              </div>
              <div className="text-center p-3 bg-purple-500/10 rounded-lg">
                <p className="text-xl font-bold text-purple-500">{data.stats.clicked}</p>
                <p className="text-xs text-muted-foreground">Clicked</p>
              </div>
              <div className="text-center p-3 bg-red-500/10 rounded-lg">
                <p className="text-xl font-bold text-red-500">{data.stats.bounced}</p>
                <p className="text-xs text-muted-foreground">Bounced</p>
              </div>
              <div className="text-center p-3 bg-amber-500/10 rounded-lg">
                <p className="text-xl font-bold text-amber-500">{data.stats.unsubscribed}</p>
                <p className="text-xs text-muted-foreground">Unsub</p>
              </div>
            </div>
            {data.events.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Event Log</h4>
                <div className="max-h-60 overflow-y-auto border rounded-lg divide-y divide-border">
                  {data.events.slice(0, 50).map((ev) => (
                    <div key={ev.id} className="px-3 py-2 flex items-center justify-between text-sm">
                      <span className="font-mono">{ev.contactEmail}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{ev.eventType}</Badge>
                        <span className="text-xs text-muted-foreground">{new Date(ev.occurredAt).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TemplatesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", subject: "", previewText: "", htmlBody: "", jsonBlocks: "[]" });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState<any>(null);
  const [restoreMode, setRestoreMode] = useState<"merge" | "replace">("merge");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ["email-templates"],
    queryFn: () => apiFetch("/api/email/templates"),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const url = editingId ? `/api/email/templates/${editingId}` : "/api/email/templates";
      return apiFetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      qc.invalidateQueries({ queryKey: ["email-stats"] });
      setModalOpen(false);
      resetForm();
      toast({ title: editingId ? "Template updated" : "Template created" });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/email/templates/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-templates"] }); qc.invalidateQueries({ queryKey: ["email-stats"] }); toast({ title: "Template deleted" }); },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/email/templates/${id}/duplicate`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-templates"] }); toast({ title: "Template duplicated" }); },
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      if (!restoreFile?.templates) throw new Error("Invalid backup file");
      return apiFetch("/api/email/templates/backup/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates: restoreFile.templates, mode: restoreMode }),
      });
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      qc.invalidateQueries({ queryKey: ["email-stats"] });
      setRestoreDialogOpen(false);
      setRestoreFile(null);
      toast({ title: "Restore complete", description: `${data.imported} imported, ${data.skipped} skipped` });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Restore failed", description: err.message }),
  });

  async function handleBackup() {
    try {
      const res = await fetch("/api/email/templates/backup/export", { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `templates-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Backup downloaded" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Backup failed", description: err.message });
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!data.templates || !Array.isArray(data.templates)) {
          toast({ variant: "destructive", title: "Invalid file", description: "This doesn't look like a templates backup file" });
          return;
        }
        setRestoreFile(data);
        setRestoreMode("merge");
        setRestoreDialogOpen(true);
      } catch {
        toast({ variant: "destructive", title: "Invalid file", description: "Could not parse JSON file" });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function resetForm() {
    setForm({ name: "", subject: "", previewText: "", htmlBody: "", jsonBlocks: "[]" });
    setEditingId(null);
  }

  function openEdit(t: Template) {
    setEditingId(t.id);
    setForm({ name: t.name, subject: t.subject, previewText: t.previewText, htmlBody: t.htmlBody, jsonBlocks: t.jsonBlocks });
    setModalOpen(true);
  }

  function openNew() {
    resetForm();
    setModalOpen(true);
  }

  function openPreview(html: string) {
    setPreviewHtml(html);
    setPreviewOpen(true);
  }

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Templates ({templates.length})</h2>
        <div className="flex items-center gap-2">
          <input type="file" accept=".json" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
          <Button variant="outline" size="sm" onClick={handleBackup} disabled={templates.length === 0}>
            <Download className="w-4 h-4 mr-1" /> Backup
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4 mr-1" /> Restore
          </Button>
          <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" /> New Template</Button>
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <FileText className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">No templates yet. Create your first email template.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <div key={t.id} className="bg-card rounded-xl border border-border p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{t.subject || "No subject"}</p>
                </div>
                {t.isSystem && <Badge variant="secondary">System</Badge>}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(t)}><Pencil className="w-3.5 h-3.5 mr-1" /> Edit</Button>
                {t.htmlBody && <Button size="sm" variant="outline" onClick={() => openPreview(t.htmlBody)}><Eye className="w-3.5 h-3.5 mr-1" /> Preview</Button>}
                <Button size="sm" variant="ghost" onClick={() => duplicateMutation.mutate(t.id)}><Copy className="w-3.5 h-3.5" /></Button>
                {!t.isSystem && (
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Delete?")) deleteMutation.mutate(t.id); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) { setModalOpen(false); resetForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Template" : "New Template"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Template Name</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label className="text-sm font-medium">Subject Line</label>
                <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Preview Text</label>
              <Input value={form.previewText} onChange={(e) => setForm({ ...form, previewText: e.target.value })} placeholder="Shows in inbox preview..." />
            </div>
            <div>
              <label className="text-sm font-medium">HTML Body</label>
              <textarea
                value={form.htmlBody}
                onChange={(e) => setForm({ ...form, htmlBody: e.target.value })}
                rows={12}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                placeholder="<!DOCTYPE html><html><body><h1>Hello!</h1></body></html>"
              />
            </div>
            <div className="flex justify-between">
              <div className="flex gap-2">
                {form.htmlBody && (
                  <Button type="button" variant="outline" size="sm" onClick={() => openPreview(form.htmlBody)}>
                    <Eye className="w-3.5 h-3.5 mr-1" /> Preview
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => { setModalOpen(false); resetForm(); }}>Cancel</Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingId ? "Save Changes" : "Create Template"}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={(o) => { if (!o) setPreviewOpen(false); }}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader><DialogTitle>Template Preview</DialogTitle></DialogHeader>
          <div className="border rounded-lg overflow-auto max-h-[65vh] bg-white">
            <iframe
              srcDoc={previewHtml}
              className="w-full min-h-[400px] border-0"
              title="Email Preview"
              sandbox=""
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={restoreDialogOpen} onOpenChange={(o) => { if (!o) { setRestoreDialogOpen(false); setRestoreFile(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Restore Templates</DialogTitle></DialogHeader>
          {restoreFile && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-1 text-sm">
                <p><span className="font-medium">Templates in file:</span> {restoreFile.templates?.length || 0}</p>
                {restoreFile.exportedAt && <p><span className="font-medium">Exported:</span> {new Date(restoreFile.exportedAt).toLocaleString()}</p>}
                {restoreFile.source && <p><span className="font-medium">Source:</span> {restoreFile.source}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Restore Mode</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="restoreMode" checked={restoreMode === "merge"} onChange={() => setRestoreMode("merge")} className="accent-primary" />
                    <span className="text-sm">Merge (skip duplicates)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="restoreMode" checked={restoreMode === "replace"} onChange={() => setRestoreMode("replace")} className="accent-primary" />
                    <span className="text-sm text-destructive">Replace all</span>
                  </label>
                </div>
                {restoreMode === "replace" && (
                  <p className="text-xs text-destructive">This will delete all existing templates and replace them with the backup.</p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setRestoreDialogOpen(false); setRestoreFile(null); }}>Cancel</Button>
                <Button onClick={() => restoreMutation.mutate()} disabled={restoreMutation.isPending}>
                  {restoreMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />}
                  Restore
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContactsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [selectedList, setSelectedList] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", tags: "", listName: "default" });
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const { data: contacts = [], isLoading } = useQuery<EmailContact[]>({
    queryKey: ["email-contacts", selectedList],
    queryFn: () => apiFetch(`/api/email/contacts${selectedList ? `?list=${selectedList}` : ""}`),
  });

  const { data: lists = [] } = useQuery<ListInfo[]>({
    queryKey: ["email-lists"],
    queryFn: () => apiFetch("/api/email/lists"),
  });

  const addMutation = useMutation({
    mutationFn: async () => apiFetch("/api/email/contacts", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-contacts"] });
      qc.invalidateQueries({ queryKey: ["email-lists"] });
      qc.invalidateQueries({ queryKey: ["email-stats"] });
      setModalOpen(false);
      setForm({ email: "", name: "", tags: "", listName: "default" });
      toast({ title: "Contact added" });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/email/contacts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-contacts"] });
      qc.invalidateQueries({ queryKey: ["email-lists"] });
      qc.invalidateQueries({ queryKey: ["email-stats"] });
      toast({ title: "Contact deleted" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => apiFetch("/api/email/contacts/bulk-delete", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-contacts"] });
      qc.invalidateQueries({ queryKey: ["email-lists"] });
      setSelected(new Set());
      toast({ title: "Contacts deleted" });
    },
  });

  const importLeadsMutation = useMutation({
    mutationFn: () => apiFetch("/api/email/contacts/import-leads", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listName: "leads" }),
    }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["email-contacts"] });
      qc.invalidateQueries({ queryKey: ["email-lists"] });
      toast({ title: `${data?.imported ?? 0} leads imported` });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });

  const importSiteContactsMutation = useMutation({
    mutationFn: () => apiFetch("/api/email/contacts/import-site-contacts", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listName: "contacts" }),
    }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["email-contacts"] });
      qc.invalidateQueries({ queryKey: ["email-lists"] });
      toast({ title: `${data?.imported ?? 0} contacts imported` });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });

  function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) { toast({ variant: "destructive", title: "Invalid CSV" }); return; }
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const emailIdx = headers.findIndex((h) => h.includes("email"));
      const nameIdx = headers.findIndex((h) => h.includes("name"));
      if (emailIdx === -1) { toast({ variant: "destructive", title: "CSV must have an 'email' column" }); return; }
      const parsed = lines.slice(1).map((line) => {
        const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        return { email: cols[emailIdx] ?? "", name: cols[nameIdx] ?? "" };
      }).filter((c) => c.email.includes("@"));

      try {
        await apiFetch("/api/email/contacts/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contacts: parsed, listName: "csv-import", source: "csv" }),
        });
        qc.invalidateQueries({ queryKey: ["email-contacts"] });
        qc.invalidateQueries({ queryKey: ["email-lists"] });
        toast({ title: `${parsed.length} contacts imported from CSV` });
      } catch {
        toast({ variant: "destructive", title: "Import failed" });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function exportCSV() {
    const csv = "Name,Email,Tags,List,Source,Unsubscribed\n" +
      contacts.map((c) => [c.name, c.email, c.tags, c.listName, c.source, c.unsubscribed].join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "email-contacts.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = useMemo(() => {
    if (!search) return contacts;
    const q = search.toLowerCase();
    return contacts.filter((c) => c.email.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
  }, [contacts, search]);

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Contacts ({contacts.length})</h2>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => importLeadsMutation.mutate()} disabled={importLeadsMutation.isPending}>
            <ArrowRight className="w-3.5 h-3.5 mr-1" /> Import Leads
          </Button>
          <Button size="sm" variant="outline" onClick={() => importSiteContactsMutation.mutate()} disabled={importSiteContactsMutation.isPending}>
            <ArrowRight className="w-3.5 h-3.5 mr-1" /> Import Site Contacts
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-3.5 h-3.5 mr-1" /> CSV Import
          </Button>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
          <Button size="sm" variant="outline" onClick={exportCSV}><Download className="w-3.5 h-3.5 mr-1" /> Export</Button>
          <Button size="sm" onClick={() => setModalOpen(true)}><Plus className="w-3.5 h-3.5 mr-1" /> Add</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts..." className="pl-9" />
        </div>
        <select
          value={selectedList}
          onChange={(e) => setSelectedList(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">All lists</option>
          {lists.map((l) => <option key={l.listName} value={l.listName}>{l.listName} ({l.count})</option>)}
        </select>
        {selected.size > 0 && (
          <Button size="sm" variant="destructive" onClick={() => { if (confirm(`Delete ${selected.size} contacts?`)) bulkDeleteMutation.mutate([...selected]); }}>
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete {selected.size}
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Users className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">No contacts found. Add contacts manually, import from CSV, or pull from existing leads.</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className="p-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={(e) => setSelected(e.target.checked ? new Set(filtered.map((c) => c.id)) : new Set())}
                    className="rounded"
                  />
                </th>
                <th className="p-3 text-left">Email</th>
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">List</th>
                <th className="p-3 text-left">Source</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.slice(0, 100).map((c) => (
                <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        e.target.checked ? next.add(c.id) : next.delete(c.id);
                        setSelected(next);
                      }}
                      className="rounded"
                    />
                  </td>
                  <td className="p-3 font-mono text-xs">{c.email}</td>
                  <td className="p-3">{c.name || "—"}</td>
                  <td className="p-3"><Badge variant="outline" className="text-xs">{c.listName}</Badge></td>
                  <td className="p-3 text-muted-foreground">{c.source}</td>
                  <td className="p-3">
                    {c.unsubscribed ? (
                      <Badge variant="destructive" className="text-xs">Unsubscribed</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Active</Badge>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Delete?")) deleteMutation.mutate(c.id); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 100 && (
            <p className="text-sm text-muted-foreground text-center py-3">Showing first 100 of {filtered.length} contacts</p>
          )}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) setModalOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); addMutation.mutate(); }} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required type="email" />
            </div>
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Tags (comma separated)</label>
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="vip, newsletter" />
            </div>
            <div>
              <label className="text-sm font-medium">List</label>
              <Input value={form.listName} onChange={(e) => setForm({ ...form, listName: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={addMutation.isPending}>
                {addMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Add Contact
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SendersTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", email: "", isDefault: false });

  const { data: senders = [], isLoading } = useQuery<Sender[]>({
    queryKey: ["email-senders"],
    queryFn: () => apiFetch("/api/email/senders"),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const url = editingId ? `/api/email/senders/${editingId}` : "/api/email/senders";
      return apiFetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-senders"] });
      setModalOpen(false);
      setForm({ name: "", email: "", isDefault: false });
      setEditingId(null);
      toast({ title: editingId ? "Sender updated" : "Sender added" });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/email/senders/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-senders"] }); toast({ title: "Sender removed" }); },
  });

  function openEdit(s: Sender) {
    setEditingId(s.id);
    setForm({ name: s.name, email: s.email, isDefault: s.isDefault });
    setModalOpen(true);
  }

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Sender Emails ({senders.length})</h2>
        <Button onClick={() => { setEditingId(null); setForm({ name: "", email: "", isDefault: false }); setModalOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Add Sender
        </Button>
      </div>

      {senders.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Settings2 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">No sender emails configured. Add your company email addresses to start sending campaigns.</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border divide-y divide-border">
          {senders.map((s) => (
            <div key={s.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{s.name}</p>
                    {s.isDefault && <Badge variant="default" className="text-xs">Default</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{s.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={s.status === "verified" ? "default" : "secondary"}>
                  {s.status === "verified" ? <><CheckCircle2 className="w-3 h-3 mr-1" /> Verified</> : s.status}
                </Badge>
                <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Remove?")) deleteMutation.mutate(s.id); }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) { setModalOpen(false); setEditingId(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingId ? "Edit Sender" : "Add Sender Email"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Sender Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Advantix Digital" />
            </div>
            <div>
              <label className="text-sm font-medium">Email Address</label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required type="email" placeholder="hello@advantix.digital" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isDefault" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} className="rounded" />
              <label htmlFor="isDefault" className="text-sm">Set as default sender</label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setModalOpen(false); setEditingId(null); }}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingId ? "Save Changes" : "Add Sender"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReportsTab() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const perPage = 10;

  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["email-campaigns"],
    queryFn: () => apiFetch("/api/email/campaigns"),
  });

  const sentCampaigns = campaigns.filter((c) => {
    if (c.status !== "sent") return false;
    if (dateFrom && c.sentAt) {
      const sent = new Date(c.sentAt);
      const from = new Date(dateFrom);
      if (sent < from) return false;
    }
    if (dateTo && c.sentAt) {
      const sent = new Date(c.sentAt);
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      if (sent > to) return false;
    }
    return true;
  });
  const totalPages = Math.ceil(sentCampaigns.length / perPage);
  const paginated = sentCampaigns.slice(page * perPage, (page + 1) * perPage);

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Campaign Reports</h2>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
            className="h-8 px-2 text-xs rounded-md border border-border bg-background text-foreground"
            placeholder="From"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
            className="h-8 px-2 text-xs rounded-md border border-border bg-background text-foreground"
            placeholder="To"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); setPage(0); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
          <span className="text-xs text-muted-foreground ml-1">{sentCampaigns.length} campaigns</span>
        </div>
      </div>

      {sentCampaigns.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">No sent campaigns yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {selectedId && <CampaignReportInline campaignId={selectedId} />}

          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="px-3 py-2 font-medium">Campaign</th>
                  <th className="px-3 py-2 font-medium text-center hidden sm:table-cell">Recipients</th>
                  <th className="px-3 py-2 font-medium text-center hidden md:table-cell">Status</th>
                  <th className="px-3 py-2 font-medium text-right hidden sm:table-cell">Date</th>
                  <th className="px-3 py-2 font-medium w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                    className={`cursor-pointer transition-colors hover:bg-muted/20 ${selectedId === c.id ? "bg-muted/30" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <p className="font-medium text-sm truncate max-w-[300px]">{c.subject}</p>
                    </td>
                    <td className="px-3 py-2 text-center text-muted-foreground hidden sm:table-cell">{c.recipientCount}</td>
                    <td className="px-3 py-2 text-center hidden md:table-cell">
                      <Badge variant="outline" className="text-xs bg-green-500/10 text-green-500 border-green-500/20">sent</Badge>
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground hidden sm:table-cell">
                      {c.sentAt ? new Date(c.sentAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <BarChart3 className={`w-3.5 h-3.5 transition-colors ${selectedId === c.id ? "text-primary" : "text-muted-foreground/40"}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-muted-foreground">
                {page * perPage + 1}–{Math.min((page + 1) * perPage, sentCampaigns.length)} of {sentCampaigns.length}
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)} className="h-7 px-2 text-xs">Prev</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="h-7 px-2 text-xs">Next</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CampaignReportInline({ campaignId }: { campaignId: number }) {
  const { data, isLoading } = useQuery<CampaignReport>({
    queryKey: ["email-campaign-report", campaignId],
    queryFn: () => apiFetch(`/api/email/campaigns/${campaignId}/report`),
  });

  if (isLoading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  if (!data) return null;

  const statItems = [
    { label: "Sent", value: data.stats.sent, color: "text-blue-400" },
    { label: "Delivered", value: data.stats.delivered, color: "text-green-400" },
    { label: "Opened", value: data.stats.opened, color: "text-emerald-400" },
    { label: "Clicked", value: data.stats.clicked, color: "text-purple-400" },
    { label: "Bounced", value: data.stats.bounced, color: "text-red-400" },
    { label: "Unsub", value: data.stats.unsubscribed, color: "text-amber-400" },
  ];

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-medium text-sm">{data.campaign.subject}</p>
        <span className="text-xs text-muted-foreground">{data.campaign.sentAt ? new Date(data.campaign.sentAt).toLocaleString() : ""}</span>
      </div>
      <div className="flex gap-4 flex-wrap">
        {statItems.map((s) => (
          <div key={s.label} className="flex items-baseline gap-1.5">
            <span className={`text-lg font-bold ${s.color}`}>{s.value}</span>
            <span className="text-xs text-muted-foreground">{s.label}</span>
          </div>
        ))}
      </div>
      {data.events.length > 0 && (
        <div className="max-h-40 overflow-y-auto border rounded-lg divide-y divide-border text-xs">
          {data.events.slice(0, 50).map((ev) => (
            <div key={ev.id} className="px-3 py-1.5 flex items-center justify-between">
              <span className="font-mono text-muted-foreground">{ev.contactEmail}</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{ev.eventType}</Badge>
                <span className="text-muted-foreground">{new Date(ev.occurredAt).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
