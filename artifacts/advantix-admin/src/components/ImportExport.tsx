import { useRef, useState } from "react";
import { Download, Upload, FileJson, FileSpreadsheet, X, Check, AlertTriangle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface ColumnDef<T> {
  key: keyof T | string;
  label: string;
  /** For import: transform a string cell value into the right type */
  parse?: (val: string) => unknown;
  /** For export: format the value as a CSV cell */
  format?: (val: unknown) => string;
}

interface ImportExportProps<T extends Record<string, unknown>> {
  data: T[];
  columns: ColumnDef<T>[];
  entityName: string;
  /** Called with each parsed row — should call your create mutation */
  onImport: (rows: Partial<T>[]) => Promise<void>;
}

/* ─── CSV helpers ──────────────────────────────────────────────── */

function toCSV<T extends Record<string, unknown>>(
  rows: T[],
  cols: ColumnDef<T>[]
): string {
  const header = cols.map((c) => `"${c.label}"`).join(",");
  const lines = rows.map((row) =>
    cols
      .map((c) => {
        const raw = row[c.key as keyof T];
        const val = c.format ? c.format(raw) : String(raw ?? "");
        return `"${val.replace(/"/g, '""')}"`;
      })
      .join(",")
  );
  return [header, ...lines].join("\n");
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0]
    .split(",")
    .map((h) => h.replace(/^"|"$/g, "").trim());
  return lines.slice(1).map((line) => {
    // naive CSV split (handles quoted commas)
    const cells: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === "," && !inQuote) {
        cells.push(cur); cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (cells[i] ?? "").trim(); });
    return obj;
  });
}

function applyColumns<T>(
  raw: Record<string, string>,
  cols: ColumnDef<T>[]
): Partial<T> {
  const out: Partial<T> = {};
  cols.forEach((c) => {
    const cell = raw[c.label] ?? "";
    const val = c.parse ? c.parse(cell) : cell || undefined;
    (out as Record<string, unknown>)[c.key as string] = val;
  });
  return out;
}

/* ─── Download trigger ─────────────────────────────────────────── */

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Component ────────────────────────────────────────────────── */

export function ImportExport<T extends Record<string, unknown>>({
  data,
  columns,
  entityName,
  onImport,
}: ImportExportProps<T>) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewRows, setPreviewRows] = useState<Partial<T>[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importDone, setImportDone] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const { toast } = useToast();

  /* ── Export ── */
  function exportCSV() {
    const csv = toCSV(data, columns);
    const slug = entityName.toLowerCase().replace(/\s+/g, "-");
    downloadBlob(csv, `${slug}-export.csv`, "text/csv");
  }

  function exportJSON() {
    const slim = data.map((row) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((c) => {
        obj[c.key as string] = row[c.key as keyof T];
      });
      return obj;
    });
    downloadBlob(JSON.stringify(slim, null, 2), `${entityName.toLowerCase().replace(/\s+/g, "-")}-export.json`, "application/json");
  }

  /* ── Import ── */
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setImportDone(false);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      try {
        let rows: Partial<T>[] = [];
        if (file.name.endsWith(".json")) {
          const parsed = JSON.parse(text);
          const arr = Array.isArray(parsed) ? parsed : [parsed];
          rows = arr.map((item: Record<string, unknown>) => {
            const out: Partial<T> = {};
            columns.forEach((c) => {
              const raw = item[c.key as string];
              const val = c.parse && typeof raw === "string" ? c.parse(raw) : (raw ?? undefined);
              (out as Record<string, unknown>)[c.key as string] = val;
            });
            return out;
          });
        } else {
          const rawRows = parseCSV(text);
          if (rawRows.length === 0) throw new Error("No data rows found in CSV.");
          rows = rawRows.map((r) => applyColumns(r, columns));
        }
        setPreviewRows(rows);
        setPreviewOpen(true);
      } catch (err: unknown) {
        setParseError(err instanceof Error ? err.message : "Could not parse file.");
        setPreviewOpen(true);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function confirmImport() {
    setImporting(true);
    setImportError(null);
    try {
      await onImport(previewRows);
      setImportDone(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Import failed. Please try again.";
      setImportError(msg);
      toast({ title: "Import failed", description: msg, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  }

  const previewCols = columns.slice(0, 4); // show first 4 columns in preview table

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Export dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 font-semibold">
              <Download className="w-4 h-4" />
              Export
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={exportCSV} className="gap-2 cursor-pointer">
              <FileSpreadsheet className="w-4 h-4 text-green-500" />
              Export as CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportJSON} className="gap-2 cursor-pointer">
              <FileJson className="w-4 h-4 text-blue-500" />
              Export as JSON
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Import button */}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 font-semibold"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="w-4 h-4" />
          Import
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.json"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      {/* Preview / Confirm dialog */}
      <Dialog open={previewOpen} onOpenChange={(o) => { if (!importing) { setPreviewOpen(o); if (!o) { setParseError(null); setImportDone(false); setImportError(null); } } }}>
        <DialogContent className="sm:max-w-3xl bg-card border-border/50 max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              {parseError || importError ? (
                <><AlertTriangle className="w-5 h-5 text-destructive" /> Import Error</>
              ) : importDone ? (
                <><Check className="w-5 h-5 text-green-500" /> Import Complete</>
              ) : (
                <><Upload className="w-5 h-5 text-primary" /> Import Preview — {entityName}</>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-auto mt-2">
            {parseError ? (
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive">
                {parseError}
                <p className="mt-2 text-muted-foreground">
                  Make sure your file is a valid CSV or JSON that matches the export format.
                </p>
              </div>
            ) : importError ? (
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive">
                <p className="font-semibold mb-1">Import failed</p>
                <p>{importError}</p>
                <p className="mt-2 text-muted-foreground text-xs">
                  Check that you are logged in and try again. If the problem persists, contact support.
                </p>
              </div>
            ) : importDone ? (
              <div className="p-6 text-center">
                <Check className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <p className="font-semibold text-lg">Successfully imported {previewRows.length} {entityName.toLowerCase()}!</p>
                <p className="text-muted-foreground text-sm mt-1">The page will update automatically.</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-3">
                  <span className="font-semibold text-foreground">{previewRows.length} rows</span> detected. Review before confirming import.
                </p>
                <div className="overflow-x-auto rounded-xl border border-border/50">
                  <table className="w-full text-xs">
                    <thead className="bg-secondary/50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">#</th>
                        {previewCols.map((c) => (
                          <th key={String(c.key)} className="px-3 py-2 text-left font-semibold text-muted-foreground">
                            {c.label}
                          </th>
                        ))}
                        {columns.length > 4 && (
                          <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                            +{columns.length - 4} more
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.slice(0, 10).map((row, i) => (
                        <tr key={i} className="border-t border-border/30 hover:bg-secondary/20 transition-colors">
                          <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                          {previewCols.map((c) => {
                            const val = row[c.key as keyof T];
                            const display = Array.isArray(val) ? val.join(", ") : String(val ?? "—");
                            return (
                              <td key={String(c.key)} className="px-3 py-2 max-w-[160px] truncate" title={display}>
                                {display || <span className="text-muted-foreground/50 italic">empty</span>}
                              </td>
                            );
                          })}
                          {columns.length > 4 && <td className="px-3 py-2 text-muted-foreground/40 italic text-[10px]">…</td>}
                        </tr>
                      ))}
                      {previewRows.length > 10 && (
                        <tr className="border-t border-border/30">
                          <td colSpan={previewCols.length + 2} className="px-3 py-2 text-center text-muted-foreground text-xs italic">
                            … and {previewRows.length - 10} more rows
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  ⚠️ Import adds new records. It does <strong>not</strong> update or overwrite existing ones.
                </p>
              </>
            )}
          </div>

          <DialogFooter className="pt-4 border-t border-border/50 shrink-0">
            {importDone ? (
              <Button onClick={() => { setPreviewOpen(false); setImportDone(false); }}>
                Done
              </Button>
            ) : parseError || importError ? (
              <>
                <Button variant="outline" onClick={() => setPreviewOpen(false)}>
                  <X className="w-4 h-4 mr-2" /> Close
                </Button>
                {importError && (
                  <Button onClick={() => setImportError(null)} className="bg-primary text-primary-foreground">
                    Try Again
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setPreviewOpen(false)} disabled={importing}>
                  Cancel
                </Button>
                <Button
                  onClick={confirmImport}
                  disabled={importing || previewRows.length === 0}
                  className="bg-primary text-primary-foreground"
                >
                  {importing ? "Importing…" : `Import ${previewRows.length} Records`}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
