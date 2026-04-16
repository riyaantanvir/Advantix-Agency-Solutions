import { Home, Wrench, LayoutDashboard } from "lucide-react";

export function Navbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b border-white/[0.06] bg-background/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto h-full px-4 flex items-center justify-between">
        {/* Logo */}
        <a href="/ai/" className="flex items-center gap-2.5 shrink-0 hover:opacity-90 transition-opacity">
          <img src="/ai/images/logo-icon.svg" alt="Advantix" className="w-7 h-7" />
          <span className="text-sm font-semibold tracking-tight text-foreground">Advantix</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 font-medium ml-0.5">AI</span>
        </a>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          <a
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
          >
            <Home className="w-3.5 h-3.5" />
            Home
          </a>

          <a
            href="/tools"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
          >
            <Wrench className="w-3.5 h-3.5" />
            Tools
          </a>
          <a
            href="/admin/"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            Dashboard
          </a>
        </nav>
      </div>
    </header>
  );
}
