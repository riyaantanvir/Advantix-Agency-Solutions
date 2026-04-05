import { useState } from "react";
import { useListPortfolio, useCreatePortfolioItem, useUpdatePortfolioItem, useDeletePortfolioItem } from "@workspace/api-client-react";
import type { PortfolioItem } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Edit3, Trash2, Image as ImageIcon, Briefcase } from "lucide-react";
import { ImportExport } from "@/components/ImportExport";
import type { ColumnDef } from "@/components/ImportExport";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const categories = [
  "Website", "Python Bot", "Facebook Marketing", "CRM Development", "E-commerce", "Graphics & Branding", "Other"
];

const portfolioColumns: ColumnDef<Record<string, unknown>>[] = [
  { key: "title", label: "Title" },
  { key: "category", label: "Category" },
  { key: "clientName", label: "Client Name" },
  { key: "description", label: "Description" },
  { key: "imageUrl", label: "Image URL" },
  { key: "videoUrl", label: "Video URL" },
];

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  category: z.string().min(1, "Category is required"),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  videoUrl: z.string().optional(),
  clientName: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function Portfolio() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: items, isLoading } = useListPortfolio();
  const createMutation = useCreatePortfolioItem();
  const updateMutation = useUpdatePortfolioItem();
  const deleteMutation = useDeletePortfolioItem();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: "", category: "Website", description: "", imageUrl: "", videoUrl: "", clientName: "" }
  });

  const openCreate = () => {
    form.reset({ title: "", category: "Website", description: "", imageUrl: "", videoUrl: "", clientName: "" });
    setEditingId(null);
    setIsModalOpen(true);
  };

  async function handlePortfolioImport(rows: Partial<Record<string, unknown>>[]) {
    for (const row of rows) {
      await new Promise<void>((resolve, reject) => {
        createMutation.mutate(
          {
            data: {
              title: String(row.title ?? ""),
              category: String(row.category ?? "Other"),
              description: row.description ? String(row.description) : undefined,
              imageUrl: row.imageUrl ? String(row.imageUrl) : undefined,
              videoUrl: row.videoUrl ? String(row.videoUrl) : undefined,
              clientName: row.clientName ? String(row.clientName) : undefined,
            },
          },
          { onSuccess: () => resolve(), onError: reject }
        );
      });
    }
    queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
    toast({ title: "Import complete", description: `${rows.length} portfolio items imported.` });
  }

  const openEdit = (item: PortfolioItem) => {
    form.reset({
      title: item.title,
      category: item.category,
      description: item.description || "",
      imageUrl: item.imageUrl || "",
      videoUrl: item.videoUrl || "",
      clientName: item.clientName || ""
    });
    setEditingId(item.id);
    setIsModalOpen(true);
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this portfolio item forever?")) return;
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
        toast({ title: "Item deleted" });
      },
      onError: () => toast({ variant: "destructive", title: "Error", description: "Could not delete item." }),
    });
  };

  const onSubmit = (data: FormValues) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
          toast({ title: "Item updated successfully" });
          setIsModalOpen(false);
        },
        onError: () => toast({ variant: "destructive", title: "Error", description: "Could not update item." }),
      });
    } else {
      createMutation.mutate({ data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
          toast({ title: "Item created successfully" });
          setIsModalOpen(false);
        },
        onError: () => toast({ variant: "destructive", title: "Error", description: "Could not create item." }),
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Portfolio Manager</h1>
          <p className="text-muted-foreground mt-1">Manage cases, projects, and work examples.</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExport
            data={(items ?? []) as unknown as Record<string, unknown>[]}
            columns={portfolioColumns}
            entityName="Portfolio Items"
            onImport={handlePortfolioImport}
          />
          <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl px-6">
            <Plus className="w-5 h-5 mr-2" /> Add Project
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-card rounded-2xl p-4 border border-border/50 h-[300px] flex flex-col">
              <Skeleton className="h-40 rounded-xl w-full mb-4" />
              <Skeleton className="h-6 w-3/4 mb-2" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))
        ) : items && items.length > 0 ? (
          items.map((item) => (
            <div key={item.id} className="bg-card rounded-2xl border border-border/50 overflow-hidden flex flex-col group hover:border-primary/50 transition-colors shadow-sm">
              <div className="h-48 bg-secondary relative overflow-hidden">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : item.videoUrl ? (
                  <div className="w-full h-full flex items-center justify-center bg-black/50 text-white">Video Asset</div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground flex-col gap-2">
                    <ImageIcon className="w-8 h-8 opacity-50" />
                    <span className="text-xs">No media</span>
                  </div>
                )}
                <div className="absolute top-3 left-3 px-2.5 py-1 bg-background/90 backdrop-blur border border-border rounded-lg text-xs font-bold uppercase">
                  {item.category}
                </div>
              </div>
              
              <div className="p-5 flex-1 flex flex-col">
                <h3 className="text-xl font-display font-bold text-foreground line-clamp-1">{item.title}</h3>
                {item.clientName && <p className="text-sm font-medium text-primary mt-1">{item.clientName}</p>}
                <p className="text-sm text-muted-foreground mt-2 line-clamp-2 flex-1">{item.description || "No description provided."}</p>
                
                <div className="flex gap-2 mt-4 pt-4 border-t border-border/50">
                  <Button variant="secondary" size="sm" className="flex-1" onClick={() => openEdit(item)}>
                    <Edit3 className="w-4 h-4 mr-2" /> Edit
                  </Button>
                  <Button variant="destructive" size="icon" className="shrink-0" onClick={() => handleDelete(item.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-20 text-center bg-card rounded-2xl border border-border/50">
            <Briefcase className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-lg">No portfolio items yet.</p>
            <Button variant="link" onClick={openCreate} className="mt-2 text-primary">Create your first project</Button>
          </div>
        )}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-2xl bg-card border-border/50 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display">{editingId ? "Edit Project" : "Add Project"}</DialogTitle>
          </DialogHeader>
          
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Title *</label>
                <Input {...form.register("title")} placeholder="e.g. Acme Corp CRM" className="bg-secondary/50 border-border" />
                {form.formState.errors.title && <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Category *</label>
                <Select value={form.watch("category")} onValueChange={(v) => form.setValue("category", v)}>
                  <SelectTrigger className="bg-secondary/50 border-border">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Client Name</label>
                <Input {...form.register("clientName")} placeholder="Optional" className="bg-secondary/50 border-border" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Image URL</label>
                <Input {...form.register("imageUrl")} placeholder="https://..." className="bg-secondary/50 border-border" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">Video URL (Optional)</label>
              <Input {...form.register("videoUrl")} placeholder="https://..." className="bg-secondary/50 border-border" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">Description</label>
              <Textarea {...form.register("description")} placeholder="Project details..." className="h-24 bg-secondary/50 border-border resize-none" />
            </div>

            <DialogFooter className="pt-4 border-t border-border/50">
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="bg-primary text-primary-foreground">
                {editingId ? "Save Changes" : "Create Project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
