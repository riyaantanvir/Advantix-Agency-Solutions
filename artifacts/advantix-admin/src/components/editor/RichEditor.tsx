import { useEditor, EditorContent, type Editor, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import BaseImage from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import CharacterCount from "@tiptap/extension-character-count";
import { TextStyle } from "@tiptap/extension-text-style";
import { useCallback, useEffect, useRef, useState } from "react";
import { NodeViewProps } from "@tiptap/react";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Quote, Code, Minus,
  Heading1, Heading2, Heading3, Link2, ImageIcon,
  Highlighter, Undo, Redo, X, Upload, Loader2,
  Code2, Eye, EyeOff, FileText,
} from "lucide-react";

interface RichEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ── Upload helper ───────────────────────────────────────────────────────── */
async function uploadImageFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("image", file);
  const res = await fetch(`/api/admin/blog/upload-image`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!res.ok) throw new Error("Upload failed");
  const data = await res.json() as { url: string };
  return data.url;
}

/* ── Resizable Image NodeView ────────────────────────────────────────────── */
const SIZE_PRESETS = [
  { label: "25%", value: "25%" },
  { label: "50%", value: "50%" },
  { label: "75%", value: "75%" },
  { label: "100%", value: "100%" },
  { label: "Auto", value: "" },
];

function ResizableImageView({ node, selected, updateAttributes }: NodeViewProps) {
  const { src, alt, width } = node.attrs as { src: string; alt?: string; width: string };

  return (
    <NodeViewWrapper className="relative inline-block my-4 max-w-full" data-drag-handle="">
      <div className="relative group">
        <img
          src={src}
          alt={alt ?? ""}
          draggable={false}
          className="rounded-lg block mx-auto"
          style={{
            width: width || "auto",
            maxWidth: "100%",
            outline: selected ? "2px solid hsl(var(--primary))" : "none",
            outlineOffset: "2px",
          }}
        />

        {selected && (
          <div
            className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-card/95 backdrop-blur-sm border border-border rounded-lg px-2 py-1 shadow-lg z-20"
            onMouseDown={(e) => e.preventDefault()}
          >
            <span className="text-xs text-muted-foreground mr-1 whitespace-nowrap">Image size:</span>
            {SIZE_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => updateAttributes({ width: p.value })}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                  (width || "") === p.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary hover:bg-secondary/80 text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

/* ── Custom Image extension with width attribute ─────────────────────────── */
const ResizableImage = BaseImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: "",
        parseHTML: (el) => el.style.width || el.getAttribute("width") || "",
        renderHTML: (attrs) =>
          attrs.width ? { style: `width: ${attrs.width}; max-width: 100%;` } : {},
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});

/* ── Toolbar helpers ─────────────────────────────────────────────────────── */
function ToolbarButton({
  onClick, active, title, disabled, children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      disabled={disabled}
      className={`p-1.5 rounded transition-colors text-sm ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary"
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-border mx-0.5 self-center" />;
}

/* ── Image Dialog ────────────────────────────────────────────────────────── */
function ImageDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [tab, setTab] = useState<"url" | "upload">("url");
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function insertUrl() {
    if (!url.trim()) { setError("Please enter an image URL"); return; }
    editor.chain().focus().setImage({ src: url.trim() }).run();
    onClose();
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const imageUrl = await uploadImageFile(file);
      editor.chain().focus().setImage({ src: imageUrl }).run();
      onClose();
    } catch {
      setError("Upload failed. Try using a URL instead.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card border border-border rounded-xl w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Insert Image</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded"><X size={16} /></button>
        </div>

        <div className="flex border-b border-border">
          {(["url", "upload"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); setError(""); }}
              className={`flex-1 py-2.5 text-sm font-medium capitalize transition-colors ${tab === t ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t === "url" ? "Image URL" : "Upload File"}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-4">
          {tab === "url" ? (
            <>
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Image URL</label>
                <input
                  autoFocus
                  type="url"
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); insertUrl(); } }}
                  placeholder="https://example.com/image.jpg"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              {url && (
                <div className="rounded-lg overflow-hidden border border-border bg-secondary/30 aspect-video flex items-center justify-center">
                  <img src={url} alt="Preview" className="max-h-full max-w-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                </div>
              )}
            </>
          ) : (
            <>
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/60 hover:bg-primary/5 transition-colors"
              >
                <Upload size={24} className="mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Click to select an image file</p>
                <p className="text-xs text-muted-foreground/60 mt-1">JPG, PNG, GIF, WebP (max 10MB)</p>
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              Cancel
            </button>
            {tab === "url" ? (
              <button type="button" onClick={insertUrl} className="flex-1 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium">
                Insert Image
              </button>
            ) : (
              <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="flex-1 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium disabled:opacity-60">
                {uploading ? "Uploading..." : "Choose File"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Link Dialog ─────────────────────────────────────────────────────────── */
function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [href, setHref] = useState(editor.getAttributes("link").href ?? "");
  const [newTab, setNewTab] = useState(true);

  function apply() {
    if (!href.trim()) {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().setLink({ href: href.trim(), target: newTab ? "_blank" : null }).run();
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card border border-border rounded-xl w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Insert Link</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          <input
            autoFocus
            type="url"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } }}
            placeholder="https://example.com"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={newTab} onChange={(e) => setNewTab(e.target.checked)} className="rounded" />
            Open in new tab
          </label>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
            <button type="button" onClick={apply} className="flex-1 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium">Apply</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Paste-uploading toast ───────────────────────────────────────────────── */
function PasteOverlay({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-sm text-foreground pointer-events-none">
      <Loader2 size={14} className="animate-spin text-primary" />
      Uploading pasted image…
    </div>
  );
}

/* ── HTML Preview Panel ──────────────────────────────────────────────────── */
function HtmlPreview({ html, minHeight }: { html: string; minHeight: number }) {
  return (
    <div
      className="prose prose-invert max-w-none px-6 py-5 overflow-auto
        prose-headings:font-bold
        prose-a:text-primary prose-a:no-underline hover:prose-a:underline
        prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground
        prose-code:bg-secondary prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-primary prose-code:before:content-none prose-code:after:content-none
        prose-pre:bg-secondary prose-pre:border prose-pre:border-border
        prose-img:rounded-xl prose-img:my-6
        prose-strong:text-foreground
        prose-li:text-muted-foreground
        prose-p:text-muted-foreground prose-p:leading-relaxed"
      style={{ minHeight }}
      dangerouslySetInnerHTML={{ __html: html || "<p class='text-muted-foreground/40 italic'>Nothing to preview yet…</p>" }}
    />
  );
}

/* ── Main Editor ─────────────────────────────────────────────────────────── */
export default function RichEditor({ content, onChange, placeholder, minHeight = 400 }: RichEditorProps) {
  const [mode, setMode] = useState<"visual" | "html">("visual");
  const [showPreview, setShowPreview] = useState(false);
  const [htmlDraft, setHtmlDraft] = useState(content);
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [pasteUploading, setPasteUploading] = useState(false);
  const htmlTextareaRef = useRef<HTMLTextAreaElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        dropcursor: { color: "hsl(var(--primary))" },
        link: false,
        underline: false,
      }),
      Underline,
      TextStyle,
      Highlight.configure({ multicolor: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer" } }),
      ResizableImage.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: placeholder ?? "Start writing your blog post… (paste images directly!)" }),
      CharacterCount,
    ],
    content,
    editorProps: {
      attributes: {
        class: "prose prose-invert max-w-none focus:outline-none px-6 py-5",
        style: `min-height: ${minHeight}px`,
      },
    },
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, false);
    }
  }, [content]);

  /* Keep htmlDraft in sync when visual editor changes */
  useEffect(() => {
    if (mode === "visual") {
      setHtmlDraft(content);
    }
  }, [content, mode]);

  /* ── Mode switching ──────────────────────────────────────────────────── */
  function switchToHtml() {
    if (!editor) return;
    setHtmlDraft(editor.getHTML());
    setMode("html");
    setShowPreview(false);
  }

  function switchToVisual() {
    if (!editor) return;
    editor.commands.setContent(htmlDraft, false);
    onChange(htmlDraft);
    setMode("visual");
    setShowPreview(false);
  }

  function handleHtmlChange(val: string) {
    setHtmlDraft(val);
    onChange(val);
  }

  /* ── Attach paste/drop listener directly to the editor DOM ─── */
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;

    async function processImageFile(file: File) {
      setPasteUploading(true);
      try {
        const url = await uploadImageFile(file);
        editor.chain().focus().setImage({ src: url }).run();
      } catch {
        /* silent */
      } finally {
        setPasteUploading(false);
      }
    }

    function onPaste(e: ClipboardEvent) {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItem = items.find((i) => i.type.startsWith("image/"));
      if (!imageItem) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const file = imageItem.getAsFile();
      if (file) processImageFile(file);
    }

    function onDrop(e: DragEvent) {
      const files = Array.from(e.dataTransfer?.files ?? []);
      const imageFile = files.find((f) => f.type.startsWith("image/"));
      if (!imageFile) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      processImageFile(imageFile);
    }

    dom.addEventListener("paste", onPaste, true);
    dom.addEventListener("drop", onDrop, true);
    return () => {
      dom.removeEventListener("paste", onPaste, true);
      dom.removeEventListener("drop", onDrop, true);
    };
  }, [editor]);

  if (!editor) return null;

  const words = editor.storage.characterCount?.words?.() ?? 0;
  const chars = editor.storage.characterCount?.characters?.() ?? 0;

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card relative">

      {/* ── Mode Toggle Bar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-secondary/30">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={switchToVisual}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              mode === "visual"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
          >
            <FileText size={12} />
            Visual
          </button>
          <button
            type="button"
            onClick={switchToHtml}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              mode === "html"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
          >
            <Code2 size={12} />
            HTML
          </button>
        </div>

        {/* Preview toggle — only visible in HTML mode */}
        {mode === "html" && (
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              showPreview
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
          >
            {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
            {showPreview ? "Hide Preview" : "Preview"}
          </button>
        )}
      </div>

      {/* ── Visual Mode: Toolbar ─────────────────────────────────────────── */}
      {mode === "visual" && (
        <div className="flex flex-wrap items-center gap-0.5 p-2 border-b border-border bg-secondary/20 sticky top-0 z-10">
          <ToolbarButton title="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
            <Undo size={15} />
          </ToolbarButton>
          <ToolbarButton title="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
            <Redo size={15} />
          </ToolbarButton>

          <Divider />

          <ToolbarButton title="Heading 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
            <Heading1 size={15} />
          </ToolbarButton>
          <ToolbarButton title="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <Heading2 size={15} />
          </ToolbarButton>
          <ToolbarButton title="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            <Heading3 size={15} />
          </ToolbarButton>

          <Divider />

          <ToolbarButton title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold size={15} />
          </ToolbarButton>
          <ToolbarButton title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic size={15} />
          </ToolbarButton>
          <ToolbarButton title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <UnderlineIcon size={15} />
          </ToolbarButton>
          <ToolbarButton title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <Strikethrough size={15} />
          </ToolbarButton>
          <ToolbarButton title="Highlight" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()}>
            <Highlighter size={15} />
          </ToolbarButton>
          <ToolbarButton title="Inline code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
            <Code size={15} />
          </ToolbarButton>

          <Divider />

          <ToolbarButton title="Align left" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
            <AlignLeft size={15} />
          </ToolbarButton>
          <ToolbarButton title="Align center" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
            <AlignCenter size={15} />
          </ToolbarButton>
          <ToolbarButton title="Align right" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
            <AlignRight size={15} />
          </ToolbarButton>
          <ToolbarButton title="Justify" active={editor.isActive({ textAlign: "justify" })} onClick={() => editor.chain().focus().setTextAlign("justify").run()}>
            <AlignJustify size={15} />
          </ToolbarButton>

          <Divider />

          <ToolbarButton title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List size={15} />
          </ToolbarButton>
          <ToolbarButton title="Ordered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered size={15} />
          </ToolbarButton>
          <ToolbarButton title="Blockquote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            <Quote size={15} />
          </ToolbarButton>
          <ToolbarButton title="Code block" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
            <Code size={15} className="opacity-70" />
          </ToolbarButton>
          <ToolbarButton title="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
            <Minus size={15} />
          </ToolbarButton>

          <Divider />

          <ToolbarButton title="Insert link" active={editor.isActive("link")} onClick={() => setShowLinkDialog(true)}>
            <Link2 size={15} />
          </ToolbarButton>
          <ToolbarButton title="Insert image" onClick={() => setShowImageDialog(true)}>
            <ImageIcon size={15} />
          </ToolbarButton>
        </div>
      )}

      {/* ── Visual Mode: Editor area ─────────────────────────────────────── */}
      {mode === "visual" && (
        <>
          <EditorContent editor={editor} />
          <PasteOverlay show={pasteUploading} />
        </>
      )}

      {/* ── HTML Mode: Editor + optional preview ────────────────────────── */}
      {mode === "html" && (
        <div className={showPreview ? "grid grid-cols-2 divide-x divide-border" : ""}>
          {/* Raw HTML textarea */}
          <div className="relative">
            <div className="absolute top-2 left-3 text-[10px] font-mono text-muted-foreground/50 pointer-events-none select-none z-10">
              HTML source
            </div>
            <textarea
              ref={htmlTextareaRef}
              value={htmlDraft}
              onChange={(e) => handleHtmlChange(e.target.value)}
              spellCheck={false}
              className="w-full bg-[#0d1117] text-[#e6edf3] font-mono text-sm px-4 pt-7 pb-4 resize-none focus:outline-none leading-relaxed"
              style={{ minHeight: minHeight, tabSize: 2 }}
              onKeyDown={(e) => {
                if (e.key === "Tab") {
                  e.preventDefault();
                  const el = e.currentTarget;
                  const start = el.selectionStart;
                  const end = el.selectionEnd;
                  const newVal = el.value.substring(0, start) + "  " + el.value.substring(end);
                  handleHtmlChange(newVal);
                  requestAnimationFrame(() => {
                    el.selectionStart = el.selectionEnd = start + 2;
                  });
                }
              }}
            />
          </div>

          {/* Live preview panel */}
          {showPreview && (
            <div className="overflow-auto bg-card/50">
              <div className="px-3 py-2 border-b border-border bg-secondary/20 text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider">
                Preview
              </div>
              <HtmlPreview html={htmlDraft} minHeight={minHeight} />
            </div>
          )}
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-secondary/10 text-xs text-muted-foreground">
        {mode === "visual" ? (
          <>
            <span>{words} {words === 1 ? "word" : "words"} · {chars} characters</span>
            <span className="text-muted-foreground/60">Ctrl+B Bold · Ctrl+I Italic · Ctrl+Z Undo</span>
          </>
        ) : (
          <>
            <span>{htmlDraft.length} characters of HTML</span>
            <span className="text-muted-foreground/60">Tab key inserts 2 spaces</span>
          </>
        )}
      </div>

      {showImageDialog && editor && <ImageDialog editor={editor} onClose={() => setShowImageDialog(false)} />}
      {showLinkDialog && editor && <LinkDialog editor={editor} onClose={() => setShowLinkDialog(false)} />}
    </div>
  );
}
