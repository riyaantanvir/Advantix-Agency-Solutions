import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Bug, ImagePlus, Trash2, Send, CheckCircle2, Loader2, ClipboardPaste } from "lucide-react";

interface BugReportModalProps {
  open: boolean;
  onClose: () => void;
}

export function BugReportModal({ open, onClose }: BugReportModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [reporterEmail, setReporterEmail] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setTitle(""); setDescription(""); setReporterName(""); setReporterEmail("");
    setScreenshot(null); setSubmitting(false); setSuccess(false); setDragOver(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const readImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = e => setScreenshot(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readImageFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) readImageFile(file);
  };

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find(i => i.type.startsWith("image/"));
    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (file) readImageFile(file);
    }
  }, []);

  const handleGlobalPaste = useCallback((e: ClipboardEvent) => {
    if (!open) return;
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find(i => i.type.startsWith("image/"));
    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) readImageFile(file);
    }
  }, [open]);

  useState(() => {
    window.addEventListener("paste", handleGlobalPaste);
    return () => window.removeEventListener("paste", handleGlobalPaste);
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/bugs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          screenshot: screenshot || undefined,
          reporterName: reporterName.trim() || undefined,
          reporterEmail: reporterEmail.trim() || undefined,
          pageUrl: window.location.href,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setSuccess(true);
      setTimeout(() => handleClose(), 2500);
    } catch {
      alert("Failed to submit bug report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
            onPaste={handlePaste}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <Bug className="w-4 h-4 text-red-400" />
                </div>
                <div>
                  <h2 className="font-display font-bold text-foreground">Report a Bug</h2>
                  <p className="text-xs text-muted-foreground">Help us improve by reporting issues</p>
                </div>
              </div>
              <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            {success ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-7 h-7 text-green-400" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1">Bug Report Submitted!</h3>
                <p className="text-sm text-muted-foreground">Thank you for helping us improve. We'll look into it soon.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                {/* Title */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                    Bug Title <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Login button not working"
                    required
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                    Description <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Describe what happened, what you expected to happen, and how to reproduce it..."
                    required
                    rows={4}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none"
                  />
                </div>

                {/* Screenshot */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                    Screenshot <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  {screenshot ? (
                    <div className="relative">
                      <img src={screenshot} alt="Screenshot" className="w-full max-h-40 object-contain rounded-lg border border-border bg-muted/30" />
                      <button
                        type="button"
                        onClick={() => setScreenshot(null)}
                        className="absolute top-2 right-2 w-7 h-7 bg-destructive/80 hover:bg-destructive rounded-md flex items-center justify-center text-white transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`border-2 border-dashed rounded-lg p-5 text-center transition-colors cursor-pointer ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
                      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <ImagePlus className="w-5 h-5" />
                          <span className="text-sm">Drop image here or click to upload</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
                          <ClipboardPaste className="w-3.5 h-3.5" />
                          <span>Or press <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Ctrl+V</kbd> to paste screenshot</span>
                        </div>
                      </div>
                      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                    </div>
                  )}
                </div>

                {/* Reporter info */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Your Name</label>
                    <input
                      type="text"
                      value={reporterName}
                      onChange={e => setReporterName(e.target.value)}
                      placeholder="Optional"
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Your Email</label>
                    <input
                      type="email"
                      value={reporterEmail}
                      onChange={e => setReporterEmail(e.target.value)}
                      placeholder="Optional"
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                    />
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={submitting || !title.trim() || !description.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {submitting ? "Submitting..." : "Submit Bug Report"}
                </button>
              </form>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
