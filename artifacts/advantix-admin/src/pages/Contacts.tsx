import { useState, useRef } from "react";
import { useListContacts, useUpdateContact, useDeleteContact } from "@workspace/api-client-react";
import type { Contact } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Check, Trash2, Search, Mail, ArrowUpDown, ArrowUp, ArrowDown,
  Download, Upload, Loader2, AlertCircle, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

type SortKey = "createdAt" | "name" | "email" | "service" | "replied";
type SortDir = "asc" | "desc";

function SortIcon({ column, sortKey, sortDir }: { column: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (column !== sortKey) return <ArrowUpDown className="w-3.5 h-3.5 ml-1 opacity-40" />;
  return sortDir === "asc"
    ? <ArrowUp className="w-3.5 h-3.5 ml-1 text-primary" />
    : <ArrowDown className="w-3.5 h-3.5 ml-1 text-primary" />;
}

/* ── CSV helpers ──────────────────────────────────────────── */
const CSV_COLUMNS = ["name", "email", "phone", "whatsapp", "service", "budget", "message", "replied", "date"] as const;

function escapeCsv(val: string | null | undefined): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function contactsToCsv(contacts: Contact[]): string {
  const header = CSV_COLUMNS.join(",");
  const rows = contacts.map(c =>
    [
      c.name,
      c.email,
      c.phone ?? "",
      c.whatsapp ?? "",
      c.service ?? "",
      c.budget ?? "",
      c.message,
      c.replied ? "true" : "false",
      format(new Date(c.createdAt), "yyyy-MM-dd"),
    ]
      .map(escapeCsv)
      .join(",")
  );
  return [header, ...rows].join("\r\n");
}

function parseCsvToRows(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/[^a-z]/g, ""));

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current); current = "";
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  };

  return lines.slice(1).map(line => {
    const values = parseRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (values[i] ?? "").trim(); });
    return obj;
  });
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ══════════════════════════════════════════════════════════ */
export default function Contacts() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  /* import state */
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
  const [importFilename, setImportFilename] = useState("");
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: contacts, isLoading } = useListContacts();
  const updateMutation = useUpdateContact();
  const deleteMutation = useDeleteContact();

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filteredContacts = (contacts ?? [])
    .filter(c =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === "createdAt") cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      else if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "email") cmp = a.email.localeCompare(b.email);
      else if (sortKey === "service") cmp = (a.service ?? "").localeCompare(b.service ?? "");
      else if (sortKey === "replied") cmp = Number(a.replied) - Number(b.replied);
      return sortDir === "asc" ? cmp : -cmp;
    });

  /* ── Export ── */
  const handleExport = () => {
    const all = contacts ?? [];
    if (all.length === 0) {
      toast({ variant: "destructive", title: "Nothing to export", description: "No contacts in the database." });
      return;
    }
    const csv = contactsToCsv(all);
    downloadCsv(csv, `contacts_${format(new Date(), "yyyyMMdd_HHmm")}.csv`);
    toast({ title: `Exported ${all.length} contacts`, description: "CSV file downloaded." });
  };

  /* ── Import file pick ── */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError("");
    setImportRows([]);
    setImportFilename(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCsvToRows(text);
      const valid = rows.filter(r => r.name && r.email && r.message);
      if (rows.length === 0) {
        setImportError("Could not parse the CSV file. Make sure it has at least a header row and one data row.");
        return;
      }
      if (valid.length === 0) {
        setImportError("No valid rows found. Each row needs: name, email, message.");
        return;
      }
      setImportRows(rows);
      setImportDialogOpen(true);
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  };

  /* ── Import submit ── */
  const handleImportConfirm = async () => {
    setImporting(true);
    try {
      const payload = importRows
        .filter(r => r.name && r.email && r.message)
        .map(r => ({
          name: r.name,
          email: r.email,
          phone: r.phone || undefined,
          whatsapp: r.whatsapp || undefined,
          service: r.service || undefined,
          budget: r.budget || undefined,
          message: r.message,
          replied: r.replied === "true",
        }));

      const res = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json() as { imported?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Import failed");

      await queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: `Imported ${data.imported} contacts`, description: "The contacts table has been updated." });
      setImportDialogOpen(false);
      setImportRows([]);
      setImportFilename("");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Import failed", description: err.message });
    } finally {
      setImporting(false);
    }
  };

  const handleMarkReplied = (id: number) => {
    updateMutation.mutate(
      { id, data: { replied: true } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
          toast({ title: "Status updated", description: "Contact marked as replied." });
        },
        onError: () => toast({ variant: "destructive", title: "Error", description: "Could not update status." }),
      }
    );
  };

  const handleDelete = (id: number) => {
    if (!confirm("Are you sure you want to delete this contact?")) return;
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
          toast({ title: "Contact deleted" });
          setSelectedContact(null);
        },
        onError: () => toast({ variant: "destructive", title: "Error", description: "Could not delete contact." }),
      }
    );
  };

  const thClass = "px-6 py-4 font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors";
  const validImportCount = importRows.filter(r => r.name && r.email && r.message).length;
  const skippedCount = importRows.length - validImportCount;

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Inbox</h1>
          <p className="text-muted-foreground mt-1">Manage contact form submissions.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Search */}
          <div className="relative flex-1 sm:w-56 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              className="pl-9 h-10 bg-card rounded-xl border-border/50"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Export */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2 h-10 border-border/60 hover:bg-secondary/60"
            onClick={handleExport}
            disabled={isLoading || (contacts ?? []).length === 0}
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export CSV</span>
            <span className="sm:hidden">Export</span>
          </Button>

          {/* Import */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2 h-10 border-border/60 hover:bg-secondary/60"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Import CSV</span>
            <span className="sm:hidden">Import</span>
          </Button>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />

          {importError && (
            <p className="text-xs text-destructive flex items-center gap-1 w-full sm:w-auto">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {importError}
            </p>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-secondary/30">
                <th className={thClass} onClick={() => toggleSort("createdAt")}>
                  <span className="flex items-center">Date <SortIcon column="createdAt" sortKey={sortKey} sortDir={sortDir} /></span>
                </th>
                <th className={thClass} onClick={() => toggleSort("name")}>
                  <span className="flex items-center">Name <SortIcon column="name" sortKey={sortKey} sortDir={sortDir} /></span>
                </th>
                <th className={thClass} onClick={() => toggleSort("email")}>
                  <span className="flex items-center">Email <SortIcon column="email" sortKey={sortKey} sortDir={sortDir} /></span>
                </th>
                <th className={thClass} onClick={() => toggleSort("service")}>
                  <span className="flex items-center">Service <SortIcon column="service" sortKey={sortKey} sortDir={sortDir} /></span>
                </th>
                <th className={thClass} onClick={() => toggleSort("replied")}>
                  <span className="flex items-center">Status <SortIcon column="replied" sortKey={sortKey} sortDir={sortDir} /></span>
                </th>
                <th className="px-6 py-4 font-semibold text-muted-foreground hidden lg:table-cell">Message</th>
                <th className="px-6 py-4 font-semibold text-muted-foreground text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="px-6 py-4"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-40" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-6 w-20 rounded-full" /></td>
                    <td className="px-6 py-4 hidden lg:table-cell"><Skeleton className="h-4 w-48" /></td>
                    <td className="px-6 py-4 text-right"><Skeleton className="h-8 w-8 inline-block rounded-lg" /></td>
                  </tr>
                ))
              ) : filteredContacts.length > 0 ? (
                filteredContacts.map((contact) => (
                  <tr key={contact.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                      {format(new Date(contact.createdAt), "MMM d, yyyy")}
                    </td>
                    <td className="px-6 py-4 font-medium text-foreground">{contact.name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{contact.email}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-secondary rounded-md text-xs font-medium">
                        {contact.service ?? "General"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {contact.replied ? (
                        <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">Replied</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">Pending</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 hidden lg:table-cell max-w-[200px]">
                      <p className="text-sm text-muted-foreground truncate">{contact.message}</p>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedContact(contact)} className="h-8 hover:bg-primary/20 hover:text-primary">
                        View
                      </Button>
                      {!contact.replied && (
                        <Button variant="ghost" size="icon" onClick={() => handleMarkReplied(contact.id)} title="Mark as replied" className="h-8 w-8 hover:bg-green-500/20 hover:text-green-500">
                          <Check className="w-4 h-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(contact.id)} title="Delete" className="h-8 w-8 hover:bg-destructive/20 hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <Mail className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground text-lg">No contacts found.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Contact detail dialog */}
      <Dialog open={!!selectedContact} onOpenChange={(open) => !open && setSelectedContact(null)}>
        <DialogContent className="sm:max-w-xl bg-card border-border/50">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display flex justify-between pr-6">
              Message from {selectedContact?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedContact?.createdAt && format(new Date(selectedContact.createdAt), "PPpp")}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-secondary/50 rounded-xl">
                <p className="text-xs text-muted-foreground mb-1">Email</p>
                <a href={`mailto:${selectedContact?.email}`} className="text-sm font-medium text-primary hover:underline">
                  {selectedContact?.email}
                </a>
              </div>
              <div className="p-3 bg-secondary/50 rounded-xl">
                <p className="text-xs text-muted-foreground mb-1">Phone</p>
                <p className="text-sm font-medium text-foreground">{selectedContact?.phone ?? "Not provided"}</p>
              </div>
              {selectedContact?.whatsapp && (
                <div className="p-3 bg-secondary/50 rounded-xl">
                  <p className="text-xs text-muted-foreground mb-1">WhatsApp</p>
                  <p className="text-sm font-medium text-foreground">{selectedContact.whatsapp}</p>
                </div>
              )}
              {selectedContact?.budget && (
                <div className="p-3 bg-secondary/50 rounded-xl">
                  <p className="text-xs text-muted-foreground mb-1">Budget</p>
                  <p className="text-sm font-medium text-foreground">{selectedContact.budget}</p>
                </div>
              )}
            </div>

            <div className="p-3 bg-secondary/50 rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Service of Interest</p>
              <p className="text-sm font-medium text-foreground">{selectedContact?.service ?? "General Inquiry"}</p>
            </div>

            {selectedContact?.details && (() => {
              try {
                const parsed = JSON.parse(selectedContact.details) as Record<string, string>;
                const entries = Object.entries(parsed).filter(([, v]) => v);
                if (entries.length === 0) return null;
                return (
                  <div className="p-3 bg-secondary/50 rounded-xl">
                    <p className="text-xs text-muted-foreground mb-2">Service-Specific Details</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {entries.map(([k, v]) => (
                        <div key={k}>
                          <p className="text-xs text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1")}</p>
                          <p className="text-sm font-medium text-foreground">{v}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              } catch {
                return (
                  <div className="p-3 bg-secondary/50 rounded-xl">
                    <p className="text-xs text-muted-foreground mb-1">Service Details</p>
                    <p className="text-sm font-medium text-foreground">{selectedContact.details}</p>
                  </div>
                );
              }
            })()}

            <div className="p-4 bg-secondary/30 rounded-xl border border-border/50 min-h-[120px]">
              <p className="text-xs text-muted-foreground mb-2">Message / Additional Notes</p>
              <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground">
                {selectedContact?.message}
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              {selectedContact && !selectedContact.replied && (
                <Button
                  onClick={() => handleMarkReplied(selectedContact.id)}
                  disabled={updateMutation.isPending}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <Check className="w-4 h-4 mr-2" /> Mark as Replied
                </Button>
              )}
              {selectedContact && (
                <Button variant="destructive" onClick={() => handleDelete(selectedContact.id)} disabled={deleteMutation.isPending}>
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import preview dialog */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => { if (!open) { setImportDialogOpen(false); setImportRows([]); setImportFilename(""); } }}>
        <DialogContent className="sm:max-w-lg bg-card border-border/50">
          <DialogHeader>
            <DialogTitle className="text-xl font-display flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" /> Import Preview
            </DialogTitle>
            <DialogDescription>
              Review before importing — this will add new contacts to the database.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-4">
            {/* File info */}
            <div className="flex items-center gap-3 p-3 bg-secondary/40 rounded-xl">
              <FileText className="w-8 h-8 text-primary/60 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{importFilename}</p>
                <p className="text-xs text-muted-foreground">{importRows.length} rows found in file</p>
              </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
                <p className="text-2xl font-bold text-green-500">{validImportCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Will be imported</p>
              </div>
              <div className={`p-3 rounded-xl border text-center ${skippedCount > 0 ? "bg-amber-500/10 border-amber-500/20" : "bg-secondary/40 border-border/30"}`}>
                <p className={`text-2xl font-bold ${skippedCount > 0 ? "text-amber-500" : "text-muted-foreground"}`}>{skippedCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Skipped (missing fields)</p>
              </div>
            </div>

            {/* Preview table */}
            {validImportCount > 0 && (
              <div className="rounded-xl border border-border/50 overflow-hidden max-h-52 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-secondary/40">
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Name</th>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Email</th>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground hidden sm:table-cell">Service</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.filter(r => r.name && r.email && r.message).slice(0, 10).map((r, i) => (
                      <tr key={i} className="border-t border-border/40 hover:bg-secondary/20">
                        <td className="px-3 py-2 font-medium truncate max-w-[120px]">{r.name}</td>
                        <td className="px-3 py-2 text-muted-foreground truncate max-w-[160px]">{r.email}</td>
                        <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">{r.service || "—"}</td>
                      </tr>
                    ))}
                    {validImportCount > 10 && (
                      <tr className="border-t border-border/40">
                        <td colSpan={3} className="px-3 py-2 text-center text-muted-foreground italic">
                          +{validImportCount - 10} more rows…
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Required columns: <strong>name</strong>, <strong>email</strong>, <strong>message</strong>. Optional: phone, whatsapp, service, budget, replied.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => { setImportDialogOpen(false); setImportRows([]); setImportFilename(""); }} disabled={importing}>
                Cancel
              </Button>
              <Button onClick={handleImportConfirm} disabled={importing || validImportCount === 0}>
                {importing
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing…</>
                  : <><Upload className="w-4 h-4 mr-2" /> Import {validImportCount} Contacts</>
                }
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
