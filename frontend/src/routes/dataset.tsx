import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { BrainCircuit, Cpu, ShieldAlert, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";

import { t, useLang } from "@/lib/i18n";
// This page used to show unsupported numbers (94.2% accuracy, 11 nations, 38 clinics).
// It now shows only what the hub itself reports, so nothing on screen can outrun the evidence.
export const Route = createFileRoute("/dataset")({
  head: () => ({ meta: [{ title: "Model & data — RefleX" }] }),
  component: DatasetPage,
});

type Status = {
  appRamMb: number; totalRamMb: number; usedRamMb: number; cpuTempC: number | null; uptimeMin: number; modelLoadMs: number;
  model: { model_version: string; trained_on: string; label: string; test_auc_on_synthetic?: number; test_auc?: number; features: string[] };
  counts: Record<string, number>;
};

function DatasetPage() {
  useLang();
  const [s, setS] = useState<Status>();
  useEffect(() => { api<Status>("GET", "/api/v1/status").then(setS).catch(() => {}); }, []);
  const synthetic = s?.model.trained_on?.toUpperCase().includes("SYNTHETIC");

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("Model & data")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t("What the risk model is, what it was trained on, and what it can't do yet. Read live from the hub.")}</p>
        </div>

        {synthetic && (
          <div className="rounded-2xl border border-accent bg-accent/10 p-5 flex gap-3">
            <ShieldAlert className="size-5 text-accent shrink-0" />
            <div className="text-sm">
              <b>{t("Placeholder model.")}</b>{' '}{t("The model running now was trained on synthetic data to prove the pipeline works on a Raspberry Pi. Its numbers say nothing about real mothers. The team's model trained on Tanzania DHS data replaces it.")}
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
            <div className="flex items-center gap-2 font-semibold"><BrainCircuit className="size-4 text-primary" />{' '}{t("Pregnancy risk model")}</div>
            <dl className="mt-3 text-sm grid grid-cols-[140px_1fr] gap-y-2">
              <dt className="text-muted-foreground">{t("Version")}</dt><dd>{s?.model.model_version ?? "—"}</dd>
              <dt className="text-muted-foreground">{t("Trained on")}</dt><dd>{s?.model.trained_on ? t(s.model.trained_on) : "—"}</dd>
              <dt className="text-muted-foreground">{t("Predicts")}</dt><dd>{s?.model.label ? t(s.model.label) : "—"}</dd>
              <dt className="text-muted-foreground">{t("Held-out AUC")}</dt><dd>{s?.model.test_auc ?? (s?.model.test_auc_on_synthetic !== undefined ? `${s.model.test_auc_on_synthetic} ${t("(synthetic, meaningless clinically)")}` : "—")}</dd>
              <dt className="text-muted-foreground">{t("Inputs")}</dt><dd>{t("{n} things a CHW can collect at a home visit", { n: s?.model.features.length ?? "—" })}</dd>
            </dl>
            <p className="text-xs text-muted-foreground mt-3">{t("Type: gradient-boosted trees (XGBoost). Each result lists the top reasons it raised the risk.")}</p>
          </div>
          <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
            <div className="flex items-center gap-2 font-semibold"><Cpu className="size-4 text-teal" />{' '}{t("This hub right now")}</div>
            <dl className="mt-3 text-sm grid grid-cols-[160px_1fr] gap-y-2">
              <dt className="text-muted-foreground">{t("RefleX memory use")}</dt><dd>{s ? `${s.appRamMb} MB` : "—"}</dd>
              <dt className="text-muted-foreground">{t("Device memory")}</dt><dd>{s ? `${s.usedRamMb} / ${s.totalRamMb} MB` : "—"}</dd>
              <dt className="text-muted-foreground">{t("CPU temperature")}</dt><dd>{s?.cpuTempC ? `${s.cpuTempC.toFixed(0)} °C` : "—"}</dd>
              <dt className="text-muted-foreground">{t("Model load time")}</dt><dd>{s ? `${s.modelLoadMs} ms` : "—"}</dd>
              <dt className="text-muted-foreground">{t("Records")}</dt><dd>{s ? t("{p} people, {a} assessments", { p: s.counts.person, a: s.counts.assessment }) : "—"}</dd>
            </dl>
          </div>
        </div>

        <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
          <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-success" />{' '}{t("Safeguards that don't depend on the model")}</div>
          <ul className="mt-3 text-sm list-disc list-inside space-y-1">
            <li>{t("Any danger sign (bleeding, fits, severe headache, blurred vision…) or BP ≥ 160/110 makes the result URGENT, whatever the model says.")}</li>
            <li>{t("Postpartum depression uses the EPDS questionnaire scored by fixed rules. Question 10 (self-harm) triggers a same-day alert at any total score.")}</li>
            <li>{t("Child development is guidance for parents. No score or diagnosis is ever shown.")}</li>
            <li>{t("The CHW accepts or overrides every flag, with a reason.")}</li>
            <li>{t("Nothing is saved without consent, recorded per module.")}</li>
          </ul>
        </div>

        <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
          <div className="font-semibold">{t("Not done yet")}</div>
          <ul className="mt-3 text-sm list-disc list-inside space-y-1 text-muted-foreground">
            <li>{t("No clinical validation. Thresholds need a clinician's sign-off.")}</li>
            <li>{t("Swahili text is a draft; the EPDS needs its validated Swahili version.")}</li>
            <li>{t("One hub, no sync between devices, no SMS, no login.")}</li>
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
