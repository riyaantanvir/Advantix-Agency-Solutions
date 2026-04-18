import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Edit2, Check, X, Key, Eye, EyeOff,
  ChevronDown, ChevronUp, Plug, Sparkles, Mail, CreditCard, Globe, Shield,
  Loader2, Wifi, WifiOff, Share2,
} from "lucide-react";

interface Integration {
  id: number;
  name: string;
  label: string;
  value: string;
  hasValue: boolean;
  description: string | null;
  category: string;
  updatedAt: string;
}

const CATEGORIES = ["AI", "Social", "Email", "Payment", "Storage", "Analytics", "Communication", "Other"];

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  AI: Sparkles,
  Social: Share2,
  Email: Mail,
  Payment: CreditCard,
  Storage: Globe,
  Analytics: Globe,
  Communication: Globe,
  Other: Plug,
};

const CATEGORY_COLORS: Record<string, string> = {
  AI: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  Social: "bg-blue-600/10 text-blue-400 border-blue-600/20",
  Email: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Payment: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Storage: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  Analytics: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  Communication: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  Other: "bg-muted text-muted-foreground border-border",
};

const PRESETS = [
  { name: "OPENAI_API_KEY", label: "OpenAI API Key", category: "AI", description: "API key for OpenAI (GPT models, DALL-E, Whisper)" },
  { name: "ANTHROPIC_API_KEY", label: "Anthropic API Key", category: "AI", description: "API key for Anthropic Claude models" },
  { name: "GEMINI_API_KEY", label: "Google Gemini API Key", category: "AI", description: "API key for Google Gemini models" },
  { name: "OPENROUTER_API_KEY", label: "OpenRouter API Key", category: "AI", description: "API key for OpenRouter (access 200+ models with one key — sk-or-v1-...)" },
  { name: "GROK_API_KEY", label: "Grok (xAI) API Key", category: "AI", description: "API key for xAI Grok models" },
  { name: "FACEBOOK_APP_ID", label: "Facebook App ID", category: "Social", description: "Your Facebook App ID from developers.facebook.com — used for OAuth login & webhooks" },
  { name: "FACEBOOK_APP_SECRET", label: "Facebook App Secret", category: "Social", description: "Your Facebook App Secret — keep this private, used to exchange tokens" },
  { name: "FACEBOOK_WEBHOOK_VERIFY_TOKEN", label: "Facebook Webhook Verify Token", category: "Social", description: "A custom string you set in the Facebook webhook settings to verify webhook calls" },
  { name: "SMM_META_ACCESS_TOKEN", label: "Meta Page Access Token", category: "Social", description: "Long-lived Facebook/Instagram page access token for SMM auto-posting" },
  { name: "STRIPE_SECRET_KEY", label: "Stripe Secret Key", category: "Payment", description: "Stripe secret key for payment processing" },
  { name: "SENDGRID_API_KEY", label: "SendGrid API Key", category: "Email", description: "API key for SendGrid email delivery" },
  { name: "RESEND_API_KEY", label: "Resend API Key", category: "Email", description: "API key for Resend transactional email" },
  { name: "RESEND_WEBHOOK_SECRET", label: "Resend Webhook Secret", category: "Email", description: "Signing secret for verifying Resend webhook payloads (found in Resend → Webhooks)" },
  { name: "CLOUDINARY_API_KEY", label: "Cloudinary API Key", category: "Storage", description: "API key for Cloudinary image/video storage" },
  { name: "SLACK_WEBHOOK_URL", label: "Slack Webhook URL", category: "Communication", description: "Slack incoming webhook URL for notifications" },
  { name: "CUSTOM", label: "Custom Integration", category: "Other", description: "" },
];

export default function Integrations() {
  const { toast } = useToast();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [showValue, setShowValue] = useState<Record<number, boolean>>({});
  const [selectedPreset, setSelectedPreset] = useState<typeof PRESETS[0] | null>(null);
  const [form, setForm] = useState({ name: "", label: "", value: "", description: "", category: "Other" });
  const [isCustom, setIsCustom] = useState(false);
  const [testResults, setTestResults] = useState<Record<number, { loading: boolean; ok?: boolean; message?: string }>>({});

  useEffect(() => { loadIntegrations(); }, []);

  async function loadIntegrations() {
    setLoading(true);
    const res = await fetch("/api/admin/integrations", { credentials: "include" });
    if (res.ok) setIntegrations(await res.json());
    setLoading(false);
  }

  function selectPreset(preset: typeof PRESETS[0]) {
    setSelectedPreset(preset);
    const isCustomPreset = preset.name === "CUSTOM";
    setIsCustom(isCustomPreset);
    setForm({
      name: isCustomPreset ? "" : preset.name,
      label: isCustomPreset ? "" : preset.label,
      description: preset.description,
      category: preset.category,
      value: "",
    });
  }

  async function handleAdd() {
    if (!form.name.trim() || !form.label.trim()) {
      toast({ title: "Name and label are required", variant: "destructive" });
      return;
    }
    const res = await fetch("/api/admin/integrations", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const data = await res.json();
      setIntegrations(prev => [...prev, data]);
      setShowAdd(false);
      setSelectedPreset(null);
      setForm({ name: "", label: "", value: "", description: "", category: "Other" });
      toast({ title: "Integration added" });
    } else {
      const err = await res.json();
      toast({ title: err.error || "Failed to add", variant: "destructive" });
    }
  }

  async function handleUpdate(id: number) {
    const res = await fetch(`/api/admin/integrations/${id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: editLabel, value: editValue }),
    });
    if (res.ok) {
      const data = await res.json();
      setIntegrations(prev => prev.map(i => i.id === id ? data : i));
      setEditingId(null);
      toast({ title: "Integration updated" });
    }
  }

  async function handleTest(id: number) {
    setTestResults(prev => ({ ...prev, [id]: { loading: true } }));
    try {
      const res = await fetch(`/api/admin/integrations/${id}/test`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      setTestResults(prev => ({ ...prev, [id]: { loading: false, ok: data.ok, message: data.message } }));
    } catch {
      setTestResults(prev => ({ ...prev, [id]: { loading: false, ok: false, message: "Request failed" } }));
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this integration?")) return;
    await fetch(`/api/admin/integrations/${id}`, { method: "DELETE", credentials: "include" });
    setIntegrations(prev => prev.filter(i => i.id !== id));
    toast({ title: "Integration deleted" });
  }

  const grouped = CATEGORIES.reduce<Record<string, Integration[]>>((acc, cat) => {
    acc[cat] = integrations.filter(i => i.category === cat);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Integrations</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage API keys, tokens, and service connections</p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setSelectedPreset(null); }}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Add Integration
        </button>
      </div>

      {/* Add panel */}
      {showAdd && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-medium">New Integration</h2>
            <button onClick={() => { setShowAdd(false); setSelectedPreset(null); }} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Preset picker */}
          {!selectedPreset ? (
            <div>
              <p className="text-xs text-muted-foreground mb-3">Choose a preset or add a custom one:</p>
              <div className="grid grid-cols-2 gap-2">
                {PRESETS.map(p => {
                  const Icon = CATEGORY_ICONS[p.category] || Plug;
                  return (
                    <button
                      key={p.name}
                      onClick={() => selectPreset(p)}
                      className="flex items-center gap-2.5 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/30 transition-colors text-left"
                    >
                      <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 border ${CATEGORY_COLORS[p.category]}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-xs font-medium">{p.label}</div>
                        <div className={`text-[10px] mt-0.5 inline-block px-1.5 py-0.5 rounded-full border ${CATEGORY_COLORS[p.category]}`}>{p.category}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <button onClick={() => setSelectedPreset(null)} className="hover:text-foreground text-xs">← Back</button>
                <span>·</span>
                <span className="font-medium text-foreground">{selectedPreset.label}</span>
              </div>

              {isCustom && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Key Name <span className="text-destructive">*</span></label>
                    <input
                      type="text"
                      placeholder="MY_API_KEY"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value.toUpperCase().replace(/\s+/g, "_") }))}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary/50 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Display Label <span className="text-destructive">*</span></label>
                    <input
                      type="text"
                      placeholder="My API Key"
                      value={form.label}
                      onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary/50"
                    />
                  </div>
                </div>
              )}

              {!isCustom && (
                <div className="bg-muted/30 rounded-lg px-3 py-2 flex items-center gap-2">
                  <Key className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-mono text-foreground/80">{form.name}</span>
                </div>
              )}

              <div>
                <label className="text-xs text-muted-foreground block mb-1">API Key / Token <span className="text-destructive">*</span></label>
                <input
                  type="password"
                  placeholder="Paste your key here..."
                  value={form.value}
                  onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary/50 font-mono"
                />
              </div>

              {isCustom && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Category</label>
                    <select
                      value={form.category}
                      onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary/50"
                    >
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Description</label>
                    <input
                      type="text"
                      placeholder="What is this key for?"
                      value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary/50"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleAdd}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Save Integration
                </button>
                <button
                  onClick={() => { setShowAdd(false); setSelectedPreset(null); }}
                  className="px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Existing integrations */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading...</div>
      ) : integrations.length === 0 && !showAdd ? (
        <div className="bg-card border border-border border-dashed rounded-xl p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-4">
            <Plug className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">No integrations yet</p>
          <p className="text-xs text-muted-foreground mb-4">Add your first API key or service connection</p>
          <button
            onClick={() => setShowAdd(true)}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            Add Integration
          </button>
        </div>
      ) : (
        CATEGORIES.map(cat => {
          const items = grouped[cat];
          if (!items?.length) return null;
          const Icon = CATEGORY_ICONS[cat] || Plug;
          return (
            <div key={cat} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border bg-muted/20">
                <div className={`w-6 h-6 rounded-md flex items-center justify-center border ${CATEGORY_COLORS[cat]}`}>
                  <Icon className="w-3 h-3" />
                </div>
                <h2 className="text-sm font-medium">{cat}</h2>
                <span className="ml-auto text-xs text-muted-foreground">{items.length} integration{items.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="divide-y divide-border">
                {items.map(integration => (
                  <div key={integration.id} className="px-5 py-4">
                    {editingId === integration.id ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Key className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs font-mono text-muted-foreground">{integration.name}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Label</label>
                            <input
                              type="text"
                              value={editLabel}
                              onChange={e => setEditLabel(e.target.value)}
                              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary/50"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">New Value (leave blank to keep current)</label>
                            <input
                              type="password"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              placeholder="Paste new key to update..."
                              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary/50 font-mono"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleUpdate(integration.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90">
                            <Check className="w-3 h-3" /> Save
                          </button>
                          <button onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs hover:text-foreground">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="text-sm font-medium">{integration.label}</span>
                            {integration.hasValue ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">No key set</span>
                            )}
                            {/* Test result badge */}
                            {testResults[integration.id] && !testResults[integration.id].loading && (
                              <span
                                className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${
                                  testResults[integration.id].ok
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                    : "bg-red-500/10 text-red-400 border-red-500/20"
                                }`}
                                title={testResults[integration.id].message}
                              >
                                {testResults[integration.id].ok
                                  ? <><Wifi className="w-2.5 h-2.5" /> Connected</>
                                  : <><WifiOff className="w-2.5 h-2.5" /> Failed</>
                                }
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-muted-foreground">{integration.name}</span>
                            <span className="text-xs font-mono text-muted-foreground/60">
                              {integration.value}
                            </span>
                          </div>
                          {integration.description && (
                            <p className="text-xs text-muted-foreground/60 mt-1">{integration.description}</p>
                          )}
                          {/* Test message */}
                          {testResults[integration.id] && !testResults[integration.id].loading && testResults[integration.id].message && (
                            <p className={`text-xs mt-1 ${testResults[integration.id].ok ? "text-emerald-400/80" : "text-red-400/80"}`}>
                              {testResults[integration.id].message}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Test button */}
                          {integration.hasValue && (
                            <button
                              onClick={() => handleTest(integration.id)}
                              disabled={testResults[integration.id]?.loading}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted/50 transition-colors disabled:opacity-50"
                              title="Test connection"
                            >
                              {testResults[integration.id]?.loading ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Wifi className="w-3 h-3" />
                              )}
                              Test
                            </button>
                          )}
                          <button
                            onClick={() => { setEditingId(integration.id); setEditLabel(integration.label); setEditValue(""); }}
                            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(integration.id)}
                            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}

      {integrations.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-card border border-border rounded-lg px-4 py-3">
          <Shield className="w-3.5 h-3.5 shrink-0" />
          <span>Keys are masked for security. Only the last 4 characters are visible. Keys are stored securely in the database.</span>
        </div>
      )}
    </div>
  );
}
