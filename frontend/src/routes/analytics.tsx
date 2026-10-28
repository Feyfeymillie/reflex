import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { errorText } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { loadPatients, latestAnalysis, type Patient } from "@/lib/store";
import { Activity, ShieldAlert, Users, TrendingUp } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { t, useLang } from "@/lib/i18n";
export const Route = createFileRoute("/analytics")({
  head: () => ({ meta: [{ title: "Analytics — REFLEX AI Module 1" }] }),
  component: AnalyticsPage,
});

const monthly = [
  { month: "Jan", screened: 142, high: 18 },
  { month: "Feb", screened: 168, high: 22 },
  { month: "Mar", screened: 201, high: 27 },
  { month: "Apr", screened: 234, high: 31 },
  { month: "May", screened: 278, high: 38 },
  { month: "Jun", screened: 312, high: 41 },
  { month: "Jul", screened: 356, high: 47 },
];

const complications = [
  { name: "Preeclampsia", value: 38 },
  { name: "Anemia", value: 27 },
  { name: "Hypertension", value: 19 },
  { name: "Fetal growth", value: 12 },
  { name: "Other", value: 4 },
];

const colors = ["oklch(0.58 0.13 235)", "oklch(0.66 0.11 195)", "oklch(0.78 0.14 55)", "oklch(0.68 0.14 155)", "oklch(0.6 0.22 25)"];

function AnalyticsPage() {
  useLang();
  const [patients, setPatients] = useState<Patient[]>([]);
  useEffect(() => { loadPatients().then(setPatients).catch((e) => toast.error(errorText(e))); }, []);

  const total = patients.length;
    const high = patients.filter((p) => latestAnalysis(p)?.category === "High").length;
    const moderate = patients.filter((p) => latestAnalysis(p)?.category === "Moderate").length;

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("Clinic Analytics")}</h1>
          <p className="text-muted-foreground text-sm">{t("Real-time view of maternal health across your screenings.")}</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi icon={Users} color="text-primary" label="Screened (local)" value={total.toString()} sub="On this device" />
          <Kpi icon={ShieldAlert} color="text-destructive" label="High-risk cases" value={high.toString()} sub="Requires referral" />
          <Kpi icon={Activity} color="text-accent" label="Moderate cases" value={moderate.toString()} sub="Monitor weekly" />
          <Kpi icon={TrendingUp} color="text-success" label="Model" value="Placeholder" sub="Synthetic data, not validated" />
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-2xl bg-card border border-border p-6 shadow-card">
            <div className="font-semibold">{t("Screening trend (last 7 months)")}</div>
            <div className="mt-4 h-72">
              <ResponsiveContainer>
                <AreaChart data={monthly}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.58 0.13 235)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="oklch(0.58 0.13 235)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.6 0.22 25)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="oklch(0.6 0.22 25)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} />
                  <Area type="monotone" dataKey="screened" stroke="oklch(0.58 0.13 235)" fill="url(#g1)" strokeWidth={2} />
                  <Area type="monotone" dataKey="high" stroke="oklch(0.6 0.22 25)" fill="url(#g2)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
            <div className="font-semibold">{t("Top complications")}</div>
            <div className="mt-4 h-72">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={complications} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={3}>
                    {complications.map((_, i) => <Cell key={i} fill={colors[i]} />)}
                  </Pie>
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
          <div className="font-semibold">{t("High-risk detections per month")}</div>
          <div className="mt-4 h-64">
            <ResponsiveContainer>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} />
                <Bar dataKey="high" radius={[8, 8, 0, 0]} fill="oklch(0.78 0.14 55)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Kpi({ icon: Icon, color, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; color: string; label: string; value: string; sub: string }) {
  useLang();
  return (
    <div className="rounded-2xl bg-card border border-border p-5 shadow-card">
      <Icon className={`size-5 ${color}`} />
      <div className="text-2xl font-bold mt-2">{value}</div>
      <div className="text-sm font-medium">{t(label)}</div>
      <div className="text-xs text-muted-foreground">{t(sub)}</div>
    </div>
  );
}
