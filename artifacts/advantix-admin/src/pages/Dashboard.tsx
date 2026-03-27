import { useGetStats, getGetStatsQueryKey } from "@workspace/api-client-react";
import { Users, Eye, Mail, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: stats, isLoading } = useGetStats({
    query: {
      queryKey: getGetStatsQueryKey(),
      refetchInterval: 30000,
    }
  });

  const statCards = [
    { title: "Active Visitors", value: stats?.activeVisitors ?? 0, icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
    { title: "Today's Views", value: stats?.todayViews ?? 0, icon: Eye, color: "text-green-500", bg: "bg-green-500/10" },
    { title: "Total Contacts", value: stats?.totalContacts ?? 0, icon: Mail, color: "text-purple-500", bg: "bg-purple-500/10" },
    { title: "Total Leads", value: stats?.totalLeads ?? 0, icon: TrendingUp, color: "text-amber-500", bg: "bg-amber-500/10" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Dashboard Overview</h1>
        <p className="text-muted-foreground mt-1">Real-time metrics and agency performance.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))
        ) : (
          statCards.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card key={index} className="p-6 rounded-2xl border-border/50 shadow-sm bg-card hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                    <h3 className="text-4xl font-display font-bold text-foreground mt-2">{stat.value}</h3>
                  </div>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.bg}`}>
                    <Icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Top Pages Table */}
      <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden bg-card">
        <div className="p-6 border-b border-border/50">
          <h3 className="text-xl font-display font-bold">Top Pages Today</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/30">
                <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Page Path</th>
                <th className="px-6 py-4 text-sm font-semibold text-muted-foreground text-right">Views</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="px-6 py-4"><Skeleton className="h-5 w-48" /></td>
                    <td className="px-6 py-4 flex justify-end"><Skeleton className="h-5 w-12" /></td>
                  </tr>
                ))
              ) : stats?.topPages && stats.topPages.length > 0 ? (
                stats.topPages.map((page, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors">
                    <td className="px-6 py-4 text-foreground font-mono text-sm">{page.page}</td>
                    <td className="px-6 py-4 text-right font-medium text-foreground">{page.count}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className="px-6 py-12 text-center text-muted-foreground">
                    No page views recorded today.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
