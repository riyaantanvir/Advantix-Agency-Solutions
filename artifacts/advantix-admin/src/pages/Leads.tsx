import { useState } from "react";
import { useListLeads } from "@workspace/api-client-react";
import type { Lead } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Search, TrendingUp, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type SortKey = keyof Pick<Lead, "createdAt" | "service" | "name" | "email" | "status">;
type SortDir = "asc" | "desc";

function SortIcon({ column, sortKey, sortDir }: { column: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (column !== sortKey) return <ArrowUpDown className="w-3.5 h-3.5 ml-1 opacity-40" />;
  return sortDir === "asc"
    ? <ArrowUp className="w-3.5 h-3.5 ml-1 text-primary" />
    : <ArrowDown className="w-3.5 h-3.5 ml-1 text-primary" />;
}

export default function Leads() {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data: leads, isLoading } = useListLeads();

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filteredLeads = (leads ?? [])
    .filter(l =>
      l.service.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.email && l.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (l.name && l.name.toLowerCase().includes(searchTerm.toLowerCase()))
    )
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === "createdAt") {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortKey === "service") {
        cmp = a.service.localeCompare(b.service);
      } else if (sortKey === "name") {
        cmp = (a.name ?? "").localeCompare(b.name ?? "");
      } else if (sortKey === "email") {
        cmp = (a.email ?? "").localeCompare(b.email ?? "");
      } else if (sortKey === "status") {
        cmp = a.status.localeCompare(b.status);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

  const thClass = "px-6 py-4 font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Leads Tracker</h1>
          <p className="text-muted-foreground mt-1">Monitor inbound lead events and interests.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by service or email..."
            className="pl-9 h-10 bg-card rounded-xl border-border/50"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-secondary/30">
                <th className={thClass} onClick={() => toggleSort("createdAt")}>
                  <span className="flex items-center">Date <SortIcon column="createdAt" sortKey={sortKey} sortDir={sortDir} /></span>
                </th>
                <th className={thClass} onClick={() => toggleSort("service")}>
                  <span className="flex items-center">Service <SortIcon column="service" sortKey={sortKey} sortDir={sortDir} /></span>
                </th>
                <th className={thClass} onClick={() => toggleSort("name")}>
                  <span className="flex items-center">Contact Info <SortIcon column="name" sortKey={sortKey} sortDir={sortDir} /></span>
                </th>
                <th className="px-6 py-4 font-semibold text-muted-foreground">Source Page</th>
                <th className={thClass} onClick={() => toggleSort("status")}>
                  <span className="flex items-center">Status <SortIcon column="status" sortKey={sortKey} sortDir={sortDir} /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="px-6 py-4"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-6 w-32 rounded-full" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-40" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-6 w-20 rounded-full" /></td>
                  </tr>
                ))
              ) : filteredLeads.length > 0 ? (
                filteredLeads.map((lead) => (
                  <tr key={lead.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                      {format(new Date(lead.createdAt), "MMM d, yyyy HH:mm")}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 bg-primary/10 text-primary rounded-lg text-xs font-bold uppercase tracking-wider">
                        {lead.service}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {lead.name || lead.email ? (
                        <div className="flex flex-col">
                          {lead.name && <span className="font-medium text-foreground">{lead.name}</span>}
                          {lead.email && <span className="text-muted-foreground text-xs">{lead.email}</span>}
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic text-xs">Anonymous Visitor</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                      {lead.sourcePage ?? "-"}
                    </td>
                    <td className="px-6 py-4">
                      {lead.status === "new" && <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 shadow-none hover:bg-blue-500/20">New</Badge>}
                      {lead.status === "contacted" && <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-none hover:bg-amber-500/20">Contacted</Badge>}
                      {lead.status === "converted" && <Badge className="bg-green-500/10 text-green-500 border-green-500/20 shadow-none hover:bg-green-500/20">Converted</Badge>}
                      {!["new", "contacted", "converted"].includes(lead.status) && <Badge variant="outline">{lead.status}</Badge>}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <TrendingUp className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground text-lg">No leads match your criteria.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
