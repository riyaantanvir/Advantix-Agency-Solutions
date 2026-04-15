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
  return (
    <div
      className="bg-white rounded-2xl overflow-hidden shadow-2xl"
      style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif", minWidth: 480 }}
    >
      {/* Header — dark navy gradient */}
      <div
        style={{
          background: "linear-gradient(135deg, #06111f 0%, #0b1f3a 50%, #112754 100%)",
          padding: "36px 40px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Decorative circles */}
        <div style={{
          position: "absolute", top: -40, right: -40, width: 180, height: 180,
          borderRadius: "50%", background: "rgba(59,125,216,0.12)",
        }} />
        <div style={{
          position: "absolute", bottom: -30, left: 200, width: 120, height: 120,
          borderRadius: "50%", background: "rgba(59,125,216,0.08)",
        }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <img
              src="/admin/images/advantix-logo.png"
              alt="Advantix Digital"
              style={{ width: 60, height: 60, objectFit: "contain", borderRadius: 8 }}
            />
            <div>
              <div style={{ color: "#ffffff", fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px" }}>
                {fromName || "Advantix Digital"}
              </div>
              <div style={{ color: "#4d9de0", fontSize: 11, fontWeight: 600, letterSpacing: "2px", textTransform: "uppercase" }}>
                Digital Agency
              </div>
            </div>
          </div>

          {/* Invoice title + number */}
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#4d9de0", fontSize: 11, fontWeight: 600, letterSpacing: "3px", textTransform: "uppercase", marginBottom: 6 }}>
              {invoiceName || "Invoice"}
            </div>
            <div style={{ color: "#ffffff", fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px" }}>
              {invoiceNumber}
            </div>
          </div>
        </div>
      </div>

      {/* Blue accent stripe */}
      <div style={{ height: 4, background: "linear-gradient(90deg, #1a4fa0 0%, #3b7dd8 50%, #5ba3f5 100%)" }} />

      {/* Body */}
      <div style={{ padding: "32px 40px", background: "#ffffff" }}>

        {/* Date + Client row */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 32, gap: 24 }}>
          {/* Dates */}
          <div style={{ flex: 1 }}>
            <div style={{ background: "#f0f4ff", borderRadius: 12, padding: "16px 20px" }}>
              <div style={{ display: "flex", gap: 24 }}>
                <div>
                  <div style={{ color: "#6b7280", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>Issue Date</div>
                  <div style={{ color: "#0b1f3a", fontSize: 14, fontWeight: 600 }}>{invoiceDate || "—"}</div>
                </div>
                <div>
                  <div style={{ color: "#6b7280", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>Due Date</div>
                  <div style={{ color: "#c0392b", fontSize: 14, fontWeight: 700 }}>{dueDate || "—"}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Bill To */}
          <div style={{ flex: 1 }}>
            <div style={{ borderLeft: "3px solid #3b7dd8", paddingLeft: 16 }}>
              <div style={{ color: "#6b7280", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>Bill To</div>
              <div style={{ color: "#0b1f3a", fontSize: 15, fontWeight: 700 }}>{toName || "Client Name"}</div>
              {toCompany && <div style={{ color: "#3b7dd8", fontSize: 13, fontWeight: 600 }}>{toCompany}</div>}
              {toAddress && (
                <div style={{ color: "#6b7280", fontSize: 12, marginTop: 4, whiteSpace: "pre-line" }}>{toAddress}</div>
              )}
              {toEmail && <div style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>{toEmail}</div>}
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #e5e9f0", marginBottom: 24 }}>
          {/* Table Header */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr auto auto auto",
            background: "linear-gradient(135deg, #0b1f3a 0%, #1a4fa0 100%)",
            padding: "12px 20px", gap: 12,
          }}>
            {["Description", "Qty", "Rate", "Amount"].map((h, i) => (
              <div key={h} style={{
                color: "#a8c4e8", fontSize: 11, fontWeight: 600,
                textTransform: "uppercase", letterSpacing: "1px",
                textAlign: i === 0 ? "left" : "right",
                minWidth: i === 0 ? undefined : 70,
              }}>{h}</div>
            ))}
          </div>

          {/* Table Rows */}
          {items.map((item, idx) => (
            <div
              key={item.id}
              style={{
                display: "grid", gridTemplateColumns: "1fr auto auto auto",
                padding: "14px 20px", gap: 12,
                background: idx % 2 === 0 ? "#ffffff" : "#f7f9fd",
                borderTop: "1px solid #e5e9f0",
              }}
            >
              <div style={{ color: "#1a2744", fontSize: 13, fontWeight: 500 }}>
                {item.description || <span style={{ color: "#aaa" }}>—</span>}
              </div>
              <div style={{ color: "#6b7280", fontSize: 13, textAlign: "right", minWidth: 70 }}>{item.quantity}</div>
              <div style={{ color: "#6b7280", fontSize: 13, textAlign: "right", minWidth: 70, fontFamily: "monospace" }}>
                {sym}{(item.rate).toLocaleString()}
              </div>
              <div style={{ color: "#1a2744", fontSize: 13, fontWeight: 600, textAlign: "right", minWidth: 70, fontFamily: "monospace" }}>
                {sym}{(item.quantity * item.rate).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 28 }}>
          <div style={{ width: 280 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #e5e9f0" }}>
              <span style={{ color: "#6b7280", fontSize: 13 }}>Subtotal</span>
              <span style={{ color: "#1a2744", fontSize: 13, fontFamily: "monospace" }}>{sym}{fmt(subtotal)}</span>
            </div>
            {discountRate > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #e5e9f0" }}>
                <span style={{ color: "#6b7280", fontSize: 13 }}>Discount ({discountRate}%)</span>
                <span style={{ color: "#e74c3c", fontSize: 13, fontFamily: "monospace" }}>−{sym}{fmt(discountAmt)}</span>
              </div>
            )}
            {taxRate > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #e5e9f0" }}>
                <span style={{ color: "#6b7280", fontSize: 13 }}>Tax ({taxRate}%)</span>
                <span style={{ color: "#1a2744", fontSize: 13, fontFamily: "monospace" }}>{sym}{fmt(taxAmt)}</span>
              </div>
            )}
            {/* Total */}
            <div style={{
              display: "flex", justifyContent: "space-between",
              padding: "14px 16px", marginTop: 8, borderRadius: 10,
              background: "linear-gradient(135deg, #0b1f3a 0%, #1a4fa0 100%)",
            }}>
              <span style={{ color: "#a8c4e8", fontSize: 14, fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px" }}>Total Due</span>
              <span style={{ color: "#ffffff", fontSize: 18, fontWeight: 800, fontFamily: "monospace" }}>
                {sym}{fmt(total)}
              </span>
            </div>
            <div style={{ textAlign: "right", marginTop: 4 }}>
              <span style={{ color: "#9ca3af", fontSize: 10 }}>{currency}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {notes && (
          <div style={{
            background: "#f0f4ff", borderRadius: 10, padding: "16px 20px",
            borderLeft: "4px solid #3b7dd8", marginBottom: 24,
          }}>
            <div style={{ color: "#3b7dd8", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 6 }}>Notes</div>
            <div style={{ color: "#4b5563", fontSize: 12, lineHeight: 1.6 }}>{notes}</div>
          </div>
        )}

        {/* Footer */}
        <div style={{
          borderTop: "1px solid #e5e9f0", paddingTop: 20,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", gap: 20 }}>
            {fromEmail && <span style={{ color: "#9ca3af", fontSize: 11 }}>{fromEmail}</span>}
            {fromPhone && <span style={{ color: "#9ca3af", fontSize: 11 }}>{fromPhone}</span>}
          </div>
          <div style={{ color: "#d1d5db", fontSize: 10, textAlign: "right" }}>
            Generated by Advantix Finance
          </div>
        </div>
      </div>
    </div>
  );
}
