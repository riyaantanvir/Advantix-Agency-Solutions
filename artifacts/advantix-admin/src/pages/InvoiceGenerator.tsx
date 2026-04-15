import { useState } from "react";
import {
  Plus, Trash2, Printer, Eye, EyeOff, LayoutTemplate,
  FileText, ArrowLeft, Save, Download, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/* ─── Types ────────────────────────────────────────────────────────────────── */
interface LineItem { id: string; description: string; quantity: number; rate: number; }

interface SavedInvoice {
  id: string; createdAt: string; template: string;
  invoiceName: string; invoiceNumber: string; invoiceDate: string; dueDate: string;
  fromName: string; fromAddress: string; fromEmail: string; fromPhone: string;
  toName: string; toCompany: string; toAddress: string; toEmail: string;
  items: LineItem[]; taxRate: number; discountRate: number; notes: string;
  currency: string; total: number;
}

interface InvoiceData {
  invoiceName: string; invoiceNumber: string; invoiceDate: string; dueDate: string;
  fromName: string; fromAddress: string; fromEmail: string; fromPhone: string;
  toName: string; toCompany: string; toAddress: string; toEmail: string;
  items: LineItem[];
  subtotal: number; discountAmt: number; discountRate: number;
  taxAmt: number; taxRate: number; total: number;
  notes: string; sym: string; fmt: (n: number) => string; currency: string;
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
function gid() { return Math.random().toString(36).slice(2, 9); }
const STORAGE_KEY = "advantix-invoices";
const CURRENCY_SYM: Record<string, string> = { BDT: "৳", USD: "$", EUR: "€", GBP: "£" };
const fmt = (n: number) => n.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function loadInvoices(): SavedInvoice[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}
function saveInvoices(list: SavedInvoice[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

const TEMPLATES = [
  { id: "minimal", label: "Minimal", desc: "Clean & modern" },
  { id: "bold",    label: "Bold",    desc: "Dark header" },
  { id: "classic", label: "Classic", desc: "Traditional" },
  { id: "elegant", label: "Elegant", desc: "Side accent" },
];

const inputCls = "bg-[#111827] border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500";
const selectCls = "w-full h-10 px-3 rounded-md bg-[#111827] border border-slate-700 text-white focus:outline-none focus:border-blue-500 text-sm";

/* ════════════════════════════════════════════════════════════
   MAIN PAGE — manages list vs editor view
══════════════════════════════════════════════════════════════ */
export default function InvoiceGenerator() {
  const [view, setView] = useState<"list" | "editor">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<SavedInvoice[]>(loadInvoices);

  const openNew = () => { setEditingId(null); setView("editor"); };
  const openEdit = (id: string) => { setEditingId(id); setView("editor"); };
  const backToList = () => { setView("list"); setEditingId(null); };

  const handleSave = (inv: SavedInvoice) => {
    setInvoices(prev => {
      const exists = prev.find(i => i.id === inv.id);
      const next = exists ? prev.map(i => i.id === inv.id ? inv : i) : [inv, ...prev];
      saveInvoices(next);
      return next;
    });
    backToList();
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this invoice?")) return;
    setInvoices(prev => { const next = prev.filter(i => i.id !== id); saveInvoices(next); return next; });
  };

  const handleDownload = (inv: SavedInvoice) => {
    const data = invoiceDataFromSaved(inv);
    const template = inv.template;
    const previewId = `pdf-preview-${inv.id}`;
    const container = document.createElement("div");
    container.id = previewId;
    container.style.position = "absolute";
    container.style.left = "-9999px";
    document.body.appendChild(container);

    import("react-dom/client").then(({ createRoot }) => {
      const root = createRoot(container);
      root.render(getTemplateComponent(template, data));
      setTimeout(() => {
        const html = container.innerHTML;
        root.unmount();
        document.body.removeChild(container);
        openPdfWindow(html, inv.invoiceName, inv.invoiceNumber);
      }, 300);
    });
  };

  if (view === "editor") {
    const existing = editingId ? invoices.find(i => i.id === editingId) : undefined;
    return <InvoiceEditor existing={existing} onSave={handleSave} onBack={backToList} />;
  }

  return <InvoiceList invoices={invoices} onNew={openNew} onEdit={openEdit} onDelete={handleDelete} onDownload={handleDownload} />;
}

/* ════════════════════════════════════════════════════════════
   LIST VIEW
══════════════════════════════════════════════════════════════ */
function InvoiceList({ invoices, onNew, onEdit, onDelete, onDownload }: {
  invoices: SavedInvoice[];
  onNew: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onDownload: (inv: SavedInvoice) => void;
}) {
  return (
    <div className="min-h-screen bg-[#080e1a] text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Invoice Generator</h1>
            <p className="text-slate-400 mt-1">{invoices.length} saved invoice{invoices.length !== 1 ? "s" : ""}</p>
          </div>
          <Button onClick={onNew} className="bg-blue-600 hover:bg-blue-700 text-white gap-2 px-5">
            <Plus className="w-4 h-4" /> Generate Invoice
          </Button>
        </div>

        {invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 gap-5 text-center">
            <div className="w-20 h-20 rounded-2xl bg-[#0d1526] border border-slate-700/50 flex items-center justify-center">
              <FileText className="w-9 h-9 text-slate-600" />
            </div>
            <div>
              <p className="text-slate-300 font-medium text-lg">No invoices yet</p>
              <p className="text-slate-500 text-sm mt-1">Click "Generate Invoice" to create your first one</p>
            </div>
            <Button onClick={onNew} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
              <Plus className="w-4 h-4" /> Generate Invoice
            </Button>
          </div>
        ) : (
          <div className="bg-[#0d1526] border border-slate-700/50 rounded-2xl overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-12 px-6 py-3 bg-[#0a1020] border-b border-slate-700/50 text-xs font-semibold text-slate-500 uppercase tracking-widest">
              <div className="col-span-3">Invoice</div>
              <div className="col-span-2">Number</div>
              <div className="col-span-2">Client</div>
              <div className="col-span-2">Date</div>
              <div className="col-span-1 text-right">Total</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>
            {invoices.map((inv, idx) => (
              <div
                key={inv.id}
                className={`grid grid-cols-12 px-6 py-4 items-center gap-2 hover:bg-[#111827] transition-colors cursor-pointer ${
                  idx < invoices.length - 1 ? "border-b border-slate-700/30" : ""
                }`}
                onClick={() => onEdit(inv.id)}
              >
                {/* Invoice name */}
                <div className="col-span-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-600/10 border border-blue-600/20 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm truncate">{inv.invoiceName}</p>
                    <p className="text-slate-500 text-xs capitalize">{inv.template} template</p>
                  </div>
                </div>
                {/* Number */}
                <div className="col-span-2">
                  <span className="text-slate-300 text-sm font-mono">{inv.invoiceNumber}</span>
                </div>
                {/* Client */}
                <div className="col-span-2">
                  <p className="text-slate-300 text-sm truncate">{inv.toName || <span className="text-slate-600">—</span>}</p>
                  {inv.toCompany && <p className="text-slate-500 text-xs truncate">{inv.toCompany}</p>}
                </div>
                {/* Date */}
                <div className="col-span-2">
                  <p className="text-slate-300 text-sm">{inv.invoiceDate}</p>
                  <p className="text-red-400/70 text-xs">Due {inv.dueDate}</p>
                </div>
                {/* Total */}
                <div className="col-span-1 text-right">
                  <span className="text-white font-semibold text-sm font-mono">
                    {CURRENCY_SYM[inv.currency] ?? "৳"}{fmt(inv.total)}
                  </span>
                </div>
                {/* Actions */}
                <div className="col-span-2 flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => onEdit(inv.id)}
                    title="Edit"
                    className="p-2 text-slate-500 hover:text-blue-400 hover:bg-blue-600/10 rounded-lg transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDownload(inv)}
                    title="Download PDF"
                    className="p-2 text-slate-500 hover:text-emerald-400 hover:bg-emerald-600/10 rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDelete(inv.id)}
                    title="Delete"
                    className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-600/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   EDITOR VIEW
══════════════════════════════════════════════════════════════ */
function InvoiceEditor({ existing, onSave, onBack }: {
  existing?: SavedInvoice;
  onSave: (inv: SavedInvoice) => void;
  onBack: () => void;
}) {
  const [showPreview, setShowPreview] = useState(true);
  const [template, setTemplate] = useState(existing?.template ?? "minimal");

  const [invoiceName, setInvoiceName]     = useState(existing?.invoiceName     ?? "Invoice");
  const [invoiceNumber, setInvoiceNumber] = useState(existing?.invoiceNumber   ?? "INV-001");
  const [invoiceDate, setInvoiceDate]     = useState(existing?.invoiceDate     ?? new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate]             = useState(existing?.dueDate         ?? (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); })());
  const [fromName, setFromName]           = useState(existing?.fromName        ?? "Advantix Digital");
  const [fromAddress, setFromAddress]     = useState(existing?.fromAddress     ?? "123 Digital Street\nDhaka, Bangladesh");
  const [fromEmail, setFromEmail]         = useState(existing?.fromEmail       ?? "info@advantix.digital");
  const [fromPhone, setFromPhone]         = useState(existing?.fromPhone       ?? "+880 1800 000000");
  const [toName, setToName]               = useState(existing?.toName         ?? "");
  const [toCompany, setToCompany]         = useState(existing?.toCompany      ?? "");
  const [toAddress, setToAddress]         = useState(existing?.toAddress      ?? "");
  const [toEmail, setToEmail]             = useState(existing?.toEmail        ?? "");
  const [items, setItems]                 = useState<LineItem[]>(existing?.items ?? [{ id: gid(), description: "Web Design & Development", quantity: 1, rate: 50000 }]);
  const [taxRate, setTaxRate]             = useState(existing?.taxRate        ?? 0);
  const [discountRate, setDiscountRate]   = useState(existing?.discountRate   ?? 0);
  const [notes, setNotes]                 = useState(existing?.notes          ?? "Thank you for your business. Payment is due within 30 days.");
  const [currency, setCurrency]           = useState(existing?.currency       ?? "BDT");

  const sym = CURRENCY_SYM[currency] ?? "৳";
  const addItem    = () => setItems(p => [...p, { id: gid(), description: "", quantity: 1, rate: 0 }]);
  const removeItem = (id: string) => setItems(p => p.filter(i => i.id !== id));
  const updateItem = (id: string, f: keyof Omit<LineItem, "id">, v: string | number) =>
    setItems(p => p.map(i => i.id === id ? { ...i, [f]: v } : i));

  const subtotal    = items.reduce((s, i) => s + i.quantity * i.rate, 0);
  const discountAmt = subtotal * (discountRate / 100);
  const taxAmt      = (subtotal - discountAmt) * (taxRate / 100);
  const total       = subtotal - discountAmt + taxAmt;

  const invoiceData: InvoiceData = {
    invoiceName, invoiceNumber, invoiceDate, dueDate,
    fromName, fromAddress, fromEmail, fromPhone,
    toName, toCompany, toAddress, toEmail,
    items, subtotal, discountAmt, discountRate, taxAmt, taxRate, total,
    notes, sym, fmt, currency,
  };

  const handleSave = () => {
    const inv: SavedInvoice = {
      id: existing?.id ?? gid(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      template,
      invoiceName, invoiceNumber, invoiceDate, dueDate,
      fromName, fromAddress, fromEmail, fromPhone,
      toName, toCompany, toAddress, toEmail,
      items, taxRate, discountRate, notes, currency, total,
    };
    onSave(inv);
  };

  const handleDownloadPDF = () => {
    const el = document.getElementById("invoice-print-area");
    if (!el) return;
    openPdfWindow(el.innerHTML, invoiceName, invoiceNumber);
  };

  return (
    <div className="min-h-screen bg-[#080e1a] text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">{existing ? "Edit Invoice" : "New Invoice"}</h1>
              <p className="text-slate-400 text-sm mt-0.5">Fill in details, preview on the right</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setShowPreview(v => !v)} className="border-slate-700 text-slate-300 hover:bg-slate-800 gap-2">
              {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showPreview ? "Hide" : "Show"} Preview
            </Button>
            <Button onClick={handleDownloadPDF} variant="outline" className="border-emerald-600/50 text-emerald-400 hover:bg-emerald-600/10 gap-2">
              <Printer className="w-4 h-4" /> Download PDF
            </Button>
            <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
              <Save className="w-4 h-4" /> Save Invoice
            </Button>
          </div>
        </div>

        {/* Template picker */}
        <div className="mb-6 flex gap-2 flex-wrap">
          <span className="flex items-center text-xs text-slate-500 mr-1 gap-1.5"><LayoutTemplate className="w-3.5 h-3.5" /> Template:</span>
          {TEMPLATES.map(t => (
            <button key={t.id} onClick={() => setTemplate(t.id)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${template === t.id ? "bg-blue-600 border-blue-500 text-white" : "bg-[#0d1526] border-slate-700 text-slate-400 hover:border-blue-600/50"}`}>
              {t.label} <span className={`ml-1 ${template === t.id ? "text-blue-200" : "text-slate-600"}`}>{t.desc}</span>
            </button>
          ))}
        </div>

        <div className={`grid gap-8 ${showPreview ? "xl:grid-cols-2" : "grid-cols-1 max-w-3xl"}`}>
          {/* FORM */}
          <div className="space-y-5">
            <FormSection title="Invoice Details">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Invoice Name" col={2}>
                  <Input value={invoiceName} onChange={e => setInvoiceName(e.target.value)} placeholder="e.g. Web Design Invoice" className={inputCls} />
                </Field>
                <Field label="Invoice Number">
                  <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Currency">
                  <select value={currency} onChange={e => setCurrency(e.target.value)} className={selectCls}>
                    <option value="BDT">BDT (৳)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </Field>
                <Field label="Issue Date">
                  <Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Due Date">
                  <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
                </Field>
              </div>
            </FormSection>

            <FormSection title="From (Your Details)">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Name / Company" col={2}>
                  <Input value={fromName} onChange={e => setFromName(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Address" col={2}>
                  <Textarea value={fromAddress} onChange={e => setFromAddress(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
                </Field>
                <Field label="Email">
                  <Input value={fromEmail} onChange={e => setFromEmail(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Phone">
                  <Input value={fromPhone} onChange={e => setFromPhone(e.target.value)} className={inputCls} />
                </Field>
              </div>
            </FormSection>

            <FormSection title="Bill To (Client Details)">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Client Name">
                  <Input value={toName} onChange={e => setToName(e.target.value)} placeholder="John Doe" className={inputCls} />
                </Field>
                <Field label="Company">
                  <Input value={toCompany} onChange={e => setToCompany(e.target.value)} placeholder="Optional" className={inputCls} />
                </Field>
                <Field label="Address" col={2}>
                  <Textarea value={toAddress} onChange={e => setToAddress(e.target.value)} rows={2} placeholder="Client address..." className={`${inputCls} resize-none`} />
                </Field>
                <Field label="Email" col={2}>
                  <Input value={toEmail} onChange={e => setToEmail(e.target.value)} placeholder="client@email.com" className={inputCls} />
                </Field>
              </div>
            </FormSection>

            <FormSection title="Line Items">
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 px-1">
                  {["Description", "Qty", "Rate", "Total", ""].map((h, i) => (
                    <div key={i} className={`text-xs text-slate-500 font-medium ${i === 0 ? "col-span-5" : i === 4 ? "col-span-1" : "col-span-2 text-right"}`}>{h}</div>
                  ))}
                </div>
                {items.map(item => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <Input value={item.description} onChange={e => updateItem(item.id, "description", e.target.value)} placeholder="Description" className={`${inputCls} text-sm`} />
                    </div>
                    <div className="col-span-2">
                      <Input type="number" min={0} value={item.quantity} onChange={e => updateItem(item.id, "quantity", parseFloat(e.target.value) || 0)} className={`${inputCls} text-sm text-right`} />
                    </div>
                    <div className="col-span-2">
                      <Input type="number" min={0} value={item.rate} onChange={e => updateItem(item.id, "rate", parseFloat(e.target.value) || 0)} className={`${inputCls} text-sm text-right`} />
                    </div>
                    <div className="col-span-2 text-right text-sm text-slate-400 font-mono pr-1">
                      {fmt(item.quantity * item.rate)}
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <button onClick={() => removeItem(item.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <Button onClick={addItem} variant="outline" size="sm" className="border-blue-600/40 text-blue-400 hover:bg-blue-600/10 gap-2 mt-1">
                <Plus className="w-3.5 h-3.5" /> Add Line Item
              </Button>
            </FormSection>

            <FormSection title="Summary & Notes">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Discount (%)">
                  <Input type="number" min={0} max={100} value={discountRate} onChange={e => setDiscountRate(parseFloat(e.target.value) || 0)} className={inputCls} />
                </Field>
                <Field label="Tax (%)">
                  <Input type="number" min={0} max={100} value={taxRate} onChange={e => setTaxRate(parseFloat(e.target.value) || 0)} className={inputCls} />
                </Field>
                <Field label="Notes / Payment Instructions" col={2}>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={`${inputCls} resize-none`} />
                </Field>
              </div>
            </FormSection>

            {/* Bottom save button */}
            <div className="flex justify-end gap-3 pt-2 pb-8">
              <Button onClick={onBack} variant="outline" className="border-slate-700 text-slate-400 hover:bg-slate-800">Cancel</Button>
              <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white gap-2 px-6">
                <Save className="w-4 h-4" /> Save Invoice
              </Button>
            </div>
          </div>

          {/* PREVIEW */}
          {showPreview && (
            <div className="xl:sticky xl:top-8 self-start pb-8">
              <div id="invoice-print-area">
                {template === "minimal" && <TemplateMinimal  data={invoiceData} />}
                {template === "bold"    && <TemplateBold     data={invoiceData} />}
                {template === "classic" && <TemplateClassic  data={invoiceData} />}
                {template === "elegant" && <TemplateElegant  data={invoiceData} />}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── PDF helper ──────────────────────────────────────────────────────────── */
function openPdfWindow(html: string, invoiceName: string, invoiceNumber: string) {
  const win = window.open("", "_blank", "width=900,height=1200");
  if (!win) { alert("Please allow popups to download PDF."); return; }
  win.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<title>${invoiceName} – ${invoiceNumber}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:#fff;font-family:'Segoe UI',system-ui,sans-serif}
@page{size:A4;margin:0}
@media print{html,body{width:210mm}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body>${html}</body></html>`);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); win.close(); }, 400);
}

/* ─── Convert saved invoice → InvoiceData ─────────────────────────────────── */
function invoiceDataFromSaved(inv: SavedInvoice): InvoiceData {
  const sym = CURRENCY_SYM[inv.currency] ?? "৳";
  const subtotal    = inv.items.reduce((s, i) => s + i.quantity * i.rate, 0);
  const discountAmt = subtotal * (inv.discountRate / 100);
  const taxAmt      = (subtotal - discountAmt) * (inv.taxRate / 100);
  const total       = subtotal - discountAmt + taxAmt;
  return { ...inv, subtotal, discountAmt, taxAmt, total, sym, fmt };
}

/* ─── Get template component as element ───────────────────────────────────── */
function getTemplateComponent(template: string, data: InvoiceData) {
  if (template === "bold")    return <TemplateBold    data={data} />;
  if (template === "classic") return <TemplateClassic data={data} />;
  if (template === "elegant") return <TemplateElegant data={data} />;
  return <TemplateMinimal data={data} />;
}

/* ─── Form helpers ────────────────────────────────────────────────────────── */
function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#0d1526] border border-slate-700/50 rounded-2xl p-5 space-y-4">
      <h2 className="text-xs font-semibold text-blue-400 uppercase tracking-widest">{title}</h2>
      {children}
    </div>
  );
}
function Field({ label, children, col }: { label: string; children: React.ReactNode; col?: number }) {
  return (
    <div className={col === 2 ? "col-span-2" : ""}>
      <Label className="text-slate-400 text-xs mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   SHARED TEMPLATE HELPERS
══════════════════════════════════════════════════════════════ */
const mono: React.CSSProperties = { fontFamily: "'Courier New', monospace" };

function TotalsBlock({ data, accentColor }: { data: InvoiceData; accentColor: string }) {
  const { subtotal, discountAmt, discountRate, taxAmt, taxRate, total, sym, fmt: f, currency } = data;
  return (
    <div style={{ width: 240 }}>
      {[
        { label: "Subtotal", value: `${sym}${f(subtotal)}`, color: "#374151" },
        discountRate > 0 ? { label: `Discount (${discountRate}%)`, value: `−${sym}${f(discountAmt)}`, color: "#dc2626" } : null,
        taxRate > 0     ? { label: `Tax (${taxRate}%)`,           value: `${sym}${f(taxAmt)}`,       color: "#374151" } : null,
      ].filter(Boolean).map((row, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f3f4f6" }}>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>{row!.label}</span>
          <span style={{ ...mono, fontSize: 12, color: row!.color }}>{row!.value}</span>
        </div>
      ))}
      <div style={{ borderTop: `2px solid ${accentColor}`, marginTop: 8, paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#111827", textTransform: "uppercase", letterSpacing: "0.5px" }}>Total</span>
        <span style={{ ...mono, fontSize: 20, fontWeight: 800, color: accentColor }}>{sym}{f(total)}</span>
      </div>
      <div style={{ textAlign: "right", marginTop: 2 }}>
        <span style={{ fontSize: 9, color: "#d1d5db" }}>{currency}</span>
      </div>
    </div>
  );
}

function ItemsTable({ data, headerBg, headerColor }: { data: InvoiceData; headerBg: string; headerColor: string }) {
  const { items, sym } = data;
  const f2 = (n: number) => n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 52px 96px 96px", padding: "10px 16px", background: headerBg, gap: 8 }}>
        {["Description", "Qty", "Rate", "Amount"].map((h, i) => (
          <div key={h} style={{ fontSize: 10, fontWeight: 700, color: headerColor, textTransform: "uppercase", letterSpacing: "0.8px", textAlign: i === 0 ? "left" : "right" }}>{h}</div>
        ))}
      </div>
      {items.map((item, idx) => (
        <div key={item.id} style={{ display: "grid", gridTemplateColumns: "1fr 52px 96px 96px", padding: "11px 16px", gap: 8, background: idx % 2 === 0 ? "#ffffff" : "#f9fafb", borderBottom: "1px solid #f0f0f0" }}>
          <div style={{ fontSize: 12, color: "#374151" }}>{item.description || "—"}</div>
          <div style={{ ...mono, fontSize: 12, color: "#6b7280", textAlign: "right" }}>{item.quantity}</div>
          <div style={{ ...mono, fontSize: 12, color: "#6b7280", textAlign: "right" }}>{sym}{item.rate.toLocaleString()}</div>
          <div style={{ ...mono, fontSize: 12, fontWeight: 600, color: "#111827", textAlign: "right" }}>{sym}{f2(item.quantity * item.rate)}</div>
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   TEMPLATE 1 — MINIMAL
══════════════════════════════════════════════════════════════ */
function TemplateMinimal({ data }: { data: InvoiceData }) {
  const { invoiceName, invoiceNumber, invoiceDate, dueDate, fromName, fromAddress, fromEmail, fromPhone, toName, toCompany, toAddress, toEmail, notes } = data;
  const lbl: React.CSSProperties = { color: "#9ca3af", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: 4 };
  return (
    <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 32px rgba(0,0,0,0.09)", fontFamily: "'Segoe UI',system-ui,sans-serif", color: "#111827" }}>
      <div style={{ height: 3, background: "#1d4ed8" }} />
      <div style={{ padding: "32px 40px 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <img src="/admin/images/advantix-logo.png" alt="" style={{ width: 40, height: 40, objectFit: "contain", marginBottom: 10 }} />
          <div style={{ fontSize: 13, fontWeight: 600 }}>{fromName}</div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2, whiteSpace: "pre-line", lineHeight: 1.6 }}>{fromAddress}</div>
          {fromEmail && <div style={{ fontSize: 11, color: "#9ca3af" }}>{fromEmail}</div>}
          {fromPhone && <div style={{ fontSize: 11, color: "#9ca3af" }}>{fromPhone}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "2px", marginBottom: 4 }}>{invoiceName}</div>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.5px" }}>{invoiceNumber}</div>
        </div>
      </div>
      <div style={{ borderTop: "1px solid #f0f0f0" }} />
      <div style={{ padding: "20px 40px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
        <div><div style={lbl}>Issue Date</div><div style={{ fontSize: 13, fontWeight: 500 }}>{invoiceDate || "—"}</div></div>
        <div><div style={lbl}>Due Date</div><div style={{ fontSize: 13, fontWeight: 500, color: "#dc2626" }}>{dueDate || "—"}</div></div>
        <div>
          <div style={lbl}>Bill To</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{toName || "—"}</div>
          {toCompany && <div style={{ fontSize: 12, color: "#6b7280" }}>{toCompany}</div>}
          {toAddress && <div style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "pre-line", lineHeight: 1.5 }}>{toAddress}</div>}
          {toEmail && <div style={{ fontSize: 11, color: "#9ca3af" }}>{toEmail}</div>}
        </div>
      </div>
      <div style={{ borderTop: "1px solid #f0f0f0" }} />
      <ItemsTable data={data} headerBg="#f8faff" headerColor="#6b7280" />
      <div style={{ padding: "20px 40px", display: "flex", justifyContent: "flex-end" }}>
        <TotalsBlock data={data} accentColor="#1d4ed8" />
      </div>
      {notes && <div style={{ padding: "0 40px 20px" }}><div style={lbl}>Notes</div><div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.7 }}>{notes}</div></div>}
      <div style={{ padding: "16px 40px 28px", display: "flex", justifyContent: "space-between", borderTop: "1px solid #f9fafb", marginTop: 8 }}>
        <span style={{ fontSize: 10, color: "#e5e7eb" }}>{fromEmail}</span>
        <span style={{ fontSize: 10, color: "#e5e7eb" }}>Advantix Finance</span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   TEMPLATE 2 — BOLD
══════════════════════════════════════════════════════════════ */
function TemplateBold({ data }: { data: InvoiceData }) {
  const { invoiceName, invoiceNumber, invoiceDate, dueDate, fromName, fromAddress, fromEmail, fromPhone, toName, toCompany, toAddress, toEmail, notes } = data;
  return (
    <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 32px rgba(0,0,0,0.12)", fontFamily: "'Segoe UI',system-ui,sans-serif", color: "#111827" }}>
      <div style={{ background: "linear-gradient(135deg,#0a1628 0%,#0f2347 100%)", padding: "32px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img src="/admin/images/advantix-logo.png" alt="" style={{ width: 48, height: 48, objectFit: "contain", background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: 4 }} />
            <div>
              <div style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>{fromName}</div>
              <div style={{ color: "#4d9de0", fontSize: 10, fontWeight: 600, letterSpacing: "1.5px", textTransform: "uppercase" }}>Digital Agency</div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#4d9de0", fontSize: 10, letterSpacing: "3px", textTransform: "uppercase", marginBottom: 6 }}>{invoiceName}</div>
            <div style={{ color: "#fff", fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px" }}>{invoiceNumber}</div>
          </div>
        </div>
        <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
          <div>
            <div style={{ color: "#4d9de0", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>From</div>
            <div style={{ color: "#e2e8f0", fontSize: 11, whiteSpace: "pre-line", lineHeight: 1.6 }}>{fromAddress}</div>
            <div style={{ color: "#94a3b8", fontSize: 11 }}>{fromEmail}</div>
          </div>
          <div>
            <div style={{ color: "#4d9de0", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>Issue / Due</div>
            <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 500 }}>{invoiceDate || "—"}</div>
            <div style={{ color: "#f87171", fontSize: 12, fontWeight: 600, marginTop: 2 }}>{dueDate || "—"}</div>
          </div>
          <div>
            <div style={{ color: "#4d9de0", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>Bill To</div>
            <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600 }}>{toName || "—"}</div>
            {toCompany && <div style={{ color: "#94a3b8", fontSize: 11 }}>{toCompany}</div>}
            {toEmail && <div style={{ color: "#94a3b8", fontSize: 11 }}>{toEmail}</div>}
          </div>
        </div>
      </div>
      <div style={{ height: 3, background: "linear-gradient(90deg,#1a4fa0,#3b7dd8,#5ba3f5)" }} />
      <ItemsTable data={data} headerBg="#0f2347" headerColor="#4d9de0" />
      <div style={{ padding: "20px 40px", display: "flex", justifyContent: "flex-end" }}>
        <TotalsBlock data={data} accentColor="#1d4ed8" />
      </div>
      {notes && <div style={{ padding: "0 40px 20px" }}><div style={{ color: "#9ca3af", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>Notes</div><div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.7 }}>{notes}</div></div>}
      <div style={{ background: "#f8faff", padding: "14px 40px", display: "flex", justifyContent: "space-between", borderTop: "1px solid #e5e7eb" }}>
        <span style={{ fontSize: 10, color: "#9ca3af" }}>{fromEmail} · {fromPhone}</span>
        <span style={{ fontSize: 10, color: "#c7d2fe", fontWeight: 600 }}>Advantix Finance</span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   TEMPLATE 3 — CLASSIC
══════════════════════════════════════════════════════════════ */
function TemplateClassic({ data }: { data: InvoiceData }) {
  const { invoiceName, invoiceNumber, invoiceDate, dueDate, fromName, fromAddress, fromEmail, fromPhone, toName, toCompany, toAddress, toEmail, notes } = data;
  return (
    <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 32px rgba(0,0,0,0.09)", fontFamily: "'Georgia','Times New Roman',serif", color: "#1a1a2e" }}>
      <div style={{ background: "#1a3a6b", padding: "28px 40px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <img src="/admin/images/advantix-logo.png" alt="" style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 6 }} />
            <div>
              <div style={{ color: "#fff", fontSize: 16, fontWeight: 700, fontFamily: "sans-serif" }}>{fromName}</div>
              {fromAddress && <div style={{ color: "#93c5fd", fontSize: 10, whiteSpace: "pre-line", lineHeight: 1.5, fontFamily: "sans-serif" }}>{fromAddress.split("\n")[0]}</div>}
            </div>
          </div>
          <div style={{ textAlign: "right", color: "#fff" }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1 }}>{(invoiceName || "INVOICE").toUpperCase()}</div>
            <div style={{ fontSize: 14, color: "#93c5fd", fontFamily: "sans-serif" }}>{invoiceNumber}</div>
          </div>
        </div>
      </div>
      <div style={{ height: 3, background: "#f59e0b" }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        <div style={{ padding: "20px 40px", borderRight: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: 9, color: "#9ca3af", fontFamily: "sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>Bill To</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1a3a6b" }}>{toName || "—"}</div>
          {toCompany && <div style={{ fontSize: 12, color: "#4b5563", fontFamily: "sans-serif" }}>{toCompany}</div>}
          {toAddress && <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "sans-serif", whiteSpace: "pre-line", lineHeight: 1.5, marginTop: 4 }}>{toAddress}</div>}
          {toEmail && <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "sans-serif" }}>{toEmail}</div>}
        </div>
        <div style={{ padding: "20px 40px" }}>
          {[["Invoice #", invoiceNumber], ["Issue Date", invoiceDate || "—"], ["Due Date", dueDate || "—"]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px dashed #e5e7eb" }}>
              <span style={{ fontSize: 11, color: "#9ca3af", fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.5px" }}>{k}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: k === "Due Date" ? "#dc2626" : "#1a1a2e", fontFamily: "sans-serif" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ borderTop: "1px solid #e5e7eb" }} />
      <ItemsTable data={data} headerBg="#1a3a6b" headerColor="#93c5fd" />
      <div style={{ padding: "20px 40px", display: "flex", justifyContent: "flex-end" }}>
        <TotalsBlock data={data} accentColor="#1a3a6b" />
      </div>
      {notes && <div style={{ padding: "0 40px 20px", fontFamily: "sans-serif" }}><div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>Notes</div><div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.7 }}>{notes}</div></div>}
      <div style={{ background: "#f8faff", padding: "14px 40px", display: "flex", justifyContent: "space-between", borderTop: "1px solid #e5e7eb", fontFamily: "sans-serif" }}>
        <span style={{ fontSize: 10, color: "#9ca3af" }}>{fromEmail} · {fromPhone}</span>
        <span style={{ fontSize: 10, color: "#9ca3af" }}>Advantix Finance</span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   TEMPLATE 4 — ELEGANT
══════════════════════════════════════════════════════════════ */
function TemplateElegant({ data }: { data: InvoiceData }) {
  const { invoiceName, invoiceNumber, invoiceDate, dueDate, fromName, fromAddress, fromEmail, fromPhone, toName, toCompany, toAddress, toEmail, notes } = data;
  return (
    <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 32px rgba(0,0,0,0.10)", fontFamily: "'Segoe UI',system-ui,sans-serif", color: "#111827", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr" }}>
        <div style={{ background: "#0f2347", padding: "32px 24px", display: "flex", flexDirection: "column", gap: 24 }}>
          <img src="/admin/images/advantix-logo.png" alt="" style={{ width: 48, height: 48, objectFit: "contain" }} />
          <div>
            <div style={{ color: "#4d9de0", fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: 6 }}>From</div>
            <div style={{ color: "#f0f4ff", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{fromName}</div>
            <div style={{ color: "#7da7d4", fontSize: 10, whiteSpace: "pre-line", lineHeight: 1.7 }}>{fromAddress}</div>
            {fromEmail && <div style={{ color: "#7da7d4", fontSize: 10, marginTop: 4 }}>{fromEmail}</div>}
            {fromPhone && <div style={{ color: "#7da7d4", fontSize: 10 }}>{fromPhone}</div>}
          </div>
          <div>
            <div style={{ color: "#4d9de0", fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: 6 }}>Bill To</div>
            <div style={{ color: "#f0f4ff", fontSize: 12, fontWeight: 600 }}>{toName || "—"}</div>
            {toCompany && <div style={{ color: "#7da7d4", fontSize: 10 }}>{toCompany}</div>}
            {toAddress && <div style={{ color: "#7da7d4", fontSize: 10, whiteSpace: "pre-line", lineHeight: 1.6, marginTop: 4 }}>{toAddress}</div>}
            {toEmail && <div style={{ color: "#7da7d4", fontSize: 10 }}>{toEmail}</div>}
          </div>
          <div>
            <div style={{ color: "#4d9de0", fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: 6 }}>Dates</div>
            <div style={{ color: "#7da7d4", fontSize: 10, marginBottom: 4 }}>Issued: <span style={{ color: "#e2e8f0" }}>{invoiceDate || "—"}</span></div>
            <div style={{ color: "#7da7d4", fontSize: 10 }}>Due: <span style={{ color: "#f87171", fontWeight: 600 }}>{dueDate || "—"}</span></div>
          </div>
        </div>
        <div style={{ background: "#fff", padding: "32px 32px 24px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "3px", marginBottom: 8 }}>{invoiceName}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#0f2347", letterSpacing: "-0.5px" }}>{invoiceNumber}</div>
          </div>
          <div style={{ width: 40, height: 3, background: "#1d4ed8", borderRadius: 2, marginTop: 24 }} />
        </div>
      </div>
      <ItemsTable data={data} headerBg="#0f2347" headerColor="#4d9de0" />
      <div style={{ padding: "20px 32px", display: "flex", justifyContent: "flex-end" }}>
        <TotalsBlock data={data} accentColor="#0f2347" />
      </div>
      {notes && <div style={{ padding: "0 32px 20px" }}><div style={{ color: "#9ca3af", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>Notes</div><div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.7 }}>{notes}</div></div>}
      <div style={{ background: "#f8faff", padding: "12px 32px", display: "flex", justifyContent: "flex-end", borderTop: "1px solid #e5e7eb" }}>
        <span style={{ fontSize: 10, color: "#c7d2fe", fontWeight: 600 }}>Advantix Finance</span>
      </div>
    </div>
  );
}
