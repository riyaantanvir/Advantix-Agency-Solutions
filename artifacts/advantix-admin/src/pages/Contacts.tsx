import { useState } from "react";
import { useListContacts, useUpdateContact, useDeleteContact } from "@workspace/api-client-react";
import type { Contact } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, Trash2, Search, Mail, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type SortKey = "createdAt" | "name" | "email" | "service" | "replied";
type SortDir = "asc" | "desc";

function SortIcon({ column, sortKey, sortDir }: { column: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (column !== sortKey) return <ArrowUpDown className="w-3.5 h-3.5 ml-1 opacity-40" />;
  return sortDir === "asc"
    ? <ArrowUp className="w-3.5 h-3.5 ml-1 text-primary" />
    : <ArrowDown className="w-3.5 h-3.5 ml-1 text-primary" />;
}

export default function Contacts() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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
      if (sortKey === "createdAt") {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortKey === "name") {
        cmp = a.name.localeCompare(b.name);
      } else if (sortKey === "email") {
        cmp = a.email.localeCompare(b.email);
      } else if (sortKey === "service") {
        cmp = (a.service ?? "").localeCompare(b.service ?? "");
      } else if (sortKey === "replied") {
        cmp = Number(a.replied) - Number(b.replied);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Inbox</h1>
          <p className="text-muted-foreground mt-1">Manage contact form submissions.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
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
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <Mail className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground text-lg">No contacts found.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
            </div>

            <div className="p-3 bg-secondary/50 rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Service of Interest</p>
              <p className="text-sm font-medium text-foreground">{selectedContact?.service ?? "General Inquiry"}</p>
            </div>

            <div className="p-4 bg-secondary/30 rounded-xl border border-border/50 min-h-[150px]">
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
    </div>
  );
}
