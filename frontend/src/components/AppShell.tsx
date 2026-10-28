import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  UserPlus,
  Activity,
  Siren,
  BarChart3,
  Globe2,
  HeartHandshake,
  Baby,
  Home,
  Moon,
  Sun,
  WifiOff,
  Languages,
  Menu,
  X,
} from "lucide-react";
import logo from "@/assets/logo.png";
import { cn } from "@/lib/utils";
import { Chatbot } from "./Chatbot";

import { setLang, t, useLang } from "@/lib/i18n";
const nav = [
  { to: "/", label: "Home", icon: Home },
  { to: "/patients", label: "Patients", icon: LayoutDashboard },
  { to: "/register", label: "New Patient", icon: UserPlus },
  { to: "/analysis", label: "AI Analysis", icon: Activity },
  { to: "/postpartum", label: "Postpartum (EPDS)", icon: HeartHandshake },
  { to: "/children", label: "Child development", icon: Baby },
  { to: "/referral", label: "Referrals", icon: Siren },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/dataset", label: "Model & data", icon: Globe2 },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  useLang();
  const loc = useLocation();
  const [dark, setDark] = useState(false);
  const lang = useLang();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("mg:dark") === "1";
    setDark(stored);
    document.documentElement.classList.toggle("dark", stored);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("mg:dark", dark ? "1" : "0");
  }, [dark]);

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={cn(
          "print:hidden fixed lg:static z-40 h-screen lg:h-auto w-64 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <Link to="/" className="flex items-center gap-2 px-5 py-5 border-b border-sidebar-border" onClick={() => setOpen(false)}>
          <img src={logo} alt="RefleX" className="size-9" width={36} height={36} />
          <div className="leading-tight">
            <div className="font-semibold">RefleX</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("Mother & child • Offline")}</div>
          </div>
        </Link>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((n) => {
            const active = loc.pathname === n.to || (n.to !== "/" && loc.pathname.startsWith(n.to));
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-card"
                    : "text-sidebar-foreground hover:bg-sidebar-accent",
                )}
              >
                <Icon className="size-4" />
                {t(n.label)}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border text-xs text-muted-foreground">
          <div className="flex items-center gap-2 px-2 py-2 rounded-md bg-success/10 text-success">
            <span className="size-2 rounded-full bg-success animate-pulse" />{' '}{t("Saved on the RefleX hub")}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="print:hidden sticky top-0 z-30 flex items-center justify-between px-4 lg:px-6 h-14 border-b border-border bg-background/80 backdrop-blur">
          <button className="lg:hidden p-2" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <div className="hidden lg:flex items-center gap-2 text-sm text-muted-foreground">
            <WifiOff className="size-4 text-accent" />
            <span>{t("No internet needed • Records saved on the RefleX hub")}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLang(lang === "sw" ? "en" : "sw")}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium hover:bg-secondary"
              title="Language"
            >
              <Languages className="size-4" /> {lang === "sw" ? "Kiswahili" : "English"}
            </button>
            <button
              onClick={() => setDark(!dark)}
              className="p-2 rounded-md hover:bg-secondary"
              aria-label="Toggle theme"
            >
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
          </div>
        </header>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
      <div className="print:hidden"><Chatbot /></div>
      {open && <div className="print:hidden fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setOpen(false)} />}
    </div>
  );
}
