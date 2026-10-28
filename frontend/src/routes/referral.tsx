import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { finalBand, latest, latestAnalysis, loadPatients, type Patient } from "@/lib/store";
import { api, errorText } from "@/lib/api";
import { Siren, Phone, MapPin, Send, WifiOff, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { bi, t, useLang } from "@/lib/i18n";
import { BAND_LABEL } from "@/components/ChwDecision";
const search = z.object({ id: z.string().optional() });

export const Route = createFileRoute("/referral")({
  validateSearch: (s) => search.parse(s),
  head: () => ({ meta: [{ title: "Emergency Referral — REFLEX AI Module 1" }] }),
  component: ReferralPage,
});

// Placeholders: set the real facilities and numbers for each ward before deployment.
const hospitals = [
  { name: "Health centre (set for this ward)", distance: "— km", phone: "", beds: null, specialty: "BEmONC" },
  { name: "District hospital (set for this ward)", distance: "— km", phone: "", beds: null, specialty: "CEmONC, caesarean" },
];

function ReferralPage() {
  useLang();
  const { id } = Route.useSearch();
  const [patient, setPatient] = useState<Patient | undefined>();
  const [highRisk, setHighRisk] = useState<Patient[]>([]);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    loadPatients().then((all) => {
      const isHigh = (p: Patient) => { const c = latest(p); return !!c && ["high", "urgent"].includes(finalBand(c)); };
      setHighRisk(all.filter(isHigh));
      setPatient((id && all.find((p) => p.id === id)) || all.find(isHigh));
    }).catch((e) => toast.error(errorText(e)));
  }, [id]);
  useEffect(() => { setSent(!!patient && !!latest(patient)?.referral && latest(patient)!.referral!.status !== "created"); }, [patient]);

  async function sendAlert() {
    const c = patient && latest(patient);
    if (!c) return;
    try {
      if (!c.referral) await api("POST", `/api/v1/assessments/${c.assessmentId}/review`, { decision: "accept" });
      await api("POST", `/api/v1/referrals/${c.assessmentId}/status`, { status: "sent" });
      setSent(true);
      toast.success(t("Referral marked as sent on the hub. (SMS is not connected in this prototype.)"));
    } catch (e) { toast.error(errorText(e)); }
  }

  const a = patient ? latestAnalysis(patient) : undefined;
  const l = patient ? latest(patient) : undefined;

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-2xl bg-destructive/15 text-destructive flex items-center justify-center animate-pulse-ring">
            <Siren className="size-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("Emergency Referral Center")}</h1>
            <p className="text-muted-foreground text-sm flex items-center gap-1.5"><WifiOff className="size-3.5 text-accent" />{' '}{t("Referrals are tracked on the RefleX hub. SMS sending is roadmap, not connected yet")}</p>
          </div>
        </div>

        {!patient ? (
          <div className="rounded-2xl bg-card border border-border p-12 text-center text-muted-foreground">
            {t("No high-risk mothers right now.")}
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6">
                <div className="text-xs font-semibold text-destructive uppercase tracking-wider">{t("High-priority alert")}</div>
                <h2 className="text-xl font-bold mt-1">{patient.name} • {a ? t(BAND_LABEL[a.band]) : ""}</h2>
                <p className="text-sm text-muted-foreground mt-1">{a && bi(a.recommendationSw, a.recommendation)}</p>
              </div>

              <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
                <div className="font-semibold mb-3">{t("SMS preview")}</div>
                <div className="rounded-2xl bg-secondary p-4 max-w-md font-mono text-sm whitespace-pre-line">
{`🚨 REFLEX AI URGENT
Patient: ${patient.name}, age ${patient.age}
${patient.gestationWeeks}w gestation, BP ${l?.bloodPressure ?? "—"}
Risk: ${a ? BAND_LABEL[a.band] : "—"}
Findings: ${a?.findings.map((f) => f.label).join(", ") || "—"}
Sender: RefleX hub`}
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <button
                    onClick={sendAlert} disabled={sent}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-destructive text-destructive-foreground font-medium hover:opacity-90 disabled:opacity-60"
                  >
                    {sent ? <CheckCircle2 className="size-4" /> : <Send className="size-4" />}
                    {sent ? "Referral sent" : "Mark referral as sent"}
                  </button>
                  <span className="text-xs text-muted-foreground">{t("Preview of the message a facility would receive")}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="font-semibold flex items-center gap-2"><MapPin className="size-4 text-teal" />{' '}{t("Nearest referral hospitals")}</div>
              {hospitals.map((h) => (
                <div key={h.name} className="rounded-2xl bg-card border border-border p-4 shadow-card">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{t(h.name)}</div>
                      <div className="text-xs text-muted-foreground">{t(h.specialty)}</div>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-teal/15 text-teal">{h.distance}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t("Bed availability not connected")}</span>
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Phone className="size-3" /> {h.phone || "add number"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="font-semibold mb-3">{t("High-risk queue ({n})", { n: highRisk.length })}</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {highRisk.map((p) => {
              const pa = latestAnalysis(p);
              const pl = latest(p);
              return (
                <button key={p.id} onClick={() => setPatient(p)} className={`text-left rounded-2xl border p-4 ${patient?.id === p.id ? "border-destructive bg-destructive/5" : "border-border bg-card"} hover:shadow-card`}>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{t("{n} weeks", { n: p.gestationWeeks })} • BP {pl?.bloodPressure ?? "—"} • {pa ? t(BAND_LABEL[pa.band]) : ""}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
