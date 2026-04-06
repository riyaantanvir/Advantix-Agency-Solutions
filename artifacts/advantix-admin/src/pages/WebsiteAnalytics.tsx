import { useState, useEffect } from "react";
import { Loader2, Globe, Users, Eye, Clock, TrendingUp, Monitor, Smartphone, Languages, MapPin, BarChart2, Activity } from "lucide-react";
import { Card } from "@/components/ui/card";

const API = "/api";

type WebsiteData = {
  summary: { sessions: number; pageviews: number; bounceRate: number; avgTimeOnPage: number };
  byDay: Array<{ day: string; pageviews: string; sessions: string }>;
  byPage: Array<{ page_path: string; views: string; sessions: string; avg_time: string | null }>;
  byCountry: Array<{ country: string; sessions: string }>;
  byReferrer: Array<{ referrer: string; sessions: string }>;
  byBrowser: Array<{ browser: string; sessions: string }>;
  byOS: Array<{ os: string; sessions: string }>;
  byDevice: Array<{ device: string; sessions: string }>;
  byHour: Array<{ hour: number; pageviews: string }>;
  byDayOfWeek: Array<{ day_name: string; dow: number; pageviews: string }>;
  byLanguage: Array<{ language: string; sessions: string }>;
  scrollByPage: Array<{ page_path: string; avg_scroll: string; readings: string }>;
  userJourney: Array<{ session_id: string; journey: string[]; pages_visited: string }>;
  recentSessions: Array<{
    session_id: string; country: string | null; city: string | null;
    browser: string | null; os: string | null; device: string | null;
    language: string | null; page_views: string; last_seen: string;
  }>;
};

function BarRow({ label, value, max, color = "bg-primary" }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground w-40 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold tabular-nums w-10 text-right">{value}</span>
    </div>
  );
}

function HourHeatmap({ byHour }: { byHour: Array<{ hour: number; pageviews: string }> }) {
  const map: Record<number, number> = {};
  byHour.forEach(r => { map[r.hour] = parseInt(r.pageviews); });
  const max = Math.max(...Object.values(map), 1);
  const label = (h: number) => h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;

  return (
    <div>
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Clock className="w-4 h-4 text-amber-400" /> Hour-of-Day Activity
      </h3>
      <div className="grid grid-cols-12 gap-1">
        {Array.from({ length: 24 }, (_, h) => {
          const v = map[h] ?? 0;
          const i = v / max;
          const bg = i === 0 ? "bg-secondary/30" : i < 0.25 ? "bg-blue-900/50" : i < 0.5 ? "bg-blue-600/70" : i < 0.75 ? "bg-blue-400/80" : "bg-blue-400";
          return (
            <div key={h} className="flex flex-col items-center gap-1" title={`${label(h)}: ${v} views`}>
              <div className={`w-full aspect-square rounded-md ${bg} cursor-default`} />
              {h % 3 === 0 && <span className="text-[9px] text-muted-foreground">{label(h)}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayOfWeekChart({ byDayOfWeek }: { byDayOfWeek: Array<{ day_name: string; dow: number; pageviews: string }> }) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const map: Record<number, number> = {};
  byDayOfWeek.forEach(r => { map[r.dow] = parseInt(r.pageviews); });
  const max = Math.max(...Object.values(map), 1);

  return (
    <div>
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Activity className="w-4 h-4 text-green-400" /> Day-of-Week Activity
      </h3>
      <div className="flex items-end gap-2 h-16">
        {days.map((d, i) => {
          const v = map[i] ?? 0;
          const pct = Math.max(4, Math.round((v / max) * 100));
          return (
            <div key={d} className="flex-1 flex flex-col items-center gap-1" title={`${d}: ${v} views`}>
              <div className="w-full bg-green-500/70 hover:bg-green-400 rounded-sm transition-all cursor-default" style={{ height: `${pct}%` }} />
              <span className="text-[10px] text-muted-foreground">{d}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function countryFlag(name: string): string {
  const map: Record<string, string> = {
    Bangladesh: "🇧🇩", "United States": "🇺🇸", "United Kingdom": "🇬🇧",
    India: "🇮🇳", Pakistan: "🇵🇰", UAE: "🇦🇪", Canada: "🇨🇦",
    Australia: "🇦🇺", Germany: "🇩🇪", France: "🇫🇷", Singapore: "🇸🇬",
  };
  return map[name] ?? "🌐";
}

export default function WebsiteAnalytics() {
  const [data, setData] = useState<WebsiteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [days, setDays] = useState(30);
  const [activeTab, setActiveTab] = useState<"overview" | "pages" | "audience" | "journey">("overview");

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/analytics/website?days=${days}`, { credentials: "include" })
      .then(r => r.json())
      .then(setData)
      .catch(() => setError("Failed to load analytics"))
      .finally(() => setLoading(false));
  }, [days]);

  const maxPage     = data ? Math.max(...data.byPage.map(r => parseInt(r.views)), 1) : 1;
  const maxCountry  = data ? Math.max(...data.byCountry.map(r => parseInt(r.sessions)), 1) : 1;
  const maxRef      = data ? Math.max(...data.byReferrer.map(r => parseInt(r.sessions)), 1) : 1;
  const maxBrowser  = data ? Math.max(...data.byBrowser.map(r => parseInt(r.sessions)), 1) : 1;
  const maxOS       = data ? Math.max(...data.byOS.map(r => parseInt(r.sessions)), 1) : 1;
  const maxLang     = data ? Math.max(...data.byLanguage.map(r => parseInt(r.sessions)), 1) : 1;
  const maxDay      = data ? Math.max(...data.byDay.map(r => parseInt(r.pageviews)), 1) : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-primary" /> Website Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time visitor data from your public website</p>
        </div>
        <div className="flex items-center gap-2">
          {([7, 14, 30, 90] as const).map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${days === d ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground hover:text-foreground"}`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {error && <p className="text-destructive text-center py-8">{error}</p>}

      {data && !loading && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Sessions", value: data.summary.sessions.toLocaleString(), icon: Users, color: "text-blue-400", bg: "bg-blue-500/10" },
              { label: "Page Views", value: data.summary.pageviews.toLocaleString(), icon: Eye, color: "text-green-400", bg: "bg-green-500/10" },
              { label: "Bounce Rate", value: `${data.summary.bounceRate}%`, icon: TrendingUp, color: "text-orange-400", bg: "bg-orange-500/10" },
              { label: "Avg. Time on Page", value: formatTime(data.summary.avgTimeOnPage), icon: Clock, color: "text-purple-400", bg: "bg-purple-500/10" },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <Card key={label} className={`p-4 ${bg} border-0`}>
                <Icon className={`w-5 h-5 ${color} mb-2`} />
                <p className="text-2xl font-bold tabular-nums">{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </Card>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex bg-secondary/40 p-1 rounded-xl gap-1 overflow-x-auto">
            {(["overview", "pages", "audience", "journey"] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`flex-1 py-1.5 px-3 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${activeTab === t ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {t === "overview" ? "📊 Overview" : t === "pages" ? "📄 Pages" : t === "audience" ? "👥 Audience" : "🗺️ Journeys"}
              </button>
            ))}
          </div>

          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Traffic over time */}
              {data.byDay.length > 0 && (
                <Card className="p-5">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" /> Traffic Over Time
                  </h3>
                  <div className="flex items-end gap-1 h-24 bg-secondary/20 rounded-xl px-3 py-2">
                    {data.byDay.map(r => {
                      const pct = Math.max(4, Math.round((parseInt(r.pageviews) / maxDay) * 100));
                      return (
                        <div key={r.day} className="flex-1 flex flex-col items-center gap-0.5" title={`${r.day}: ${r.pageviews} views`}>
                          <div className="w-full bg-primary/70 hover:bg-primary rounded-sm transition-all cursor-default" style={{ height: `${pct}%` }} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-1 px-1">
                    <span className="text-xs text-muted-foreground">{data.byDay[0]?.day}</span>
                    <span className="text-xs text-muted-foreground">{data.byDay[data.byDay.length - 1]?.day}</span>
                  </div>
                </Card>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Hour heatmap */}
                <Card className="p-5">
                  <HourHeatmap byHour={data.byHour} />
                </Card>

                {/* Day of week */}
                <Card className="p-5">
                  <DayOfWeekChart byDayOfWeek={data.byDayOfWeek} />
                </Card>
              </div>

              {/* Countries + Referrers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.byCountry.length > 0 && (
                  <Card className="p-5">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <Globe className="w-4 h-4 text-blue-400" /> Countries
                    </h3>
                    <div className="space-y-2">
                      {data.byCountry.map(r => (
                        <BarRow key={r.country} label={`${countryFlag(r.country)} ${r.country}`} value={parseInt(r.sessions)} max={maxCountry} color="bg-blue-500" />
                      ))}
                    </div>
                  </Card>
                )}

                {data.byReferrer.length > 0 && (
                  <Card className="p-5">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-green-400" /> Traffic Sources
                    </h3>
                    <div className="space-y-2">
                      {data.byReferrer.map(r => (
                        <BarRow key={r.referrer} label={r.referrer} value={parseInt(r.sessions)} max={maxRef} color="bg-green-500" />
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            </div>
          )}

          {activeTab === "pages" && (
            <div className="space-y-4">
              {/* Top pages */}
              <Card className="p-5">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Eye className="w-4 h-4 text-primary" /> Top Pages
                </h3>
                <div className="space-y-3">
                  {data.byPage.map(r => (
                    <div key={r.page_path} className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground flex-1 min-w-0 truncate font-mono">{r.page_path}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-muted-foreground">{r.avg_time ? formatTime(parseInt(r.avg_time)) : "—"}</span>
                        <div className="w-24 h-2 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${Math.round((parseInt(r.views) / maxPage) * 100)}%` }} />
                        </div>
                        <span className="text-sm font-semibold tabular-nums w-10 text-right">{r.views}</span>
                      </div>
                    </div>
                  ))}
                  {data.byPage.length === 0 && <p className="text-muted-foreground text-sm text-center py-4">No page view data yet.</p>}
                </div>
              </Card>

              {/* Scroll depth by page */}
              {data.scrollByPage.length > 0 && (
                <Card className="p-5">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-cyan-400" /> Scroll Depth by Page
                  </h3>
                  <div className="space-y-3">
                    {data.scrollByPage.map(r => (
                      <div key={r.page_path} className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground flex-1 min-w-0 truncate font-mono">{r.page_path}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="w-24 h-2 bg-secondary rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${parseInt(r.avg_scroll) > 70 ? "bg-green-500" : parseInt(r.avg_scroll) > 40 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${r.avg_scroll}%` }} />
                          </div>
                          <span className="text-sm font-semibold tabular-nums w-12 text-right">{r.avg_scroll}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}

          {activeTab === "audience" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {data.byBrowser.length > 0 && (
                  <Card className="p-5">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <Globe className="w-4 h-4 text-yellow-400" /> Browsers
                    </h3>
                    <div className="space-y-2">
                      {data.byBrowser.map(r => (
                        <BarRow key={r.browser} label={r.browser} value={parseInt(r.sessions)} max={maxBrowser} color="bg-yellow-500" />
                      ))}
                    </div>
                  </Card>
                )}

                {data.byOS.length > 0 && (
                  <Card className="p-5">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <Monitor className="w-4 h-4 text-violet-400" /> Operating Systems
                    </h3>
                    <div className="space-y-2">
                      {data.byOS.map(r => (
                        <BarRow key={r.os} label={r.os} value={parseInt(r.sessions)} max={maxOS} color="bg-violet-500" />
                      ))}
                    </div>
                  </Card>
                )}

                {data.byDevice.length > 0 && (
                  <Card className="p-5">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-orange-400" /> Devices
                    </h3>
                    <div className="space-y-2">
                      {data.byDevice.map(r => (
                        <BarRow key={r.device} label={r.device} value={parseInt(r.sessions)} max={parseInt(data.byDevice[0]?.sessions ?? "1")} color="bg-orange-400" />
                      ))}
                    </div>
                  </Card>
                )}
              </div>

              {data.byLanguage.length > 0 && (
                <Card className="p-5">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Languages className="w-4 h-4 text-cyan-400" /> Browser Language
                  </h3>
                  <div className="space-y-2">
                    {data.byLanguage.map(r => (
                      <BarRow key={r.language} label={r.language} value={parseInt(r.sessions)} max={maxLang} color="bg-cyan-500" />
                    ))}
                  </div>
                </Card>
              )}

              {/* Recent Sessions */}
              <Card className="p-5">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" /> Recent Visitors
                </h3>
                {data.recentSessions.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-4">No visitor data yet. Add tracking to your website.</p>
                ) : (
                  <div className="space-y-2">
                    {data.recentSessions.map((s, i) => (
                      <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/30 text-sm">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{s.city ?? s.country ?? "Unknown"}</span>
                          <span className="text-muted-foreground text-xs ml-2">{s.browser} · {s.os} · {s.device}</span>
                          {s.language && <span className="text-xs text-muted-foreground ml-2">🗣️ {s.language}</span>}
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{s.page_views} pages</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {activeTab === "journey" && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" /> User Journeys
              </h3>
              <p className="text-xs text-muted-foreground mb-4">Pages visited per session, most recent first</p>
              {data.userJourney.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">No journey data yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.userJourney.map((j, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30">
                      <span className="text-xs text-muted-foreground shrink-0 mt-0.5">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap gap-1 items-center">
                          {j.journey.slice(0, 8).map((page, pi) => (
                            <span key={pi} className="flex items-center gap-1">
                              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-mono truncate max-w-[160px]">{page}</span>
                              {pi < j.journey.length - 1 && pi < 7 && <span className="text-muted-foreground text-xs">→</span>}
                            </span>
                          ))}
                          {j.journey.length > 8 && (
                            <span className="text-xs text-muted-foreground">+{j.journey.length - 8} more</span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{j.pages_visited}p</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {data.summary.sessions === 0 && (
            <Card className="p-8 text-center">
              <BarChart2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="font-semibold mb-1">No visitor data yet</p>
              <p className="text-muted-foreground text-sm">Website tracking is active — data will appear as visitors browse your site.</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
