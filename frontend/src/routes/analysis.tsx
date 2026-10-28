import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { errorText } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { loadPatients, latest, type Patient } from "@/lib/store";
import { StatusBadge } from "@/components/StatusBadge";
import { ArrowRight, Plus, Search, TrendingDown, TrendingUp, Minus, User, Activity } from "lucide-react";

import { t, useLang } from "@/lib/i18n";
import { BAND_LABEL, BandBadge } from "@/components/ChwDecision";
export const Route = createFileRoute("/analysis")({
  head: () => ({ meta: [{ title: "AI Risk Analysis — REFLEX AI Module 1" }] }),
  component: AnalysisPage,
});

function AnalysisPage() {
  useLang();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => { loadPatients().then(setPatients).catch((e) => toast.error(errorText(e))); }, []);

  const filtered = useMemo(
    () => patients.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())),
    [patients, q],
  );

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("AI Risk Analysis")}</h1>
            <p className="text-muted-foreground text-sm mt-1">{t("Tap a mother to open her full analysis.")}</p>
          </div>
          <div className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name..."
              className="pl-9 pr-3 py-2.5 rounded-xl bg-card border border-border text-sm outline-none focus:ring-2 focus:ring-ring w-56"
            />
          </div>
        </div>

        <Link to="/register" className="mt-6 flex items-center gap-3 rounded-2xl border-2 border-dashed border-primary/40 p-4 hover:border-primary hover:shadow-card transition-all">
          <div className="size-10 rounded-xl bg-gradient-hero text-white flex items-center justify-center"><Plus className="size-5" /></div>
          <div>
            <div className="font-semibold">{t("Register a new patient")}</div>
            <div className="text-xs text-muted-foreground">First-time screening &amp; baseline analysis</div>
          </div>
        </Link>

        <div className="mt-4 space-y-3">
          {filtered.map((p) => <PatientRow key={p.id} p={p} />)}
          {filtered.length === 0 && (
            <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground text-center">
              No patients match "{q}".
            </div>
          )}
        </div>

        <div className="mt-6 rounded-2xl bg-gradient-soft border border-border p-4 text-sm text-muted-foreground flex items-start gap-3">
          <Activity className="size-4 text-primary mt-0.5 shrink-0" />
          <p><span className="text-foreground font-medium">{t("Continuous screening:")}</span>{' '}{t("each visit is compared against the patient's history. The AI escalates risk when red flags persist across visits — even subtle ones a single visit might miss.")}</p>
        </div>
      </div>
    </AppShell>
  );
}

function PatientRow({ p }: { p: Patient }) {
  useLang();
  const a = latest(p)?.analysis;
  const TrendIcon = a?.trend === "worsening" ? TrendingUp : a?.trend === "improving" ? TrendingDown : Minus;
  const trendColor = a?.trend === "worsening" ? "text-destructive" : a?.trend === "improving" ? "text-success" : "text-muted-foreground";
  return (
    <Link to="/patient/$id" params={{ id: p.id }} className="flex items-center gap-4 rounded-2xl bg-card border border-border p-4 shadow-card hover:shadow-glow hover:-translate-y-0.5 transition-all">
      <div className="size-11 rounded-full bg-secondary flex items-center justify-center shrink-0">
        <User className="size-5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold truncate">{p.name}</div>
        <div className="text-xs text-muted-foreground">{t("Age")} {p.age} • {t("{n} visits", { n: p.checkIns.length })} • BP {latest(p)?.bloodPressure ?? "—"}</div>
      </div>
      <div className="text-right shrink-0">
        {a && <BandBadge band={a.band} />}
      </div>
      {a && <StatusBadge category={a.category} />}
      <ArrowRight className="size-4 text-primary shrink-0" />
    </Link>
  );
}
