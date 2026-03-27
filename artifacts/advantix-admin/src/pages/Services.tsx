import { useState } from "react";
import { motion } from "framer-motion";
import {
  useListAllServices,
  useCreateService,
  useUpdateService,
  useDeleteService,
} from "@workspace/api-client-react";
import type { Service } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Monitor, Database, LayoutTemplate, ShoppingCart,
  Bot, Users, UserPlus, Palette, Facebook, Share2,
  ClipboardList, TrendingUp, Globe, Code2, Briefcase,
  Mail, Megaphone, BarChart3, Headphones, FileText,
  Zap, Search, Settings, Star, Plus, Pencil, Trash2,
  Eye, EyeOff, Package
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

const ICONS = [
  { name: "LayoutTemplate", icon: LayoutTemplate, label: "Layout" },
  { name: "Database", icon: Database, label: "Database" },
  { name: "Monitor", icon: Monitor, label: "Monitor" },
  { name: "ShoppingCart", icon: ShoppingCart, label: "Shopping" },
  { name: "Bot", icon: Bot, label: "Bot" },
  { name: "Users", icon: Users, label: "Users" },
  { name: "UserPlus", icon: UserPlus, label: "User+" },
  { name: "Palette", icon: Palette, label: "Palette" },
  { name: "Facebook", icon: Facebook, label: "Facebook" },
  { name: "Share2", icon: Share2, label: "Share" },
  { name: "ClipboardList", icon: ClipboardList, label: "Clipboard" },
  { name: "TrendingUp", icon: TrendingUp, label: "Trending" },
  { name: "Globe", icon: Globe, label: "Globe" },
  { name: "Code2", icon: Code2, label: "Code" },
  { name: "Briefcase", icon: Briefcase, label: "Briefcase" },
  { name: "Mail", icon: Mail, label: "Mail" },
  { name: "Megaphone", icon: Megaphone, label: "Megaphone" },
  { name: "BarChart3", icon: BarChart3, label: "Chart" },
  { name: "Headphones", icon: Headphones, label: "Support" },
  { name: "FileText", icon: FileText, label: "Document" },
  { name: "Zap", icon: Zap, label: "Zap" },
  { name: "Search", icon: Search, label: "Search" },
  { name: "Settings", icon: Settings, label: "Settings" },
  { name: "Star", icon: Star, label: "Star" },
];

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = Object.fromEntries(
  ICONS.map(({ name, icon }) => [name, icon])
);

function getIcon(name: string): React.ComponentType<{ className?: string }> {
  return iconMap[name] ?? Briefcase;
}

interface ServiceForm {
  name: string;
  icon: string;
  description: string;
  details: string;
  order: number;
  isActive: boolean;
}

const emptyForm: ServiceForm = {
  name: "",
  icon: "Briefcase",
  description: "",
  details: "",
  order: 0,
  isActive: true,
};

export default function Services() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: services = [], isLoading } = useListAllServices();
  const createMutation = useCreateService();
  const updateMutation = useUpdateService();
  const deleteMutation = useDeleteService();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Service | null>(null);
  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);
  const [detailsPreview, setDetailsPreview] = useState<Service | null>(null);

  function openCreate() {
    setEditTarget(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(s: Service) {
    setEditTarget(s);
    setForm({
      name: s.name,
      icon: s.icon,
      description: s.description,
      details: s.details ?? "",
      order: s.order,
      isActive: s.isActive,
    });
    setDialogOpen(true);
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["/api/services"] });
    queryClient.invalidateQueries({ queryKey: ["/api/services/all"] });
  }

  function handleSave() {
    const payload = {
      name: form.name.trim(),
      icon: form.icon,
      description: form.description.trim(),
      details: form.details.trim() || undefined,
      order: form.order,
      isActive: form.isActive,
    };

    if (!payload.name || !payload.description) {
      toast({ variant: "destructive", title: "Validation Error", description: "Name and description are required." });
      return;
    }

    if (editTarget) {
      updateMutation.mutate(
        { id: editTarget.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Service updated" });
            invalidate();
            setDialogOpen(false);
          },
          onError: () => toast({ variant: "destructive", title: "Update failed" }),
        }
      );
    } else {
      createMutation.mutate(
        { data: payload },
        {
          onSuccess: () => {
            toast({ title: "Service created" });
            invalidate();
            setDialogOpen(false);
          },
          onError: () => toast({ variant: "destructive", title: "Create failed" }),
        }
      );
    }
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => {
          toast({ title: "Service deleted" });
          invalidate();
          setDeleteTarget(null);
        },
        onError: () => toast({ variant: "destructive", title: "Delete failed" }),
      }
    );
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const PreviewIcon = getIcon(form.icon);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold">Services</h1>
          <p className="text-muted-foreground mt-1">Manage the services displayed on the public website.</p>
        </div>
        <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20">
          <Plus className="w-4 h-4 mr-2" /> Add Service
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 bg-secondary/50 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : services.length === 0 ? (
        <div className="text-center py-24 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-4 opacity-40" />
          <p className="font-semibold">No services yet.</p>
          <p className="text-sm mt-1">Click "Add Service" to create the first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((s, idx) => {
            const Icon = getIcon(s.icon);
            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                className={`relative bg-card border rounded-2xl p-5 group transition-all hover:shadow-md ${s.isActive ? "border-border/50" : "border-dashed border-border/30 opacity-60"}`}
              >
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-display font-bold truncate">{s.name}</h3>
                      {!s.isActive && <Badge variant="secondary" className="text-xs shrink-0">Hidden</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{s.description}</p>
                    {s.details && (
                      <button
                        onClick={() => setDetailsPreview(s)}
                        className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" /> Preview details
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border/30">
                  <span className="text-xs text-muted-foreground">Order: {s.order}</span>
                  <div className="flex-1" />
                  <Button size="sm" variant="ghost" onClick={() => openEdit(s)} className="h-8 px-3">
                    <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteTarget(s)}
                    className="h-8 px-3 text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border/50">
          <DialogHeader>
            <DialogTitle className="text-xl font-display">
              {editTarget ? "Edit Service" : "Add New Service"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Service Name *</label>
                <Input
                  placeholder="e.g. Website Development"
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Display Order</label>
                <Input
                  type="number"
                  value={form.order}
                  onChange={(e) => setForm(f => ({ ...f, order: parseInt(e.target.value) || 0 }))}
                  className="h-11"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Short Description *</label>
              <Input
                placeholder="One-line summary shown on the service card"
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                className="h-11"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Icon</label>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <PreviewIcon className="w-5 h-5 text-primary" />
                </div>
                <Select value={form.icon} onValueChange={(v) => setForm(f => ({ ...f, icon: v }))}>
                  <SelectTrigger className="h-11 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {ICONS.map(({ name, icon: IconComp, label }) => (
                      <SelectItem key={name} value={name}>
                        <div className="flex items-center gap-2">
                          <IconComp className="w-4 h-4" />
                          {label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Details</label>
              <p className="text-xs text-muted-foreground">
                Full description shown when users click the service. Use **bold** for emphasis, bullet points starting with "- ", and blank lines between paragraphs.
              </p>
              <Textarea
                placeholder={`What's included:\n- Custom responsive design\n- SEO-ready structure\n- 30-day post-launch support\n\n**Technologies we use:**\nReact, Next.js, WordPress`}
                value={form.details}
                onChange={(e) => setForm(f => ({ ...f, details: e.target.value }))}
                className="min-h-[200px] font-mono text-sm resize-y"
              />
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm font-semibold">Visibility</label>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                  form.isActive
                    ? "bg-green-500/10 border-green-500/30 text-green-600"
                    : "bg-secondary border-border text-muted-foreground"
                }`}
              >
                {form.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                {form.isActive ? "Visible on website" : "Hidden from website"}
              </button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-primary hover:bg-primary/90">
              {isSaving ? "Saving..." : editTarget ? "Save Changes" : "Create Service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Preview Dialog */}
      <Dialog open={!!detailsPreview} onOpenChange={(o) => !o && setDetailsPreview(null)}>
        {detailsPreview && (
          <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto bg-card border-border/50">
            <DialogHeader>
              <DialogTitle>{detailsPreview.name} — Details Preview</DialogTitle>
            </DialogHeader>
            <div className="mt-2 space-y-1 font-mono text-sm text-muted-foreground whitespace-pre-wrap border border-border/40 rounded-xl p-4 bg-secondary/30">
              {detailsPreview.details}
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border/50">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This service will be permanently removed from the website. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
