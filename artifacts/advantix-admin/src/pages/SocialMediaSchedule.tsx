import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays, Send, Trash2, Clock, CheckCircle2, XCircle,
  Instagram, Facebook, Twitter, Youtube, Linkedin, Loader2, Pin,
  AlertCircle, Plus,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const API = "/api";

type ScheduledPost = {
  id: number;
  platforms: string;
  content: string;
  imageUrl: string | null;
  scheduledAt: string;
  status: string;
  publishedAt: string | null;
  errorMessage: string | null;
  createdBy: string | null;
  createdAt: string;
};

const PLATFORMS = [
  { key: "instagram", label: "Instagram", Icon: Instagram, color: "from-pink-500 to-rose-500" },
  { key: "facebook",  label: "Facebook",  Icon: Facebook,  color: "from-blue-600 to-blue-500" },
  { key: "twitter",   label: "X / Twitter", Icon: Twitter, color: "from-sky-400 to-sky-500" },
  { key: "linkedin",  label: "LinkedIn",  Icon: Linkedin,  color: "from-blue-700 to-blue-600" },
  { key: "youtube",   label: "YouTube",   Icon: Youtube,   color: "from-red-500 to-red-600" },
  { key: "pinterest", label: "Pinterest", Icon: Pin,       color: "from-rose-500 to-pink-600" },
] as const;

function statusBadge(status: string) {
  switch (status) {
    case "pending":   return <Badge variant="secondary" className="text-amber-400 border-amber-400/30 bg-amber-400/10"><Clock className="w-3 h-3 mr-1" />Scheduled</Badge>;
    case "published": return <Badge variant="secondary" className="text-emerald-400 border-emerald-400/30 bg-emerald-400/10"><CheckCircle2 className="w-3 h-3 mr-1" />Published</Badge>;
    case "failed":    return <Badge variant="secondary" className="text-red-400 border-red-400/30 bg-red-400/10"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
    case "cancelled": return <Badge variant="secondary" className="text-muted-foreground border-border"><XCircle className="w-3 h-3 mr-1" />Cancelled</Badge>;
    default:          return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function SocialMediaSchedule() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  });

  const { data: posts, isLoading } = useQuery<ScheduledPost[]>({
    queryKey: ["smm-scheduled"],
    queryFn: () => fetch(`${API}/smm/scheduled`, { credentials: "include" }).then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (body: { platforms: string[]; content: string; imageUrl?: string; scheduledAt: string }) =>
      fetch(`${API}/smm/scheduled`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["smm-scheduled"] });
      setContent("");
      setImageUrl("");
      setSelectedPlatforms([]);
      toast({ title: "Post scheduled!", description: "It will be published at the selected time." });
    },
    onError: () => toast({ title: "Failed to schedule", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`${API}/smm/scheduled/${id}`, { method: "DELETE", credentials: "include" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["smm-scheduled"] });
      toast({ title: "Post removed" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`${API}/smm/scheduled/${id}/cancel`, { method: "PATCH", credentials: "include" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["smm-scheduled"] }),
  });

  const togglePlatform = (key: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
    );
  };

  const handleSubmit = () => {
    if (!selectedPlatforms.length) { toast({ title: "Select at least one platform", variant: "destructive" }); return; }
    if (!content.trim()) { toast({ title: "Content is required", variant: "destructive" }); return; }
    createMutation.mutate({
      platforms: selectedPlatforms,
      content,
      imageUrl: imageUrl.trim() || undefined,
      scheduledAt: new Date(scheduledAt).toISOString(),
    });
  };

  const charCount = content.length;
  const charLimit = 280; // Twitter limit (most restrictive)

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
          <CalendarDays className="w-6 h-6 text-primary" />
          Schedule Post
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Write once, schedule to multiple platforms at once.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Compose form */}
        <Card className="p-6 space-y-5 lg:col-span-3">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            Compose Post
          </h2>

          {/* Platform selection */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-2 block">Select Platforms</Label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map(({ key, label, Icon, color }) => {
                const active = selectedPlatforms.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => togglePlatform(key)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    <div className={`w-5 h-5 rounded bg-gradient-to-br ${color} flex items-center justify-center`}>
                      <Icon className="w-3 h-3 text-white" />
                    </div>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-2 block">Post Content</Label>
            <Textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Write your post content here... #hashtags @mentions"
              rows={5}
              className="resize-none"
            />
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-[11px] text-muted-foreground">Twitter/X limit: 280 chars</p>
              <p className={`text-[11px] font-medium ${charCount > charLimit ? "text-red-400" : "text-muted-foreground"}`}>
                {charCount} / {charLimit}
              </p>
            </div>
          </div>

          {/* Image URL */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-2 block">Image URL (optional)</Label>
            <Input
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
            />
          </div>

          {/* Schedule time */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-2 block">Schedule Date & Time</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
            />
          </div>

          {/* Warning about auto-publish */}
          <div className="flex gap-2 p-3 bg-amber-500/8 border border-amber-500/20 rounded-lg">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-400/90">
              <strong>Note:</strong> Scheduled posts are stored here for reference. Auto-publishing requires a background job or webhook setup per platform's API requirements.
            </p>
          </div>

          <Button
            className="w-full gap-2"
            onClick={handleSubmit}
            disabled={createMutation.isPending || !selectedPlatforms.length || !content.trim()}
          >
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Schedule Post
          </Button>
        </Card>

        {/* Upcoming */}
        <Card className="p-6 lg:col-span-2">
          <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Scheduled Queue
            {posts && <span className="text-xs font-normal text-muted-foreground ml-1">({posts.filter(p => p.status === "pending").length} pending)</span>}
          </h2>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : !posts?.length ? (
            <div className="text-center py-8 text-sm text-muted-foreground">No posts scheduled yet</div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {posts.map(post => {
                const platforms = post.platforms.split(",").map(s => s.trim());
                return (
                  <div key={post.id} className="border border-border/60 rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-foreground line-clamp-2 flex-1">{post.content}</p>
                      <div className="shrink-0">{statusBadge(post.status)}</div>
                    </div>

                    {/* Platform icons */}
                    <div className="flex items-center gap-1.5">
                      {platforms.map(key => {
                        const cfg = PLATFORMS.find(p => p.key === key);
                        if (!cfg) return null;
                        const { Icon, color } = cfg;
                        return (
                          <div key={key} className={`w-5 h-5 rounded bg-gradient-to-br ${color} flex items-center justify-center`}>
                            <Icon className="w-2.5 h-2.5 text-white" />
                          </div>
                        );
                      })}
                      <span className="text-[11px] text-muted-foreground ml-1">
                        {new Date(post.scheduledAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    {post.errorMessage && (
                      <p className="text-[11px] text-red-400">{post.errorMessage}</p>
                    )}

                    <div className="flex items-center gap-2">
                      {post.status === "pending" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground"
                          onClick={() => cancelMutation.mutate(post.id)}
                          disabled={cancelMutation.isPending}
                        >
                          Cancel
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-400/10 ml-auto"
                        onClick={() => deleteMutation.mutate(post.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* History */}
      {posts && posts.filter(p => p.status !== "pending").length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            Post History
          </h2>
          <Card className="divide-y divide-border/60">
            {posts.filter(p => p.status !== "pending").map(post => {
              const platforms = post.platforms.split(",").map(s => s.trim());
              return (
                <div key={post.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex items-center gap-1">
                    {platforms.map(key => {
                      const cfg = PLATFORMS.find(p => p.key === key);
                      if (!cfg) return null;
                      const { Icon, color } = cfg;
                      return (
                        <div key={key} className={`w-6 h-6 rounded bg-gradient-to-br ${color} flex items-center justify-center`}>
                          <Icon className="w-3 h-3 text-white" />
                        </div>
                      );
                    })}
                  </div>
                  <p className="flex-1 text-sm text-foreground line-clamp-1">{post.content}</p>
                  <div className="shrink-0">{statusBadge(post.status)}</div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400 shrink-0"
                    onClick={() => deleteMutation.mutate(post.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              );
            })}
          </Card>
        </div>
      )}
    </div>
  );
}
