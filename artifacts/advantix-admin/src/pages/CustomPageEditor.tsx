import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Save, Plus, Trash2, Upload, Image, FolderOpen, Lock, Unlock,
  Eye, EyeOff, Globe, FileText, ChevronRight, X, ZoomIn, ZoomOut, ChevronLeft,
  Loader2, Check, AlertCircle, Pencil, Star, ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

type GalleryImage = { id: number; folder_id: number; url: string; caption: string | null; sort_order: number };
type GalleryFolder = { id: number; page_id: number; name: string; description: string | null; cover_image_url: string | null; sort_order: number; images: GalleryImage[] };
type CustomPage = {
  id: number; slug: string; title: string; type: "gallery" | "content";
  description: string | null; content: string | null; is_published: boolean;
  hasPassword: boolean; meta_title: string | null; meta_description: string | null;
  folders: GalleryFolder[];
};

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Request failed");
  return res.json();
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export default function CustomPageEditor() {
  const [, setLocation] = useLocation();
  const [matchNew] = useRoute("/custom-pages/new");
  const [, editParams] = useRoute<{ id: string }>("/custom-pages/:id/edit");
  const isNew = !!matchNew;
  const id = editParams?.id ?? "new";
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    title: "", slug: "", type: "gallery" as "gallery" | "content",
    description: "", content: "", password: "", clearPassword: false,
    isPublished: false, metaTitle: "", metaDescription: "",
  });
  const [slugEdited, setSlugEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<GalleryFolder | null>(null);
  const [folders, setFolders] = useState<GalleryFolder[]>([]);
  const [newFolderName, setNewFolderName] = useState("");
  const [addingFolder, setAddingFolder] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<{ images: GalleryImage[]; index: number } | null>(null);
  const [editingFolder, setEditingFolder] = useState<{ id: number; name: string; description: string } | null>(null);
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pendingPreviews, setPendingPreviews] = useState<{ tempId: string; localUrl: string; folderId: number }[]>([]);
  const [editingCaption, setEditingCaption] = useState<{ imageId: number; folderId: number; value: string } | null>(null);
  const [uploadCaption, setUploadCaption] = useState("");

  const { data: page, isLoading } = useQuery<CustomPage>({
    queryKey: ["custom-page", id],
    queryFn: () => apiFetch(`/api/admin/custom-pages/${id}`),
    enabled: !isNew,
  });

  useEffect(() => {
    if (page) {
      setForm({
        title: page.title, slug: page.slug, type: page.type,
        description: page.description ?? "", content: page.content ?? "",
        password: "", clearPassword: false, isPublished: page.is_published,
        metaTitle: page.meta_title ?? "", metaDescription: page.meta_description ?? "",
      });
      setFolders(page.folders ?? []);
      setSlugEdited(true);
    }
  }, [page]);

  const updateForm = (k: string, v: string | boolean) => {
    setForm(prev => {
      const next = { ...prev, [k]: v };
      if (k === "title" && !slugEdited) next.slug = slugify(v as string);
      return next;
    });
  };

  const savePage = async () => {
    if (!form.title || !form.slug) { toast({ title: "Title and slug are required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      if (isNew) {
        const result = await apiFetch("/api/admin/custom-pages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, password: form.password || undefined }),
        });
        qc.invalidateQueries({ queryKey: ["custom-pages"] });
        toast({ title: "Page created!" });
        setLocation(`/custom-pages/${result.id}/edit`);
      } else {
        await apiFetch(`/api/admin/custom-pages/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, password: form.password || undefined }),
        });
        qc.invalidateQueries({ queryKey: ["custom-page", id] });
        qc.invalidateQueries({ queryKey: ["custom-pages"] });
        toast({ title: "Saved!" });
      }
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const createFolder = async () => {
    if (!newFolderName.trim() || isNew) return;
    setAddingFolder(true);
    try {
      const folder = await apiFetch(`/api/admin/custom-pages/${id}/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName.trim(), sortOrder: folders.length }),
      });
      setFolders(prev => [...prev, folder]);
      setNewFolderName("");
      setSelectedFolder(folder);
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    } finally {
      setAddingFolder(false);
    }
  };

  const deleteFolder = async (folderId: number) => {
    try {
      await apiFetch(`/api/admin/custom-pages/${id}/folders/${folderId}`, { method: "DELETE" });
      setFolders(prev => prev.filter(f => f.id !== folderId));
      if (selectedFolder?.id === folderId) setSelectedFolder(null);
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    }
  };

  const updateFolder = async () => {
    if (!editingFolder) return;
    try {
      const updated = await apiFetch(`/api/admin/custom-pages/${id}/folders/${editingFolder.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingFolder.name, description: editingFolder.description }),
      });
      setFolders(prev => prev.map(f => f.id === editingFolder.id ? { ...f, ...updated } : f));
      if (selectedFolder?.id === editingFolder.id) setSelectedFolder(prev => prev ? { ...prev, ...updated } : null);
      setEditingFolder(null);
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    }
  };

  const uploadImages = useCallback(async (files: FileList, folderId: number) => {
    if (!files.length) return;

    // Create local previews immediately for all files
    const previews = Array.from(files).map((file) => ({
      tempId: Math.random().toString(36).slice(2),
      localUrl: URL.createObjectURL(file),
      folderId,
    }));
    setPendingPreviews(prev => [...prev, ...previews]);
    setUploading(true);

    let successCount = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const tempId = previews[i].tempId;
      try {
        const formData = new FormData();
        formData.append("file", file);
        if (uploadCaption.trim()) formData.append("caption", uploadCaption.trim());
        const img: GalleryImage = await apiFetch(`/api/admin/custom-pages/${id}/folders/${folderId}/images`, {
          method: "POST",
          body: formData,
        });
        // Revoke the object URL and remove pending preview, add real image
        URL.revokeObjectURL(previews[i].localUrl);
        setPendingPreviews(prev => prev.filter(p => p.tempId !== tempId));
        setFolders(prev => prev.map(f =>
          f.id === folderId ? { ...f, images: [...f.images, img] } : f
        ));
        setSelectedFolder(prev => prev?.id === folderId ? { ...prev, images: [...prev.images, img] } : prev);
        successCount++;
      } catch {
        // Remove failed preview
        URL.revokeObjectURL(previews[i].localUrl);
        setPendingPreviews(prev => prev.filter(p => p.tempId !== tempId));
      }
    }

    setUploading(false);
    if (successCount > 0) toast({ title: `${successCount} image${successCount > 1 ? "s" : ""} uploaded` });
    if (successCount < files.length) toast({ title: `${files.length - successCount} image(s) failed`, variant: "destructive" });
  }, [id, toast]);

  const deleteImage = async (folderId: number, imageId: number) => {
    try {
      await apiFetch(`/api/admin/custom-pages/${id}/folders/${folderId}/images/${imageId}`, { method: "DELETE" });
      setFolders(prev => prev.map(f => f.id === folderId ? { ...f, images: f.images.filter(img => img.id !== imageId) } : f));
      setSelectedFolder(prev => prev?.id === folderId ? { ...prev, images: prev.images.filter(img => img.id !== imageId) } : prev);
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    }
  };

  const saveCaption = async () => {
    if (!editingCaption) return;
    const { imageId, folderId, value } = editingCaption;
    try {
      const updated: GalleryImage = await apiFetch(
        `/api/admin/custom-pages/${id}/folders/${folderId}/images/${imageId}`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caption: value }) }
      );
      const update = (imgs: GalleryImage[]) => imgs.map(i => i.id === imageId ? { ...i, caption: updated.caption } : i);
      setFolders(prev => prev.map(f => f.id === folderId ? { ...f, images: update(f.images) } : f));
      setSelectedFolder(prev => prev?.id === folderId ? { ...prev, images: update(prev.images) } : prev);
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "Failed to save caption", variant: "destructive" });
    } finally {
      setEditingCaption(null);
    }
  };

  const setCoverImage = async (folderId: number, imageUrl: string) => {
    try {
      await apiFetch(`/api/admin/custom-pages/${id}/folders/${folderId}/cover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      });
      setFolders(prev => prev.map(f => f.id === folderId ? { ...f, cover_image_url: imageUrl } : f));
      setSelectedFolder(prev => prev?.id === folderId ? { ...prev, cover_image_url: imageUrl } : prev);
      toast({ title: "Cover image set" });
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const currentImages = selectedFolder?.images ?? [];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/custom-pages")} className="rounded-xl">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold">{isNew ? "New Page" : "Edit Page"}</h1>
          {!isNew && (
            <p className="text-xs text-muted-foreground mt-0.5">/pages/{form.slug}</p>
          )}
        </div>
        {!isNew && (
          <a
            href={`/pages/${form.slug}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" className="gap-2 rounded-xl">
              <ExternalLink className="w-4 h-4" />
              View Webpage
            </Button>
          </a>
        )}
        <Button onClick={savePage} disabled={saving} className="gap-2 rounded-xl">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isNew ? "Create Page" : "Save Changes"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Settings */}
        <div className="space-y-4">
          {/* Basic Info */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <p className="font-semibold text-sm">Page Settings</p>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Page Title *</label>
              <Input
                value={form.title}
                onChange={(e) => updateForm("title", e.target.value)}
                placeholder="My Gallery Page"
                className="rounded-xl"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">URL Slug *</label>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground shrink-0">/pages/</span>
                <Input
                  value={form.slug}
                  onChange={(e) => { setSlugEdited(true); updateForm("slug", slugify(e.target.value)); }}
                  placeholder="my-gallery"
                  className="rounded-xl font-mono text-xs"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Page Type</label>
              <div className="grid grid-cols-2 gap-2">
                {(["gallery", "content"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => updateForm("type", t)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-medium transition-all ${
                      form.type === t ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-border/80 text-muted-foreground"
                    }`}
                  >
                    {t === "gallery" ? <Image className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                    {t === "gallery" ? "Photo Gallery" : "Content Page"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => updateForm("description", e.target.value)}
                placeholder="Short description..."
                rows={2}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Publish & Password */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <p className="font-semibold text-sm">Visibility</p>

            <button
              onClick={() => updateForm("isPublished", !form.isPublished)}
              className={`flex items-center gap-3 w-full p-3 rounded-xl border-2 text-sm transition-all ${
                form.isPublished ? "border-green-500 bg-green-500/5 text-green-500" : "border-border text-muted-foreground hover:border-muted-foreground"
              }`}
            >
              {form.isPublished ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              <span className="font-medium">{form.isPublished ? "Published" : "Draft (not visible)"}</span>
            </button>

            {!showPasswordField && !page?.hasPassword && (
              <button onClick={() => setShowPasswordField(true)} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Lock className="w-3.5 h-3.5" /> Add password protection
              </button>
            )}

            {(showPasswordField || page?.hasPassword) && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground block">
                  {page?.hasPassword ? "Change Password" : "Set Password"}
                </label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => updateForm("password", e.target.value)}
                  placeholder={page?.hasPassword ? "Enter new password to change" : "Password"}
                  className="rounded-xl"
                />
                {page?.hasPassword && (
                  <button
                    onClick={() => { updateForm("clearPassword", true); setShowPasswordField(false); }}
                    className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-400 transition-colors"
                  >
                    <Unlock className="w-3 h-3" /> Remove password
                  </button>
                )}
              </div>
            )}
          </div>

          {/* SEO */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <p className="font-semibold text-sm">SEO</p>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Meta Title</label>
              <Input value={form.metaTitle} onChange={(e) => updateForm("metaTitle", e.target.value)} placeholder="Page title for search engines" className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Meta Description</label>
              <textarea
                value={form.metaDescription}
                onChange={(e) => updateForm("metaDescription", e.target.value)}
                placeholder="Description for search engines..."
                rows={2}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </div>

        {/* Right: Content */}
        <div className="lg:col-span-2 space-y-4">
          {isNew ? (
            <div className="bg-card border border-border rounded-2xl p-10 flex flex-col items-center justify-center text-center gap-3">
              <AlertCircle className="w-8 h-8 text-muted-foreground" />
              <p className="font-medium">Save the page first</p>
              <p className="text-sm text-muted-foreground">Create the page to start adding content</p>
            </div>
          ) : form.type === "content" ? (
            /* Content Editor */
            <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
              <p className="font-semibold text-sm">Page Content</p>
              <p className="text-xs text-muted-foreground">You can use HTML for formatting</p>
              <textarea
                value={form.content}
                onChange={(e) => updateForm("content", e.target.value)}
                placeholder="<h1>Welcome</h1><p>Your content here...</p>"
                rows={18}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          ) : (
            /* Gallery Editor */
            <div className="space-y-4">
              {/* Folders list */}
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">Folders</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{folders.length} folder{folders.length !== 1 ? "s" : ""}</p>
                  </div>
                </div>

                {/* Add folder */}
                <div className="px-5 py-3 border-b border-border bg-muted/20">
                  <div className="flex gap-2">
                    <Input
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && createFolder()}
                      placeholder="New folder name..."
                      className="rounded-xl text-sm"
                    />
                    <Button onClick={createFolder} disabled={addingFolder || !newFolderName.trim()} className="rounded-xl gap-2 shrink-0">
                      {addingFolder ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      Add
                    </Button>
                  </div>
                </div>

                {folders.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No folders yet — create one above
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {folders.map((folder) => (
                      <div
                        key={folder.id}
                        onClick={() => setSelectedFolder(folder)}
                        className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors hover:bg-secondary/20 ${
                          selectedFolder?.id === folder.id ? "bg-primary/5" : ""
                        }`}
                      >
                        {folder.cover_image_url ? (
                          <img src={folder.cover_image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            <FolderOpen className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{folder.name}</p>
                          <p className="text-xs text-muted-foreground">{folder.images.length} image{folder.images.length !== 1 ? "s" : ""}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingFolder({ id: folder.id, name: folder.name, description: folder.description ?? "" }); }}
                            className="p-1.5 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteFolder(folder.id); }}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${selectedFolder?.id === folder.id ? "text-primary rotate-90" : ""}`} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Images panel */}
              <AnimatePresence mode="wait">
                {selectedFolder && (
                  <motion.div
                    key={selectedFolder.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="bg-card border border-border rounded-2xl overflow-hidden"
                  >
                    <div className="px-5 py-4 border-b border-border space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm">{selectedFolder.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {currentImages.length + pendingPreviews.filter(p => p.folderId === selectedFolder.id).length} image{(currentImages.length + pendingPreviews.filter(p => p.folderId === selectedFolder.id).length) !== 1 ? "s" : ""}
                            {pendingPreviews.filter(p => p.folderId === selectedFolder.id).length > 0 && (
                              <span className="ml-1 text-primary">
                                ({pendingPreviews.filter(p => p.folderId === selectedFolder.id).length} uploading…)
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(e) => e.target.files && uploadImages(e.target.files, selectedFolder.id)}
                          />
                          <Button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="gap-2 rounded-xl"
                            size="sm"
                          >
                            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            {uploading ? "Uploading..." : "Upload Images"}
                          </Button>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={uploadCaption}
                        onChange={e => setUploadCaption(e.target.value)}
                        placeholder="Caption for uploaded images (optional)"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 transition"
                      />
                    </div>

                    {/* Drop zone */}
                    <div
                      className={`p-5 transition-colors ${dragOver ? "bg-primary/5" : ""}`}
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(false);
                        if (e.dataTransfer.files.length) uploadImages(e.dataTransfer.files, selectedFolder.id);
                      }}
                    >
                      {(() => {
                        const folderPending = pendingPreviews.filter(p => p.folderId === selectedFolder.id);
                        const hasContent = currentImages.length > 0 || folderPending.length > 0;
                        return !hasContent ? (
                          <div className="border-2 border-dashed border-border rounded-xl py-12 flex flex-col items-center gap-3 text-muted-foreground">
                            <Upload className="w-8 h-8 opacity-50" />
                            <p className="text-sm font-medium">Drop images here or click Upload</p>
                            <p className="text-xs">Supports JPG, PNG, WebP up to 10MB each</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                            {currentImages.map((img, idx) => {
                              const isEditingThis = editingCaption?.imageId === img.id;
                              return (
                                <div key={img.id} className="group relative rounded-xl overflow-hidden bg-muted">
                                  {/* Image */}
                                  <div className="aspect-square">
                                    <img
                                      src={img.url}
                                      alt={img.caption ?? ""}
                                      className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                      <button
                                        onClick={() => setLightbox({ images: currentImages, index: idx })}
                                        className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
                                      >
                                        <ZoomIn className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => setCoverImage(selectedFolder.id, img.url)}
                                        className={`p-1.5 rounded-lg transition-colors ${
                                          selectedFolder.cover_image_url === img.url
                                            ? "bg-yellow-400 text-black"
                                            : "bg-white/20 hover:bg-white/30 text-white"
                                        }`}
                                        title="Set as cover"
                                      >
                                        <Star className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => setEditingCaption({ imageId: img.id, folderId: selectedFolder.id, value: img.caption ?? "" })}
                                        className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
                                        title="Edit caption"
                                      >
                                        <Pencil className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => deleteImage(selectedFolder.id, img.id)}
                                        className="p-1.5 rounded-lg bg-red-500/80 hover:bg-red-500 text-white transition-colors"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                    {selectedFolder.cover_image_url === img.url && (
                                      <div className="absolute top-1.5 left-1.5 bg-yellow-400 text-black text-[9px] font-bold px-1 rounded">
                                        COVER
                                      </div>
                                    )}
                                  </div>

                                  {/* Caption row */}
                                  {isEditingThis ? (
                                    <div className="flex items-center gap-1 px-1.5 py-1.5 bg-background/95 border-t border-border">
                                      <input
                                        autoFocus
                                        type="text"
                                        value={editingCaption!.value}
                                        onChange={e => setEditingCaption(prev => prev ? { ...prev, value: e.target.value } : null)}
                                        onKeyDown={e => { if (e.key === "Enter") saveCaption(); if (e.key === "Escape") setEditingCaption(null); }}
                                        placeholder="Add caption…"
                                        className="flex-1 min-w-0 text-[11px] bg-transparent outline-none border-none placeholder:text-muted-foreground/50"
                                      />
                                      <button onClick={saveCaption} className="p-1 rounded text-primary hover:bg-primary/10 transition-colors flex-shrink-0">
                                        <Check className="w-3 h-3" />
                                      </button>
                                      <button onClick={() => setEditingCaption(null)} className="p-1 rounded text-muted-foreground hover:bg-muted transition-colors flex-shrink-0">
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ) : (
                                    <div
                                      className="flex items-center gap-1 px-2 py-1 min-h-[26px] cursor-pointer hover:bg-muted/50 transition-colors"
                                      onClick={() => setEditingCaption({ imageId: img.id, folderId: selectedFolder.id, value: img.caption ?? "" })}
                                      title="Click to edit caption"
                                    >
                                      {img.caption ? (
                                        <p className="text-[11px] text-muted-foreground truncate flex-1">{img.caption}</p>
                                      ) : (
                                        <p className="text-[11px] text-muted-foreground/40 italic flex-1">Add caption…</p>
                                      )}
                                      <Pencil className="w-2.5 h-2.5 text-muted-foreground/30 flex-shrink-0" />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {/* Pending upload previews */}
                            {folderPending.map((p) => (
                              <div key={p.tempId} className="relative aspect-square rounded-xl overflow-hidden bg-muted">
                                <img
                                  src={p.localUrl}
                                  alt=""
                                  className="w-full h-full object-cover blur-[2px] scale-105 brightness-75"
                                />
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                                  <Loader2 className="w-6 h-6 text-white animate-spin drop-shadow" />
                                  <span className="text-white text-[10px] font-semibold drop-shadow">Uploading…</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Edit folder modal */}
      <AnimatePresence>
        {editingFolder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setEditingFolder(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-md space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold">Edit Folder</p>
                <button onClick={() => setEditingFolder(null)} className="p-1.5 rounded-lg hover:bg-secondary/50 text-muted-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Folder Name</label>
                  <Input
                    value={editingFolder.name}
                    onChange={(e) => setEditingFolder(prev => prev ? { ...prev, name: e.target.value } : null)}
                    className="rounded-xl"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
                  <textarea
                    value={editingFolder.description}
                    onChange={(e) => setEditingFolder(prev => prev ? { ...prev, description: e.target.value } : null)}
                    rows={2}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditingFolder(null)} className="flex-1 rounded-xl">Cancel</Button>
                <Button onClick={updateFolder} className="flex-1 rounded-xl gap-2">
                  <Check className="w-4 h-4" /> Save
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center"
            onClick={() => setLightbox(null)}
          >
            <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 p-2 text-white/70 hover:text-white">
              <X className="w-6 h-6" />
            </button>
            {lightbox.index > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setLightbox(prev => prev ? { ...prev, index: prev.index - 1 } : null); }}
                className="absolute left-4 p-3 text-white/70 hover:text-white bg-white/10 rounded-full"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            <img
              src={lightbox.images[lightbox.index].url}
              alt=""
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl"
              onClick={(e) => e.stopPropagation()}
            />
            {lightbox.index < lightbox.images.length - 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); setLightbox(prev => prev ? { ...prev, index: prev.index + 1 } : null); }}
                className="absolute right-4 p-3 text-white/70 hover:text-white bg-white/10 rounded-full"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
            <div className="absolute bottom-4 text-white/60 text-sm">
              {lightbox.index + 1} / {lightbox.images.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
