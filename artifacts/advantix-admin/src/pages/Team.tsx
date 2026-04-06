import { useState, useRef } from "react";
import { useListTeamMembers, useCreateTeamMember, useUpdateTeamMember, useDeleteTeamMember } from "@workspace/api-client-react";
import type { TeamMember } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Edit3, Trash2, Users, Mail, Linkedin, Upload, X, Tag } from "lucide-react";
import { ImportExport } from "@/components/ImportExport";
import type { ColumnDef } from "@/components/ImportExport";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  role: z.string().min(1, "Role is required"),
  bio: z.string().optional(),
  photoUrl: z.string().optional(),
  email: z.string().optional(),
  linkedinUrl: z.string().optional(),
  badge: z.string().optional(),
  tagline: z.string().optional(),
  skillsRaw: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

function PhotoUploader({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === "string") onChange(result);
    };
    reader.readAsDataURL(file);
  };

  const clearPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-semibold">Photo</label>
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-full border-2 border-dashed border-border bg-secondary/50 flex items-center justify-center overflow-hidden shrink-0 relative group">
          {value ? (
            <>
              <img src={value} alt="Preview" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={clearPhoto}
                className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </>
          ) : (
            <Upload className="w-6 h-6 text-muted-foreground/60" />
          )}
        </div>

        <div className="flex-1 space-y-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4 mr-2" />
            {value ? "Change Photo" : "Upload Photo"}
          </Button>
          <p className="text-xs text-muted-foreground text-center">or paste a URL below</p>
          <Input
            value={value.startsWith("data:") ? "" : value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://..."
            className="bg-secondary/50 border-border text-sm h-8"
          />
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}

export default function Team() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: members, isLoading } = useListTeamMembers();
  const createMutation = useCreateTeamMember();
  const updateMutation = useUpdateTeamMember();
  const deleteMutation = useDeleteTeamMember();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", role: "", bio: "", photoUrl: "", email: "", linkedinUrl: "", badge: "", tagline: "", skillsRaw: "" }
  });

  const photoUrl = form.watch("photoUrl") ?? "";

  const openCreate = () => {
    form.reset({ name: "", role: "", bio: "", photoUrl: "", email: "", linkedinUrl: "", badge: "", tagline: "", skillsRaw: "" });
    setEditingId(null);
    setIsModalOpen(true);
  };

  const openEdit = (member: TeamMember) => {
    form.reset({
      name: member.name,
      role: member.role,
      bio: member.bio ?? "",
      photoUrl: member.photoUrl ?? "",
      email: member.email ?? "",
      linkedinUrl: member.linkedinUrl ?? "",
      badge: member.badge ?? "",
      tagline: member.tagline ?? "",
      skillsRaw: (member.skills ?? []).join(", "),
    });
    setEditingId(member.id);
    setIsModalOpen(true);
  };

  const handleDelete = (id: number) => {
    if (!confirm("Remove this team member?")) return;
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/team"] });
        toast({ title: "Member removed" });
      },
      onError: () => toast({ variant: "destructive", title: "Error", description: "Could not remove member." }),
    });
  };

  const onSubmit = (data: FormValues) => {
    const skills = data.skillsRaw
      ? data.skillsRaw.split(",").map(s => s.trim()).filter(Boolean)
      : [];

    const payload = {
      name: data.name,
      role: data.role,
      bio: data.bio,
      photoUrl: data.photoUrl,
      email: data.email,
      linkedinUrl: data.linkedinUrl,
      badge: data.badge || undefined,
      tagline: data.tagline || undefined,
      skills: skills.length > 0 ? skills : undefined,
    } as any;

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/team"] });
          toast({ title: "Member updated successfully" });
          setIsModalOpen(false);
        },
        onError: () => toast({ variant: "destructive", title: "Error", description: "Could not update member." }),
      });
    } else {
      createMutation.mutate({ data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/team"] });
          toast({ title: "Member added successfully" });
          setIsModalOpen(false);
        },
        onError: () => toast({ variant: "destructive", title: "Error", description: "Could not add member." }),
      });
    }
  };

  const teamColumns: ColumnDef<Record<string, unknown>>[] = [
    { key: "name", label: "Name" },
    { key: "role", label: "Role" },
    { key: "bio", label: "Bio" },
    { key: "email", label: "Email" },
    { key: "linkedinUrl", label: "LinkedIn URL" },
    { key: "photoUrl", label: "Photo URL" },
    { key: "badge", label: "Badge" },
    { key: "tagline", label: "Tagline" },
    {
      key: "skills",
      label: "Skills",
      format: (v) => (Array.isArray(v) ? v.join(", ") : String(v ?? "")),
      parse: (v) => v ? v.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
    },
  ];

  async function handleTeamImport(rows: Partial<Record<string, unknown>>[]) {
    for (const row of rows) {
      await createMutation.mutateAsync({
        data: {
          name: String(row.name ?? ""),
          role: String(row.role ?? ""),
          bio: row.bio ? String(row.bio) : undefined,
          email: row.email ? String(row.email) : undefined,
          linkedinUrl: row.linkedinUrl ? String(row.linkedinUrl) : undefined,
          photoUrl: row.photoUrl ? String(row.photoUrl) : undefined,
          badge: row.badge ? String(row.badge) : undefined,
          tagline: row.tagline ? String(row.tagline) : undefined,
          skills: Array.isArray(row.skills) ? row.skills : [],
        },
      });
    }
    queryClient.invalidateQueries({ queryKey: ["/api/team"] });
    toast({ title: "Import complete", description: `${rows.length} team members imported.` });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Team Management</h1>
          <p className="text-muted-foreground mt-1">Manage agency staff and their profiles.</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExport
            data={(members ?? []) as unknown as Record<string, unknown>[]}
            columns={teamColumns}
            entityName="Team Members"
            onImport={handleTeamImport}
          />
          <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl px-6">
            <Plus className="w-5 h-5 mr-2" /> Add Member
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card rounded-2xl p-6 border border-border/50 flex flex-col items-center">
              <Skeleton className="w-24 h-24 rounded-full mb-4" />
              <Skeleton className="h-6 w-3/4 mb-2" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))
        ) : members && members.length > 0 ? (
          members.map((member) => {
            const badge = member.badge;
            const skills = member.skills;
            return (
              <div key={member.id} className="bg-card rounded-2xl border border-border/50 flex flex-col group hover:border-primary/50 transition-all shadow-sm hover:shadow-lg relative overflow-hidden">
                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <Button variant="secondary" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEdit(member)}>
                    <Edit3 className="w-4 h-4" />
                  </Button>
                  <Button variant="destructive" size="icon" className="h-8 w-8 rounded-lg" onClick={() => handleDelete(member.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                {/* Photo */}
                <div className="relative aspect-square w-full overflow-hidden rounded-t-2xl bg-secondary/50">
                  {member.photoUrl ? (
                    <img src={member.photoUrl} alt={member.name} className="w-full h-full object-cover object-top" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-muted-foreground font-display">
                      {member.name.charAt(0)}
                    </div>
                  )}
                  {badge && (
                    <span className="absolute top-3 left-3 px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary text-primary-foreground">
                      {badge}
                    </span>
                  )}
                </div>

                <div className="p-5 flex flex-col flex-1">
                  <h3 className="text-base font-display font-bold text-foreground">{member.name}</h3>
                  <p className="text-xs font-medium text-primary mt-0.5">{member.role}</p>

                  {skills && skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {skills.slice(0, 3).map(s => (
                        <span key={s} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary border border-border text-muted-foreground">
                          {s}
                        </span>
                      ))}
                      {skills.length > 3 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 border border-primary/20 text-primary">
                          +{skills.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  {member.bio && (
                    <p className="text-xs text-muted-foreground mt-3 line-clamp-2 leading-relaxed">{member.bio}</p>
                  )}

                  <div className="flex gap-3 mt-auto pt-4 border-t border-border/50 justify-center">
                    {member.email && (
                      <a href={`mailto:${member.email}`} className="text-muted-foreground hover:text-primary transition-colors">
                        <Mail className="w-4 h-4" />
                      </a>
                    )}
                    {member.linkedinUrl && (
                      <a href={member.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                        <Linkedin className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-full py-20 text-center bg-card rounded-2xl border border-border/50">
            <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-lg">No team members yet.</p>
          </div>
        )}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-2xl bg-card border-border/50 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display">{editingId ? "Edit Member" : "Add Member"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Full Name *</label>
                <Input {...form.register("name")} placeholder="Jane Doe" className="bg-secondary/50 border-border" />
                {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Role/Title *</label>
                <Input {...form.register("role")} placeholder="e.g. Lead Developer" className="bg-secondary/50 border-border" />
                {form.formState.errors.role && <p className="text-xs text-destructive">{form.formState.errors.role.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Badge Label</label>
                <Input {...form.register("badge")} placeholder="e.g. Team Leader, Tech Lead" className="bg-secondary/50 border-border" />
                <p className="text-xs text-muted-foreground">Shown as a pill on the card (optional)</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Skills</label>
                <Input {...form.register("skillsRaw")} placeholder="e.g. Python, AI & ML, React" className="bg-secondary/50 border-border" />
                <p className="text-xs text-muted-foreground">Comma-separated list of skills</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Email Address</label>
                <Input {...form.register("email")} placeholder="jane@example.com" className="bg-secondary/50 border-border" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">LinkedIn URL</label>
                <Input {...form.register("linkedinUrl")} placeholder="https://linkedin.com/..." className="bg-secondary/50 border-border" />
              </div>
            </div>

            <PhotoUploader
              value={photoUrl}
              onChange={(url) => form.setValue("photoUrl", url)}
            />

            <div className="space-y-2">
              <label className="text-sm font-semibold">Tagline</label>
              <Textarea {...form.register("tagline")} placeholder="Short powerful tagline shown on hover or profile..." className="h-16 bg-secondary/50 border-border resize-none" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">Bio</label>
              <Textarea {...form.register("bio")} placeholder="Short biography..." className="h-20 bg-secondary/50 border-border resize-none" />
            </div>

            <DialogFooter className="pt-4 border-t border-border/50">
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="bg-primary text-primary-foreground">
                {editingId ? "Save Changes" : "Add Member"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
