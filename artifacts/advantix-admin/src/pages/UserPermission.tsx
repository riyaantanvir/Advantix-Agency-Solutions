import { ShieldCheck, Lock, Users, Key, Settings2, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";

const upcomingFeatures = [
  {
    icon: Users,
    title: "Role Management",
    description: "Create custom roles (Editor, Viewer, Moderator) and assign them to team members.",
  },
  {
    icon: Key,
    title: "Permission Groups",
    description: "Define granular permissions per module — who can read, write, or delete.",
  },
  {
    icon: Lock,
    title: "Page Access Control",
    description: "Restrict specific admin pages or sections to certain roles only.",
  },
  {
    icon: Settings2,
    title: "API Key Permissions",
    description: "Control which API keys can access which endpoints and resources.",
  },
];

export default function UserPermission() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">User Permission</h1>
          <p className="text-sm text-muted-foreground">Control access levels and permissions for your team</p>
        </div>
      </div>

      {/* Coming Soon Banner */}
      <Card className="p-8 flex flex-col items-center text-center border-dashed border-primary/30 bg-primary/5">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <ShieldCheck className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-display font-bold text-foreground mb-2">Permission System Coming Soon</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          A full role-based access control system is being built here. You'll be able to define roles, assign granular permissions, and control exactly what each team member can see and do.
        </p>
      </Card>

      {/* Planned Features */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Planned Features</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {upcomingFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title} className="p-4 flex items-start gap-4 hover:border-primary/30 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{feature.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{feature.description}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-1" />
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
