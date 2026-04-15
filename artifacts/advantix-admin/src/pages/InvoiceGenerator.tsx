import { useState, useRef } from "react";
import { Plus, Trash2, Download, Printer, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
}

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

export default function InvoiceGenerator() {
  const printRef = useRef<HTMLDivElement>(null);
  const [showPreview, setShowPreview] = useState(true);

  const [invoiceName, setInvoiceName] = useState("Invoice");
  const [invoiceNumber, setInvoiceNumber] = useState("INV-001");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });

  const [fromName, setFromName] = useState("Advantix Digital");
  const [fromAddress, setFromAddress] = useState("123 Digital Street\nDhaka, Bangladesh");
  const [fromEmail, setFromEmail] = useState("info@advantix.digital");
  const [fromPhone, setFromPhone] = useState("+880 1800 000000");

  const [toName, setToName] = useState("");
  const [toCompany, setToCompany] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [toEmail, setToEmail] = useState("");

  const [items, setItems] = useState<LineItem[]>([
    { id: generateId(), description: "Web Design & Development", quantity: 1, rate: 50000 },
  ]);

  const [taxRate, setTaxRate] = useState(0);
  const [discountRate, setDiscountRate] = useState(0);
  const [notes, setNotes] = useState("Thank you for your business. Payment is due within 30 days.");
  const [currency, setCurrency] = useState("BDT");

  const currencySymbol: Record<string, string> = {
    BDT: "৳",
    USD: "$",
    EUR: "€",
    GBP: "£",
  };

  const sym = currencySymbol[currency] ?? "৳";

  const addItem = () => setItems(prev => [...prev, { id: generateId(), description: "", quantity: 1, rate: 0 }]);

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const updateItem = (id: string, field: keyof Omit<LineItem, "id">, value: string | number) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.rate, 0);
  const discountAmt = subtotal * (discountRate / 100);
  const taxAmt = (subtotal - discountAmt) * (taxRate / 100);
  const total = subtotal - discountAmt + taxAmt;

  const fmt = (n: number) => n.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handlePrint = () => {
    const style = document.createElement("style");
    style.innerHTML = `
      @media print {
        body * { visibility: hidden !important; }
        #invoice-print-area, #invoice-print-area * { visibility: visible !important; }
        #invoice-print-area { position: fixed !important; top: 0 !important; left: 0 !important; width: 100vw !important; background: white !important; }
      }
    `;
    document.head.appendChild(style);
    window.print();
    document.head.removeChild(style);
  };

  return (
    <div className="min-h-screen bg-[#080e1a] text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Invoice Generator</h1>
            <p className="text-slate-400 mt-1">Create professional invoices instantly</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => setShowPreview(v => !v)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800 gap-2"
            >
              {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showPreview ? "Hide" : "Show"} Preview
            </Button>
            <Button
              onClick={handlePrint}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
            >
              <Printer className="w-4 h-4" />
              Print / Save PDF
            </Button>
          </div>
        </div>

        <div className={`grid gap-8 ${showPreview ? "xl:grid-cols-2" : "grid-cols-1 max-w-3xl"}`}>

          {/* ── FORM ── */}
          <div className="space-y-6">

            {/* Invoice Identity */}
            <div className="bg-[#0d1526] border border-slate-700/50 rounded-2xl p-6 space-y-4">
              <h2 className="text-lg font-semibold text-blue-400 border-b border-slate-700 pb-3">Invoice Details</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-300 text-sm mb-1.5 block">Invoice Name</Label>
                  <Input
                    value={invoiceName}
                    onChange={e => setInvoiceName(e.target.value)}
                    placeholder="e.g. Web Design Invoice"
                    className="bg-[#111827] border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <Label className="text-slate-300 text-sm mb-1.5 block">Invoice Number</Label>
                  <Input
                    value={invoiceNumber}
                    onChange={e => setInvoiceNumber(e.target.value)}
                    className="bg-[#111827] border-slate-700 text-white focus:border-blue-500"
                  />
                </div>
                <div>
                  <Label className="text-slate-300 text-sm mb-1.5 block">Issue Date</Label>
                  <Input
                    type="date"
                    value={invoiceDate}
                    onChange={e => setInvoiceDate(e.target.value)}
                    className="bg-[#111827] border-slate-700 text-white focus:border-blue-500"
                  />
                </div>
                <div>
                  <Label className="text-slate-300 text-sm mb-1.5 block">Due Date</Label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="bg-[#111827] border-slate-700 text-white focus:border-blue-500"
                  />
                </div>
                <div>
                  <Label className="text-slate-300 text-sm mb-1.5 block">Currency</Label>
                  <select
                    value={currency}
                    onChange={e => setCurrency(e.target.value)}
                    className="w-full h-10 px-3 rounded-md bg-[#111827] border border-slate-700 text-white focus:outline-none focus:border-blue-500 text-sm"
                  >
                    <option value="BDT">BDT (৳)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* From */}
            <div className="bg-[#0d1526] border border-slate-700/50 rounded-2xl p-6 space-y-4">
              <h2 className="text-lg font-semibold text-blue-400 border-b border-slate-700 pb-3">From (Your Details)</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="text-slate-300 text-sm mb-1.5 block">Name / Company</Label>
                  <Input value={fromName} onChange={e => setFromName(e.target.value)} className="bg-[#111827] border-slate-700 text-white focus:border-blue-500" />
                </div>
                <div className="col-span-2">
                  <Label className="text-slate-300 text-sm mb-1.5 block">Address</Label>
                  <Textarea value={fromAddress} onChange={e => setFromAddress(e.target.value)} rows={2} className="bg-[#111827] border-slate-700 text-white focus:border-blue-500 resize-none" />
                </div>
                <div>
                  <Label className="text-slate-300 text-sm mb-1.5 block">Email</Label>
                  <Input value={fromEmail} onChange={e => setFromEmail(e.target.value)} className="bg-[#111827] border-slate-700 text-white focus:border-blue-500" />
                </div>
                <div>
                  <Label className="text-slate-300 text-sm mb-1.5 block">Phone</Label>
                  <Input value={fromPhone} onChange={e => setFromPhone(e.target.value)} className="bg-[#111827] border-slate-700 text-white focus:border-blue-500" />
                </div>
              </div>
            </div>

            {/* To */}
            <div className="bg-[#0d1526] border border-slate-700/50 rounded-2xl p-6 space-y-4">
              <h2 className="text-lg font-semibold text-blue-400 border-b border-slate-700 pb-3">Bill To (Client Details)</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-300 text-sm mb-1.5 block">Client Name</Label>
                  <Input value={toName} onChange={e => setToName(e.target.value)} placeholder="John Doe" className="bg-[#111827] border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500" />
                </div>
                <div>
                  <Label className="text-slate-300 text-sm mb-1.5 block">Company (optional)</Label>
                  <Input value={toCompany} onChange={e => setToCompany(e.target.value)} placeholder="Client Company" className="bg-[#111827] border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500" />
                </div>
                <div className="col-span-2">
                  <Label className="text-slate-300 text-sm mb-1.5 block">Address</Label>
                  <Textarea value={toAddress} onChange={e => setToAddress(e.target.value)} rows={2} placeholder="Client address..." className="bg-[#111827] border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500 resize-none" />
                </div>
                <div className="col-span-2">
                  <Label className="text-slate-300 text-sm mb-1.5 block">Email</Label>
                  <Input value={toEmail} onChange={e => setToEmail(e.target.value)} placeholder="client@email.com" className="bg-[#111827] border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500" />
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div className="bg-[#0d1526] border border-slate-700/50 rounded-2xl p-6 space-y-4">
              <h2 className="text-lg font-semibold text-blue-400 border-b border-slate-700 pb-3">Line Items</h2>
              <div className="space-y-3">
                {items.map((item) => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <Input
                        value={item.description}
                        onChange={e => updateItem(item.id, "description", e.target.value)}
                        placeholder="Description"
                        className="bg-[#111827] border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500 text-sm"
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        min={0}
                        value={item.quantity}
                        onChange={e => updateItem(item.id, "quantity", parseFloat(e.target.value) || 0)}
                        placeholder="Qty"
                        className="bg-[#111827] border-slate-700 text-white focus:border-blue-500 text-sm"
                      />
                    </div>
                    <div className="col-span-3">
                      <Input
                        type="number"
                        min={0}
                        value={item.rate}
                        onChange={e => updateItem(item.id, "rate", parseFloat(e.target.value) || 0)}
                        placeholder="Rate"
                        className="bg-[#111827] border-slate-700 text-white focus:border-blue-500 text-sm"
                      />
                    </div>
                    <div className="col-span-1 text-right text-sm text-slate-400 font-mono">
                      {fmt(item.quantity * item.rate)}
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <button onClick={() => removeItem(item.id)} className="text-slate-600 hover:text-red-500 transition-colors p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <Button onClick={addItem} variant="outline" size="sm" className="border-blue-600/50 text-blue-400 hover:bg-blue-600/10 gap-2 mt-2">
                <Plus className="w-4 h-4" /> Add Line Item
              </Button>
            </div>

            {/* Tax, Discount, Notes */}
            <div className="bg-[#0d1526] border border-slate-700/50 rounded-2xl p-6 space-y-4">
              <h2 className="text-lg font-semibold text-blue-400 border-b border-slate-700 pb-3">Summary & Notes</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-300 text-sm mb-1.5 block">Discount (%)</Label>
                  <Input type="number" min={0} max={100} value={discountRate} onChange={e => setDiscountRate(parseFloat(e.target.value) || 0)} className="bg-[#111827] border-slate-700 text-white focus:border-blue-500" />
                </div>
                <div>
                  <Label className="text-slate-300 text-sm mb-1.5 block">Tax (%)</Label>
                  <Input type="number" min={0} max={100} value={taxRate} onChange={e => setTaxRate(parseFloat(e.target.value) || 0)} className="bg-[#111827] border-slate-700 text-white focus:border-blue-500" />
                </div>
                <div className="col-span-2">
                  <Label className="text-slate-300 text-sm mb-1.5 block">Notes / Payment Instructions</Label>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="bg-[#111827] border-slate-700 text-white focus:border-blue-500 resize-none" />
                </div>
              </div>
            </div>
          </div>

          {/* ── INVOICE PREVIEW ── */}
          {showPreview && (
            <div className="xl:sticky xl:top-8 self-start">
              <div id="invoice-print-area" ref={printRef}>
                <InvoicePreview
                  invoiceName={invoiceName}
                  invoiceNumber={invoiceNumber}
                  invoiceDate={invoiceDate}
                  dueDate={dueDate}
                  fromName={fromName}
                  fromAddress={fromAddress}
                  fromEmail={fromEmail}
                  fromPhone={fromPhone}
                  toName={toName}
                  toCompany={toCompany}
                  toAddress={toAddress}
                  toEmail={toEmail}
                  items={items}
                  subtotal={subtotal}
                  discountAmt={discountAmt}
                  discountRate={discountRate}
                  taxAmt={taxAmt}
                  taxRate={taxRate}
                  total={total}
                  notes={notes}
                  sym={sym}
                  fmt={fmt}
                  currency={currency}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InvoicePreview({
  invoiceName, invoiceNumber, invoiceDate, dueDate,
  fromName, fromAddress, fromEmail, fromPhone,
  toName, toCompany, toAddress, toEmail,
  items, subtotal, discountAmt, discountRate, taxAmt, taxRate, total,
  notes, sym, fmt, currency,
}: {
  invoiceName: string; invoiceNumber: string; invoiceDate: string; dueDate: string;
  fromName: string; fromAddress: string; fromEmail: string; fromPhone: string;
  toName: string; toCompany: string; toAddress: string; toEmail: string;
  items: LineItem[]; subtotal: number; discountAmt: number; discountRate: number;
  taxAmt: number; taxRate: number; total: number;
  notes: string; sym: string; fmt: (n: number) => string; currency: string;
}) {
  const mono: React.CSSProperties = { fontFamily: "'Courier New', monospace" };
  const label: React.CSSProperties = { color: "#9ca3af", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: 4 };
  const divider: React.CSSProperties = { borderTop: "1px solid #f0f0f0", margin: "0" };

  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 4px 40px rgba(0,0,0,0.10)",
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        minWidth: 480,
        color: "#111827",
      }}
    >
      {/* Top accent line */}
      <div style={{ height: 3, background: "#1d4ed8" }} />

      {/* Header */}
      <div style={{ padding: "36px 44px 28px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        {/* Logo + from info */}
        <div>
          <img
            src="/admin/images/advantix-logo.png"
            alt="Advantix Digital"
            style={{ width: 44, height: 44, objectFit: "contain", marginBottom: 12 }}
          />
          <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{fromName || "Advantix Digital"}</div>
          {fromAddress && (
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2, whiteSpace: "pre-line", lineHeight: 1.6 }}>{fromAddress}</div>
          )}
          {fromEmail && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{fromEmail}</div>}
          {fromPhone && <div style={{ fontSize: 11, color: "#9ca3af" }}>{fromPhone}</div>}
        </div>

        {/* Invoice label + number */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "2px", marginBottom: 6 }}>
            {invoiceName || "Invoice"}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#111827", letterSpacing: "-0.5px" }}>{invoiceNumber}</div>
        </div>
      </div>

      <div style={divider} />

      {/* Meta row: dates + bill to */}
      <div style={{ padding: "24px 44px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 32 }}>
        <div>
          <div style={label}>Issue Date</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{invoiceDate || "—"}</div>
        </div>
        <div>
          <div style={label}>Due Date</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#dc2626" }}>{dueDate || "—"}</div>
        </div>
        <div>
          <div style={label}>Bill To</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{toName || "—"}</div>
          {toCompany && <div style={{ fontSize: 12, color: "#6b7280" }}>{toCompany}</div>}
          {toAddress && <div style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "pre-line", lineHeight: 1.5, marginTop: 2 }}>{toAddress}</div>}
          {toEmail && <div style={{ fontSize: 11, color: "#9ca3af" }}>{toEmail}</div>}
        </div>
      </div>

      <div style={divider} />

      {/* Table */}
      <div style={{ padding: "0 44px" }}>
        {/* Table header */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 60px 100px 100px",
          padding: "12px 0", gap: 12,
          borderBottom: "1px solid #e5e7eb",
        }}>
          {["Description", "Qty", "Rate", "Amount"].map((h, i) => (
            <div key={h} style={{ ...label, marginBottom: 0, textAlign: i === 0 ? "left" : "right" }}>{h}</div>
          ))}
        </div>

        {/* Rows */}
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              display: "grid", gridTemplateColumns: "1fr 60px 100px 100px",
              padding: "13px 0", gap: 12,
              borderBottom: "1px solid #f3f4f6",
            }}
          >
            <div style={{ fontSize: 13, color: "#374151" }}>{item.description || "—"}</div>
            <div style={{ ...mono, fontSize: 12, color: "#6b7280", textAlign: "right" }}>{item.quantity}</div>
            <div style={{ ...mono, fontSize: 12, color: "#6b7280", textAlign: "right" }}>{sym}{item.rate.toLocaleString()}</div>
            <div style={{ ...mono, fontSize: 13, fontWeight: 600, color: "#111827", textAlign: "right" }}>
              {sym}{(item.quantity * item.rate).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div style={{ padding: "20px 44px 0", display: "flex", justifyContent: "flex-end" }}>
        <div style={{ width: 240 }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0" }}>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>Subtotal</span>
            <span style={{ ...mono, fontSize: 12, color: "#374151" }}>{sym}{fmt(subtotal)}</span>
          </div>
          {discountRate > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0" }}>
              <span style={{ fontSize: 12, color: "#9ca3af" }}>Discount ({discountRate}%)</span>
              <span style={{ ...mono, fontSize: 12, color: "#dc2626" }}>−{sym}{fmt(discountAmt)}</span>
            </div>
          )}
          {taxRate > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0" }}>
              <span style={{ fontSize: 12, color: "#9ca3af" }}>Tax ({taxRate}%)</span>
              <span style={{ ...mono, fontSize: 12, color: "#374151" }}>{sym}{fmt(taxAmt)}</span>
            </div>
          )}
          <div style={{ borderTop: "1.5px solid #111827", marginTop: 8, paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#111827", textTransform: "uppercase", letterSpacing: "0.5px" }}>Total</span>
            <span style={{ ...mono, fontSize: 20, fontWeight: 700, color: "#1d4ed8" }}>{sym}{fmt(total)}</span>
          </div>
          <div style={{ textAlign: "right", marginTop: 2 }}>
            <span style={{ fontSize: 10, color: "#d1d5db" }}>{currency}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {notes && (
        <div style={{ padding: "24px 44px 0" }}>
          <div style={label}>Notes</div>
          <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.7 }}>{notes}</div>
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: "24px 44px 32px", marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 16 }}>
          {fromEmail && <span style={{ fontSize: 10, color: "#d1d5db" }}>{fromEmail}</span>}
          {fromPhone && <span style={{ fontSize: 10, color: "#d1d5db" }}>{fromPhone}</span>}
        </div>
        <span style={{ fontSize: 10, color: "#e5e7eb" }}>Advantix Finance</span>
      </div>
    </div>
  );
}
