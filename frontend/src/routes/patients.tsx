import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { errorText } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { loadPatients, latestAnalysis, type Patient } from "@/lib/store";
import { ArrowRight, Plus, Search, Activity } from "lucide-react";

import { t, useLang } from "@/lib/i18n";
export const Route = createFileRoute("/patients")({
  head: () => ({ meta: [{ title: "Patient Records — REFLEX AI Module 1" }] }),
  component: PatientsPage,
});

function PatientsPage() {
  useLang();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => { loadPatients().then(setPatients).catch((e) => toast.error(errorText(e))); }, []);
  const filtered = useMemo(() => patients.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())), [patients, q]);

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("Patient Records")}</h1>
            <p className="text-muted-foreground text-sm mt-1">{t("Tap a patient to add today's check-in, or register a new mother.")}</p>
          </div>
          <div className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name..."
              className="pl-9 pr-3 py-2.5 rounded-xl bg-card border border-border text-sm outline-none focus:ring-2 focus:ring-ring w-64"
            />
          </div>
        </div>

        {/* Vertical patient list */}
        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link to="/register" className="rounded-2xl border-2 border-dashed border-primary/40 bg-gradient-soft p-5 flex flex-col items-center justify-center gap-2 text-center hover:border-primary hover:shadow-glow transition-all min-h-[200px]">
            <div className="size-12 rounded-2xl bg-gradient-hero text-white flex items-center justify-center shadow-glow">
              <Plus className="size-6" />
            </div>
            <div className="font-semibold mt-2">{t("New patient")}</div>
            <div className="text-xs text-muted-foreground">{t("First-time registration")}</div>
          </Link>

          {filtered.map((p) => <PatientCard key={p.id} p={p} />)}

          {filtered.length === 0 && (
            <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground text-center col-span-full">
              No patients match "{q}".
            </div>
          )}
        </div>

        {/* Helpful tip */}
        <div className="mt-4 rounded-2xl bg-gradient-soft border border-border p-4 text-sm text-muted-foreground flex items-start gap-3">
          <Activity className="size-4 text-primary mt-0.5 shrink-0" />
          <p>
            <span className="text-foreground font-medium">{t("Continuous screening:")}</span>{' '}{t("each visit adds a new check-in. REFLEX AI tracks BP, weight and symptom trends across visits and escalates risk when red flags appear repeatedly — even subtle ones a single visit might miss.")}
          </p>
        </div>
      </div>
    </AppShell>
  );
}

function PatientCard({ p }: { p: Patient }) {
  useLang();
  const a = latestAnalysis(p);
  return (
    <Link to="/patient/$id" params={{ id: p.id }} className="rounded-2xl bg-card border border-border p-5 shadow-card hover:shadow-glow hover:-translate-y-0.5 transition-all flex items-center gap-4">
      <div className="size-14 rounded-2xl bg-secondary flex items-center justify-center shrink-0">
        <span className="text-lg font-bold text-muted-foreground">{p.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold truncate">{p.name}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{t("Age")} {p.age} • {t("{n} visits", { n: p.checkIns.length })}</div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {a && <span className={`size-2.5 rounded-full ${a.category === "High" ? "bg-destructive animate-pulse" : a.category === "Moderate" ? "bg-warning" : "bg-success"}`} />}
        <ArrowRight className="size-4 text-primary" />
      </div>
    </Link>
  );
}

