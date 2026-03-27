import { useState, useRef } from "react";
import { useListTeamMembers, useCreateTeamMember, useUpdateTeamMember, useDeleteTeamMember } from "@workspace/api-client-react";
import type { TeamMember } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Edit3, Trash2, Users, Mail, Linkedin, Upload, X } from "lucide-react";
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
    defaultValues: { name: "", role: "", bio: "", photoUrl: "", email: "", linkedinUrl: "" }
  });

  const photoUrl = form.watch("photoUrl") ?? "";

  const openCreate = () => {
    form.reset({ name: "", role: "", bio: "", photoUrl: "", email: "", linkedinUrl: "" });
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
    if (editingId) {
      updateMutation.mutate({ id: editingId, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/team"] });
          toast({ title: "Member updated successfully" });
          setIsModalOpen(false);
        },
        onError: () => toast({ variant: "destructive", title: "Error", description: "Could not update member." }),
      });
    } else {
      createMutation.mutate({ data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/team"] });
          toast({ title: "Member added successfully" });
          setIsModalOpen(false);
        },
        onError: () => toast({ variant: "destructive", title: "Error", description: "Could not add member." }),
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Team Management</h1>
          <p className="text-muted-foreground mt-1">Manage agency staff and their profiles.</p>
        </div>
        <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl px-6">
          <Plus className="w-5 h-5 mr-2" /> Add Member
        </Button>
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
          members.map((member) => (
            <div key={member.id} className="bg-card rounded-2xl p-6 border border-border/50 flex flex-col items-center text-center group hover:border-primary/50 transition-all shadow-sm hover:shadow-lg relative">
              <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="secondary" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEdit(member)}>
                  <Edit3 className="w-4 h-4" />
                </Button>
                <Button variant="destructive" size="icon" className="h-8 w-8 rounded-lg" onClick={() => handleDelete(member.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              <div className="w-24 h-24 rounded-full border-4 border-secondary overflow-hidden mb-4 bg-secondary/50">
                {member.photoUrl ? (
                  <img src={member.photoUrl} alt={member.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-muted-foreground font-display">
                    {member.name.charAt(0)}
                  </div>
                )}
              </div>

              <h3 className="text-lg font-display font-bold text-foreground">{member.name}</h3>
              <p className="text-sm font-medium text-primary mt-1">{member.role}</p>

              {member.bio && (
                <p className="text-sm text-muted-foreground mt-3 line-clamp-3">{member.bio}</p>
              )}

              <div className="flex gap-3 mt-5 pt-5 border-t border-border/50 w-full justify-center">
                {member.email && (
                  <a href={`mailto:${member.email}`} className="text-muted-foreground hover:text-primary transition-colors">
                    <Mail className="w-5 h-5" />
                  </a>
                )}
                {member.linkedinUrl && (
                  <a href={member.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                    <Linkedin className="w-5 h-5" />
                  </a>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-20 text-center bg-card rounded-2xl border border-border/50">
            <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-lg">No team members yet.</p>
          </div>
        )}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-xl bg-card border-border/50 max-h-[90vh] overflow-y-auto">
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
