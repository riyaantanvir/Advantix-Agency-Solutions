import { Inbox } from "lucide-react";

export default function InboxPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Inbox className="w-6 h-6 text-primary" />
          Inbox
        </h1>
        <p className="text-muted-foreground mt-1">Manage incoming messages and replies</p>
      </div>

      <div className="bg-card rounded-xl border border-border p-16 text-center">
        <Inbox className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground mb-2">Inbox Coming Soon</h3>
        <p className="text-sm text-muted-foreground/70 max-w-md mx-auto">
          This section will be set up to manage your incoming email replies and messages.
        </p>
      </div>
    </div>
  );
}
