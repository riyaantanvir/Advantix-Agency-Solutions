import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Instagram, Facebook, Twitter, Youtube, Linkedin, Settings2,
  CheckCircle2, XCircle, Loader2, Eye, EyeOff, Save, Pin,
  AlertCircle, ExternalLink,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const API = "/api";

// ── platform definition ───────────────────────────────────────────────────────

type CredField = {
  key: string;         // SMM_META_ACCESS_TOKEN
  label: string;
  description: string;
  docsUrl?: string;
};

type PlatformDef = {
  key: string;         // facebook, instagram, twitter…
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  color: string;
  fields: CredField[];
  docsUrl?: string;
  instructions?: string;
};

const PLATFORM_DEFS: PlatformDef[] = [
  {
    key: "facebook",
    label: "Facebook Page",
    Icon: Facebook,
    color: "from-blue-600 to-blue-500",
    docsUrl: "https://developers.facebook.com/docs/graph-api",
    instructions: "Create a Meta App → generate a Page Access Token with pages_show_list, pages_read_engagement, read_insights permissions.",
    fields: [
      { key: "SMM_META_ACCESS_TOKEN", label: "Meta Access Token", description: "Page access token from Meta for Developers", docsUrl: "https://developers.facebook.com/tools/explorer/" },
      { key: "SMM_META_PAGE_ID", label: "Facebook Page ID", description: "Numeric ID of your Facebook Page (e.g. 123456789)" },
    ],
  },
  {
    key: "instagram",
    label: "Instagram Business",
    Icon: Instagram,
    color: "from-pink-500 to-rose-500",
    docsUrl: "https://developers.facebook.com/docs/instagram-api",
    instructions: "Requires an Instagram Business/Creator account linked to a Facebook Page. Use the same Meta Access Token as Facebook, and add your Instagram Business Account ID.",
    fields: [
      { key: "SMM_META_ACCESS_TOKEN", label: "Meta Access Token", description: "Same token as Facebook (shared Meta platform)" },
      { key: "SMM_META_IG_USER_ID", label: "Instagram Business User ID", description: "Your Instagram Business Account numeric ID" },
    ],
  },
  {
    key: "twitter",
    label: "X / Twitter",
    Icon: Twitter,
    color: "from-sky-400 to-sky-500",
    docsUrl: "https://developer.twitter.com/en/portal/dashboard",
    instructions: "Create a Twitter Developer App → get a Bearer Token (for read operations) from the Twitter Developer Portal.",
    fields: [
      { key: "SMM_TWITTER_BEARER_TOKEN", label: "Bearer Token", description: "App Bearer Token from Twitter Developer Portal" },
      { key: "SMM_TWITTER_USER_ID", label: "Twitter User ID", description: "Your numeric user ID (e.g. 12345678) — not the @handle" },
    ],
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    Icon: Linkedin,
    color: "from-blue-700 to-blue-600",
    docsUrl: "https://www.linkedin.com/developers/apps",
    instructions: "Create a LinkedIn App → request r_liteprofile, r_emailaddress, w_member_social scopes → generate an Access Token via OAuth 2.0.",
    fields: [
      { key: "SMM_LINKEDIN_ACCESS_TOKEN", label: "Access Token", description: "OAuth 2.0 Access Token from LinkedIn" },
      { key: "SMM_LINKEDIN_ORG_ID", label: "Organization ID (optional)", description: "Numeric org ID if posting as a Company Page" },
    ],
  },
  {
    key: "youtube",
    label: "YouTube",
    Icon: Youtube,
    color: "from-red-500 to-red-600",
    docsUrl: "https://console.cloud.google.com/apis/library/youtube.googleapis.com",
    instructions: "Enable the YouTube Data API v3 in Google Cloud Console → create an API Key → find your Channel ID from your YouTube channel URL.",
    fields: [
      { key: "SMM_YOUTUBE_API_KEY", label: "YouTube Data API v3 Key", description: "API Key from Google Cloud Console" },
      { key: "SMM_YOUTUBE_CHANNEL_ID", label: "Channel ID", description: "Your channel ID starting with UC… (from youtube.com/channel/UC…)" },
    ],
  },
  {
    key: "pinterest",
    label: "Pinterest",
    Icon: Pin,
    color: "from-rose-500 to-pink-600",
    docsUrl: "https://developers.pinterest.com/",
    instructions: "Create a Pinterest App → generate an Access Token with boards:read, pins:read user_accounts:read permissions.",
    fields: [
      { key: "SMM_PINTEREST_ACCESS_TOKEN", label: "Access Token", description: "Pinterest API v5 Access Token" },
    ],
  },
];

// ── components ───────────────────────────────────────────────────────────────

type IntegrationRow = {
  id: number;
  name: string;
  label: string;
  value: string;
  hasValue: boolean;
  description?: string;
  category: string;
};

type TestResult = { ok: boolean; message: string } | null;

function PlatformCard({ platform, integrations }: { platform: PlatformDef; integrations: IntegrationRow[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<TestResult>(null);
  const [testing, setTesting] = useState(false);
  const [open, setOpen] = useState(false);

  const { Icon, label, color, fields, instructions, docsUrl } = platform;

  const hasAll = fields.every(f => {
    const row = integrations.find(r => r.name === f.key);
    return row?.hasValue;
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const ops = fields.map(f => {
        const val = values[f.key];
        if (!val) return Promise.resolve(null);
        const existing = integrations.find(r => r.name === f.key);
        return fetch(`${API}/smm/settings`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: f.key, label: f.label, value: val, description: f.description }),
        }).then(r => r.json());
      });
      return Promise.all(ops);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["smm-settings"] });
      setValues({});
      toast({ title: `${label} credentials saved!` });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch(`${API}/smm/settings/test/${platform.key}`, {
        method: "POST",
        credentials: "include",
      });
      const result = await r.json();
      setTestResult(result);
    } catch {
      setTestResult({ ok: false, message: "Network error — could not reach the server" });
    } finally {
      setTesting(false);
    }
  };

  const hasChanges = fields.some(f => values[f.key]?.trim());

  return (
    <Card className={`overflow-hidden transition-all ${hasAll ? "border-emerald-500/20" : "border-border"}`}>
      {/* Header */}
      <div
        className="flex items-center gap-3 p-5 cursor-pointer select-none"
        onClick={() => setOpen(v => !v)}
      >
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-md shrink-0`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{fields.length} credential{fields.length > 1 ? "s" : ""} required</p>
        </div>
        {hasAll ? (
          <Badge variant="secondary" className="text-emerald-400 border-emerald-400/30 bg-emerald-400/10 shrink-0">
            <CheckCircle2 className="w-3 h-3 mr-1" />Connected
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-muted-foreground shrink-0">Not configured</Badge>
        )}
      </div>

      {/* Expanded */}
      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-border/60 pt-4">
          {instructions && (
            <div className="flex gap-2 p-3 bg-blue-500/8 border border-blue-500/20 rounded-lg">
              <AlertCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div className="text-xs text-blue-400/90 space-y-1">
                <p>{instructions}</p>
                {docsUrl && (
                  <a href={docsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 underline hover:no-underline">
                    <ExternalLink className="w-3 h-3" />
                    Official Docs
                  </a>
                )}
              </div>
            </div>
          )}

          {fields.map(field => {
            const row = integrations.find(r => r.name === field.key);
            const isVisible = visible[field.key];
            const displayValue = values[field.key] ?? (row?.hasValue ? row.value : "");
            return (
              <div key={field.key} className="space-y-1.5">
                <Label className="text-xs font-medium">
                  {field.label}
                  {row?.hasValue && (
                    <span className="ml-2 text-emerald-400 font-normal">✓ saved</span>
                  )}
                </Label>
                <p className="text-[11px] text-muted-foreground">{field.description}</p>
                <div className="flex gap-2">
                  <Input
                    type={isVisible ? "text" : "password"}
                    value={displayValue}
                    onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={row?.hasValue ? "Leave blank to keep existing value" : `Enter ${field.label}`}
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2 shrink-0"
                    onClick={() => setVisible(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                  >
                    {isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
                {field.docsUrl && (
                  <a href={field.docsUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary flex items-center gap-1 hover:underline">
                    <ExternalLink className="w-3 h-3" />
                    Get this from here
                  </a>
                )}
              </div>
            );
          })}

          {/* Test result */}
          {testResult && (
            <div className={`flex gap-2 p-3 rounded-lg border text-xs ${
              testResult.ok
                ? "bg-emerald-500/8 border-emerald-500/20 text-emerald-400"
                : "bg-red-500/8 border-red-500/20 text-red-400"
            }`}>
              {testResult.ok
                ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                : <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
              }
              {testResult.message}
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            {hasChanges && (
              <Button
                size="sm"
                className="gap-2"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Credentials
              </Button>
            )}
            {hasAll && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleTest}
                disabled={testing}
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Test Connection
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ── main ─────────────────────────────────────────────────────────────────────

export default function SocialMediaSettings() {
  const { data: integrations, isLoading } = useQuery<IntegrationRow[]>({
    queryKey: ["smm-settings"],
    queryFn: () => fetch(`${API}/smm/settings`, { credentials: "include" }).then(r => r.json()),
  });

  const connectedCount = PLATFORM_DEFS.filter(p =>
    p.fields.every(f => integrations?.find(r => r.name === f.key)?.hasValue)
  ).length;

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
          <Settings2 className="w-6 h-6 text-primary" />
          AD SMM Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect your social media accounts to enable real-time data and management.
          {connectedCount > 0 && (
            <span className="ml-2 text-emerald-400">{connectedCount} / {PLATFORM_DEFS.length} configured</span>
          )}
        </p>
      </div>

      {/* Info banner */}
      <div className="flex gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl">
        <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="text-sm text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">API credentials are stored securely</p>
          <p>All tokens are encrypted at rest and masked in the UI. They are only used server-side to fetch your social media data. Click any platform below to expand and configure it.</p>
        </div>
      </div>

      {/* Platform cards */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-4">
          {PLATFORM_DEFS.map(platform => (
            <PlatformCard
              key={platform.key}
              platform={platform}
              integrations={integrations ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}
