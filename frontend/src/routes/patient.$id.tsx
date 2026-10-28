import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  addCheckIn as saveCheckIn, bmiStatus, computeBmi, fetchPatient, latest, possibleComplications, riskDrivers,
  type Analysis, type ANCVisitData, type Band, type CheckIn, type Patient,
} from "@/lib/store";
import { errorText } from "@/lib/api";
import { BAND_LABEL, BandBadge, ChwDecision, ModuleLinks, ModelNote, UrgentBanner } from "@/components/ChwDecision";
import {
  DANGER_SIGNS, NF, NUF, POS_NEG_NOTDONE, REACTIVE_NOTDONE, REACTIVE_UNKNOWN, SF, SUGAR_UNITS,
  TA, TF, URINE_GLUCOSE, URINE_PROTEIN, YESNO,
} from "@/components/anc-fields";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Printer, Siren, FileText, Activity, Plus, TrendingDown, TrendingUp, Minus,
  ChevronRight, ChevronDown, AlertTriangle, Calendar as CalendarIcon, ArrowLeft,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Line, LineChart } from "recharts";
import { toast } from "sonner";


import { bi, t, useLang } from "@/lib/i18n";
import { looksLikeUltrasound } from "@/lib/scan-check";
export const Route = createFileRoute("/patient/$id")({
  head: () => ({ meta: [{ title: "Patient Detail — REFLEX AI Module 1" }] }),
  component: PatientDetailPage,
  notFoundComponent: () => (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">{t("Patient not found")}</h1>
        <Link to="/patients" className="text-primary mt-3 inline-block">{t("← Back to patients")}</Link>
      </div>
    </AppShell>
  ),
});

function PatientDetailPage() {
  useLang();
  const { id } = Route.useParams();
  const router = useRouter();
  const [patient, setPatient] = useState<Patient | undefined>();
  const [expandedVisit, setExpandedVisit] = useState<string | undefined>();

  useEffect(() => {
    fetchPatient(id).then(setPatient).catch((e) => toast.error(errorText(e)));
  }, [id]);

  const a = patient ? latest(patient)?.analysis : undefined;
  const scoreColor = useMemo(() => {
    if (!a) return "text-muted-foreground";
    return a.category === "High" ? "text-destructive" : a.category === "Moderate" ? "text-accent" : "text-success";
  }, [a]);

  async function addCheckIn(values: { bp: string; weight: string; symptoms: string; notes: string; date: string; anc?: ANCVisitData; ultrasound?: string }): Promise<boolean> {
    if (!patient) return false;
    if (!values.bp) { toast.error(t("Blood pressure is required")); return false; }
    if (!values.date) { toast.error(t("Visit date is required")); return false; }
    try {
      const next = await saveCheckIn(patient.id, {
        bloodPressure: values.bp,
        weight: parseFloat(values.weight) || 0,
        symptoms: values.symptoms,
        notes: values.notes,
        date: values.date ? new Date(values.date).toISOString() : undefined,
        anc: values.anc,
        ultrasound: values.ultrasound,
      });
      setPatient(next);
      toast.success(t("Check-in recorded and re-scored on the RefleX hub"));
      return true;
    } catch (e) {
      toast.error(errorText(e));
      return false;
    }
  }

  if (!patient) {
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto px-4 py-20 text-center text-muted-foreground">
          {t("Loading patient…")}
          <div className="mt-4"><Link to="/patients" className="text-primary">{t("← Back to patients")}</Link></div>
        </div>
      </AppShell>
    );
  }

  const TrendIcon = a?.trend === "worsening" ? TrendingUp : a?.trend === "improving" ? TrendingDown : Minus;
  const trendColor = a?.trend === "worsening" ? "text-destructive" : a?.trend === "improving" ? "text-success" : "text-muted-foreground";

  const trendData = patient.checkIns.map((c) => ({
    date: new Date(c.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    risk: BAND_LEVEL[c.analysis.band],
    sys: parseInt(c.bloodPressure.split("/")[0] || "0", 10),
    weight: c.weight,
  }));

  const complications = a ? possibleComplications(patient, a) : [];

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-8">
        {/* Top bar */}
        <div className="print:hidden flex items-center justify-between gap-4 flex-wrap">
          <button onClick={() => router.history.back()} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />{' '}{t("Back to list")}
          </button>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-card border border-border text-sm hover:bg-secondary">
              <Printer className="size-4" />{' '}{t("Print report")}
            </button>
            {a?.category === "High" && (
              <Link to="/referral" search={{ id: patient.id }} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive text-destructive-foreground text-sm hover:opacity-90 animate-pulse-ring">
                <Siren className="size-4" />{' '}{t("Emergency referral")}
              </Link>
            )}
          </div>
        </div>

        {/* Screen content */}
        <div className="print:hidden mt-4 space-y-6">
          {/* Score card */}
          <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <div className="text-sm text-muted-foreground">{t("Patient")}</div>
                <h1 className="text-2xl font-bold">{patient.name}</h1>
                <div className="text-xs text-muted-foreground">{t("Age")} {patient.age} • {t("{n} weeks at start", { n: patient.gestationWeeks })} • {t("{n} visits", { n: patient.checkIns.length })}</div>
                <BmiTag weight={latest(patient)?.weight} heightCm={patient.rch4?.height} />
              </div>
              {a && <StatusBadge category={a.category} />}
            </div>
            {/* Band and reasons only. A raw model probability reads as "accuracy" and its scale changes with every model. */}
            <div className="mt-6 grid sm:grid-cols-2 gap-6 items-start">
              {a && <BandPanel analysis={a} previous={patient.checkIns.length > 1 ? patient.checkIns[patient.checkIns.length - 2].analysis.band : undefined} />}
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("Why")}</div>
                {a && a.findings.length > 0 ? (
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {a.findings.slice(0, 4).map((f, i) => (
                      <li key={i} className="flex gap-2"><span className={`mt-1.5 size-2 rounded-full shrink-0 ${f.severity === "High" ? "bg-destructive" : "bg-warning"}`} />{bi(f.labelSw, f.label)}</li>
                    ))}
                  </ul>
                ) : <p className="mt-2 text-sm text-muted-foreground">{t("No red flags detected. Continue routine care.")}</p>}
                <p className="mt-4 text-sm">{a && bi(a.recommendationSw, a.recommendation)}</p>
                {a && <ModelNote analysis={a} />}
              </div>
            </div>
            {a && <UrgentBanner analysis={a} />}
          </div>

          {latest(patient) && <ChwDecision visit={latest(patient)!} onChange={setPatient} />}
          <ModuleLinks patient={patient} />

          <CheckInForm onSubmit={addCheckIn} />

          {trendData.length > 1 && (
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
                <div className="font-semibold">{t("Risk score trend")}</div>
                <div className="text-xs text-muted-foreground">{t("Risk across {n} visits", { n: trendData.length })}</div>
                <div className="mt-4 h-56">
                  <ResponsiveContainer>
                    <AreaChart data={trendData}>
                      <defs>
                        <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="oklch(0.6 0.22 25)" stopOpacity={0.55} />
                          <stop offset="100%" stopColor="oklch(0.6 0.22 25)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={11} />
                      <YAxis domain={[0.5, 4.5]} ticks={[1, 2, 3, 4]} width={72} tickFormatter={(v: number) => t(BAND_LABEL[LEVEL_BAND[v]])} stroke="var(--muted-foreground)" fontSize={11} />
                      <Tooltip formatter={(v: number) => t(BAND_LABEL[LEVEL_BAND[v]])} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} />
                      <Area type="stepAfter" dataKey="risk" stroke="oklch(0.6 0.22 25)" fill="url(#riskGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
                <div className="font-semibold">{t("Vital signs trend")}</div>
                <div className="text-xs text-muted-foreground">{t("Systolic BP & weight across visits")}</div>
                <div className="mt-4 h-56">
                  <ResponsiveContainer>
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={11} />
                      <YAxis yAxisId="l" stroke="var(--muted-foreground)" fontSize={11} />
                      <YAxis yAxisId="r" orientation="right" stroke="var(--muted-foreground)" fontSize={11} />
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} />
                      <Line yAxisId="l" type="monotone" dataKey="sys" name="Systolic BP" stroke="oklch(0.58 0.13 235)" strokeWidth={2} dot={{ r: 3 }} />
                      <Line yAxisId="r" type="monotone" dataKey="weight" name="Weight (kg)" stroke="oklch(0.66 0.11 195)" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* Findings */}
          <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
            <div className="flex items-center gap-2 font-semibold"><Activity className="size-4 text-primary" />{' '}{t("Detected red flags (latest visit)")}</div>
            <RiskDriverChips patient={patient} visit={latest(patient)} />
            <div className="mt-4 space-y-3">
              {a?.findings.length === 0 && <div className="text-sm text-muted-foreground">{t("No red flags detected. Continue routine care.")}</div>}
              {a?.findings.map((f, i) => (
                <div key={i} className="rounded-xl border border-border p-4 bg-gradient-soft">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{bi(f.labelSw, f.label)}</div>
                    <StatusBadge category={f.severity} />
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">{bi(f.noteSw, f.note)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Possible complications */}
          <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
            <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4 text-accent" />{' '}{t("Possible complications to monitor")}</div>
            <p className="text-xs text-muted-foreground mt-1">{t("Conditions to watch for, derived by fixed rules from the findings and history above. These are not model predictions.")}</p>
            <div className="mt-4 grid sm:grid-cols-2 gap-3">
              {complications.map((c, i) => (
                <div key={i} className="rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{t(c.name)}</div>
                    <StatusBadge category={c.severity} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{t(c.reason)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Visit timeline — expandable, per-day detail */}
          <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
            <div className="font-semibold flex items-center gap-2"><FileText className="size-4 text-teal" />{' '}{t("Visit history")}</div>
            <p className="text-xs text-muted-foreground mt-1">{t("Tap a date to see that day's metrics, ultrasound, AI analysis and any complications detected.")}</p>
            <div className="mt-4 space-y-2">
              {[...patient.checkIns].reverse().map((c, idx) => {
                const isOpen = expandedVisit === c.id;
                const isLatest = idx === 0;
                return (
                  <VisitItem
                    key={c.id}
                    patient={patient}
                    visit={c}
                    isOpen={isOpen}
                    isLatest={isLatest}
                    label={isLatest ? t("Most recent") : t("Visit {n}", { n: patient.checkIns.length - idx })}
                    onToggle={() => setExpandedVisit(isOpen ? undefined : c.id)}
                  />
                );
              })}
            </div>
          </div>

          {/* Profile */}
          <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
            <div className="font-semibold">{t("Profile")}</div>
            <dl className="mt-3 text-sm grid grid-cols-2 gap-y-2">
              <dt className="text-muted-foreground">{t("Complications")}</dt><dd>{patient.complications || "—"}</dd>
              <dt className="text-muted-foreground">{t("History")}</dt><dd>{patient.history || "—"}</dd>
              <dt className="text-muted-foreground">{t("Registered")}</dt><dd>{new Date(patient.createdAt).toLocaleDateString()}</dd>
              {patient.rch4?.clinicName && <><dt className="text-muted-foreground">{t("Clinic")}</dt><dd>{patient.rch4.clinicName}</dd></>}
              {patient.rch4?.rchNumber && <><dt className="text-muted-foreground">{t("RCH number")}</dt><dd>{patient.rch4.rchNumber}</dd></>}
              {patient.rch4?.village && <><dt className="text-muted-foreground">{t("Village / ward")}</dt><dd>{[patient.rch4.village, patient.rch4.ward, patient.rch4.district].filter(Boolean).join(", ")}</dd></>}
              {patient.rch4?.phone && <><dt className="text-muted-foreground">{t("Phone")}</dt><dd>{patient.rch4.phone}</dd></>}
              {patient.rch4?.partnerName && <><dt className="text-muted-foreground">{t("Partner")}</dt><dd>{[patient.rch4.partnerName, patient.rch4.partnerAge ? `${patient.rch4.partnerAge} yrs` : "", patient.rch4.partnerOccupation].filter(Boolean).join(" • ")}</dd></>}
              {patient.rch4?.gravida && <><dt className="text-muted-foreground">{t("Gravida / Para")}</dt><dd>G{patient.rch4.gravida} P{patient.rch4.para || 0} • {patient.rch4.livingChildren || 0} {t("living")}{patient.rch4.abortions ? ` • ${patient.rch4.abortions} abortion(s)` : ""}</dd></>}
              {patient.rch4?.lmp && <><dt className="text-muted-foreground">{t("LMP / EDD")}</dt><dd>{patient.rch4.lmp} → {patient.rch4.edd || "—"}</dd></>}
              {patient.rch4?.bloodGroup && <><dt className="text-muted-foreground">{t("Blood group")}</dt><dd>{patient.rch4.bloodGroup} {patient.rch4.rhesus || ""}</dd></>}
              {patient.rch4?.deliveryPlace && <><dt className="text-muted-foreground">{t("Birth plan")}</dt><dd>{[patient.rch4.deliveryPlace, patient.rch4.transportPlan && `transport: ${patient.rch4.transportPlan}`, patient.rch4.bloodDonor && `donor: ${patient.rch4.bloodDonor}`].filter(Boolean).join(" • ")}</dd></>}

            </dl>
          </div>
        </div>

        {/* Print-only clinical report */}
        <PrintReport patient={patient} />
      </div>
    </AppShell>
  );
}

function VisitItem({ patient, visit, isOpen, isLatest, label, onToggle }: {
  patient: Patient; visit: CheckIn; isOpen: boolean; isLatest: boolean; label: string; onToggle: () => void;
}) {
  useLang();
  const comps = possibleComplications(patient, visit.analysis);
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button onClick={onToggle} className="w-full flex flex-wrap items-center gap-4 justify-between p-4 hover:bg-secondary/50 text-left">
        <div className="flex items-center gap-3 min-w-0">
          {isOpen ? <ChevronDown className="size-4 text-muted-foreground shrink-0" /> : <ChevronRight className="size-4 text-muted-foreground shrink-0" />}
          <div className="min-w-0">
            <div className="font-medium">{new Date(visit.date).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" })}</div>
            <div className="text-xs text-muted-foreground">{t(label)} • BP {visit.bloodPressure} • {visit.weight}kg</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <BandBadge band={visit.analysis.band} />
        </div>
      </button>
      {isOpen && (
        <div className="border-t border-border p-4 bg-gradient-soft space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{t("Visit summary")}</div>
              <dl className="text-sm grid grid-cols-[120px_1fr] gap-y-1.5">
                <dt className="text-muted-foreground">{t("Visit date")}</dt><dd>{new Date(visit.date).toLocaleString()}</dd>
                <dt className="text-muted-foreground">{t("Visit number")}</dt><dd>{visit.anc?.visitNumber || "—"}</dd>
                <dt className="text-muted-foreground">{t("Symptoms")}</dt><dd>{visit.symptoms || "—"}</dd>
                <dt className="text-muted-foreground">{t("Provider")}</dt><dd>{visit.anc?.provider || "—"}</dd>
              </dl>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{t("Ultrasound")}</div>
              <div className="aspect-video rounded-xl overflow-hidden bg-secondary flex items-center justify-center">
                {visit.ultrasound || patient.ultrasound ? (
                  <img src={visit.ultrasound || patient.ultrasound} alt="Ultrasound" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-xs text-muted-foreground p-4 text-center">{t("No scan attached to this visit")}</div>
                )}
              </div>
            </div>
          </div>

          <VisitClinicalGrid patient={patient} visit={visit} />
          <RiskDriverChips patient={patient} visit={visit} />

          <div>

            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{t("AI analysis result")}</div>
            <div className="text-sm"><span className="font-semibold">{t("Risk:")}</span> {t(BAND_LABEL[visit.analysis.band])}</div>
            <div className="text-sm mt-1"><span className="font-semibold">{t("Recommendation:")}</span> {bi(visit.analysis.recommendationSw, visit.analysis.recommendation)}</div>
            {visit.analysis.findings.length > 0 ? (
              <div className="mt-2">
                <div className="text-xs font-semibold text-muted-foreground">{t("Red flags detected:")}</div>
                <ul className="mt-1 text-sm list-disc list-inside space-y-0.5">
                  {visit.analysis.findings.map((f, i) => (
                    <li key={i}><span className="font-medium">{bi(f.labelSw, f.label)}</span> — <span className="text-muted-foreground">{bi(f.noteSw, f.note)}</span></li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground mt-2">{t("No red flags detected this day.")}</div>
            )}
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{t("Complications detected this day")}</div>
            <div className="grid sm:grid-cols-2 gap-2">
              {comps.map((c, i) => (
                <div key={i} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm">{t(c.name)}</div>
                    <StatusBadge category={c.severity} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{t(c.reason)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PrintReport({ patient }: { patient: Patient }) {
  useLang();
  const a = latest(patient)?.analysis;
  const comps = a ? possibleComplications(patient, a) : [];
  return (
    <div className="hidden print:block" style={{ fontFamily: "Inter, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #0d9488", paddingBottom: 8, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{t("REFLEX AI Module 1 — Prenatal Risk Report")}</div>
          <div style={{ fontSize: 11, color: "#555" }}>{t("Model")} {latest(patient)?.analysis.modelVersion ?? "—"} ({t("not clinically validated")}) • {new Date().toLocaleString()}</div>
        </div>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 700, margin: "12px 0 6px" }}>{t("Patient")}</h2>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <tbody>
          <tr><td style={cellL}>{t("Name")}</td><td style={cell}>{patient.name}</td><td style={cellL}>{t("Age")}</td><td style={cell}>{patient.age}</td></tr>
          <tr><td style={cellL}>{t("Gestation at start")}</td><td style={cell}>{t("{n} weeks", { n: patient.gestationWeeks })}</td><td style={cellL}>{t("Visits")}</td><td style={cell}>{patient.checkIns.length}</td></tr>
          <tr><td style={cellL}>{t("History")}</td><td style={cell}>{patient.history || "—"}</td><td style={cellL}>{t("Known complications")}</td><td style={cell}>{patient.complications || "—"}</td></tr>
        </tbody>
      </table>

      {a && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "16px 0 6px" }}>{t("Current Risk Assessment")}</h2>
          <p style={{ fontSize: 13 }}><b>{t("Risk:")}</b> {t(BAND_LABEL[a.band])}</p>
          <p style={{ fontSize: 13 }}><b>{t("Recommendation:")}</b> {bi(a.recommendationSw, a.recommendation)}</p>

          <h3 style={{ fontSize: 13, fontWeight: 700, margin: "10px 0 4px" }}>{t("Red flags (latest visit)")}</h3>
          {a.findings.length ? (
            <ul style={{ fontSize: 12, margin: 0, paddingLeft: 18 }}>
              {a.findings.map((f, i) => <li key={i}><b>{bi(f.labelSw, f.label)}</b> ({t(f.severity)}) — {bi(f.noteSw, f.note)}</li>)}
            </ul>
          ) : <p style={{ fontSize: 12 }}>{t("None detected.")}</p>}

          <h3 style={{ fontSize: 13, fontWeight: 700, margin: "10px 0 4px" }}>{t("Possible complications")}</h3>
          <ul style={{ fontSize: 12, margin: 0, paddingLeft: 18 }}>
            {comps.map((c, i) => <li key={i}><b>{t(c.name)}</b> ({t(c.severity)}) — {t(c.reason)}</li>)}
          </ul>
        </>
      )}

      <h2 style={{ fontSize: 16, fontWeight: 700, margin: "16px 0 6px" }}>{t("Visit History")}</h2>
      <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={cellH}>{t("Date")}</th><th style={cellH}>{t("BP")}</th><th style={cellH}>{t("Weight")}</th>
            <th style={cellH}>{t("Symptoms")}</th><th style={cellH}>{t("Risk")}</th><th style={cellH}>{t("Category")}</th>
          </tr>
        </thead>
        <tbody>
          {[...patient.checkIns].reverse().map((c) => (
            <tr key={c.id}>
              <td style={cell}>{new Date(c.date).toLocaleDateString()}</td>
              <td style={cell}>{c.bloodPressure}</td>
              <td style={cell}>{c.weight} kg</td>
              <td style={cell}>{c.symptoms || "—"}</td>
              <td style={cell}>{t(BAND_LABEL[c.analysis.band])}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ fontSize: 10, color: "#777", marginTop: 24, borderTop: "1px solid #ddd", paddingTop: 8 }}>
        {t("Generated by REFLEX AI Module 1. This decision-support report does not replace clinical judgement.")}
      </p>
    </div>
  );
}

const cell: React.CSSProperties = { border: "1px solid #ddd", padding: "4px 8px", verticalAlign: "top" };
const cellL: React.CSSProperties = { ...cell, background: "#f3f4f6", fontWeight: 600, width: "18%" };
const cellH: React.CSSProperties = { ...cell, background: "#0d9488", color: "#fff", fontWeight: 700, textAlign: "left" };

function CheckInForm({ onSubmit }: { onSubmit: (v: { bp: string; weight: string; symptoms: string; notes: string; date: string; anc: ANCVisitData; ultrasound?: string }) => Promise<boolean> }) {
  useLang();
  const [bp, setBp] = useState("");
  const [weight, setWeight] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [anc, setAnc] = useState<ANCVisitData>({});
  const [ultrasound, setUltrasound] = useState<string>("");
  const [danger, setDanger] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  const v = <K extends keyof ANCVisitData>(k: K) => (val: string) => setAnc((s) => ({ ...s, [k]: val }));

  function reset() {
    setBp(""); setWeight(""); setSymptoms(""); setNotes(""); setAnc({}); setDanger([]); setUltrasound("");
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!date) { toast.error(t("Visit date is required")); return; }
        const symptomText = [symptoms, ...danger].filter(Boolean).join(", ");
        onSubmit({ bp, weight, symptoms: symptomText, notes, date, anc: { ...anc, dangerSigns: danger }, ultrasound: ultrasound || undefined })
          .then((ok) => { if (ok) reset(); }); // on failure the answers stay in the form
      }}
      className="rounded-2xl overflow-hidden shadow-glow ring-4 ring-primary/20"
    >
      <div className="bg-gradient-hero text-white p-6 lg:p-8 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold"><Plus className="size-5" />{' '}{t("New ANC visit (RCH4)")}</div>
            <p className="text-sm opacity-90 mt-1">{t("Recorded as a separate visit — previous visits are never overwritten.")}</p>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-xs"><CalendarIcon className="size-3.5" />{' '}{t("Continuous screening")}</div>
        </div>
        <div className="grid sm:grid-cols-4 gap-3">
          <label className="text-xs opacity-90 flex flex-col gap-1">
            {t("Visit date *")}
            <input value={date} onChange={(e) => setDate(e.target.value)} type="date" className={hiCls} />
          </label>
          <label className="text-xs opacity-90 flex flex-col gap-1">
            {t("Visit number")}
            <input value={anc.visitNumber || ""} onChange={(e) => v("visitNumber")(e.target.value)} placeholder="e.g. 3" className={hiCls} />
          </label>
          <label className="text-xs opacity-90 flex flex-col gap-1">
            {t("Blood pressure *")}
            <input value={bp} onChange={(e) => setBp(e.target.value)} placeholder="e.g. 130/85" className={hiCls} />
          </label>
          <label className="text-xs opacity-90 flex flex-col gap-1">
            {t("Weight (kg)")}
            <input value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="65" type="number" className={hiCls} />
          </label>
        </div>
        <div className="grid sm:grid-cols-4 gap-3">
          <label className="text-xs opacity-90 flex flex-col gap-1">
            {t("Gestation (weeks)")}
            <input value={anc.gestationWeeks || ""} onChange={(e) => v("gestationWeeks")(e.target.value)} type="number" placeholder="28" className={hiCls} />
          </label>
          <label className="text-xs opacity-90 flex flex-col gap-1">
            {t("Temperature (°C)")}
            <input value={anc.temperature || ""} onChange={(e) => v("temperature")(e.target.value)} type="number" placeholder="36.8" className={hiCls} />
          </label>
          <label className="text-xs opacity-90 flex flex-col gap-1">
            {t("Pulse (bpm)")}
            <input value={anc.pulse || ""} onChange={(e) => v("pulse")(e.target.value)} type="number" placeholder="80" className={hiCls} />
          </label>
          <label className="text-xs opacity-90 flex flex-col gap-1">
            {t("MUAC (cm)")}
            <input value={anc.muac || ""} onChange={(e) => v("muac")(e.target.value)} type="number" placeholder="24" className={hiCls} />
          </label>
        </div>
        <div>
          <div className="text-xs opacity-90">{t("Danger signs today")}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {DANGER_SIGNS.map((s) => {
              const on = danger.includes(s);
              return (
                <button key={s} type="button"
                  onClick={() => setDanger((d) => d.includes(s) ? d.filter((x) => x !== s) : [...d, s])}
                  className={`px-3 py-1.5 rounded-full text-xs border transition ${on ? "bg-white text-destructive border-white font-semibold" : "bg-white/10 border-white/30 hover:bg-white/20"}`}>
                  {t(s)}
                </button>
              );
            })}
          </div>
        </div>
        <textarea value={symptoms} onChange={(e) => setSymptoms(e.target.value)} rows={2} placeholder="Other complaints / symptoms" className="w-full px-3 py-2 rounded-lg bg-white/15 placeholder-white/70 text-white text-sm outline-none focus:bg-white/25 resize-none" />
      </div>

      <div className="bg-card border-x border-b border-border">
        <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-6 py-3 text-sm font-medium hover:bg-secondary/50">
          <span>{t("RCH4 examination, investigations & services")} {open ? "" : t("(optional)")}</span>
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        {open && (
          <div className="px-6 pb-6 space-y-5">
            <SubSection title="Obstetric examination">
              <TF label="Fundal height (cm)" value={anc.fundalHeight || ""} onChange={v("fundalHeight")} type="number" />
              <SF label="Presentation" value={anc.presentation || ""} onChange={v("presentation")} options={["Cephalic", "Breech", "Transverse", "Not palpable"]} />
              <TF label="Fetal heart rate (bpm)" value={anc.fetalHeartRate || ""} onChange={v("fetalHeartRate")} type="number" />
              <SF label="Fetal movement" value={anc.fetalMovement || ""} onChange={v("fetalMovement")} options={["Present", "Reduced", "Absent"]} />
              <SF label="Oedema" value={anc.oedema || ""} onChange={v("oedema")} options={["None", "Mild", "Moderate", "Severe"]} />
            </SubSection>
            <SubSection title="Investigations">
              <NF label="Haemoglobin (Hb)" value={anc.hb || ""} onChange={v("hb")} placeholder="e.g., 11.5" suffix="g/dL" step="0.1" />
              <SF label="Urine protein" value={anc.urineProtein || ""} onChange={v("urineProtein")} options={URINE_PROTEIN} />
              <SF label="Urine glucose" value={anc.urineGlucose || ""} onChange={v("urineGlucose")} options={URINE_GLUCOSE} />
              <NUF label="Blood sugar" value={anc.bloodSugar || ""} onChange={v("bloodSugar")}
                unit={anc.bloodSugarUnit || "mmol/L"} onUnitChange={v("bloodSugarUnit")} units={SUGAR_UNITS} placeholder="e.g., 5.4" />
              <SF label="Malaria (mRDT / BS)" value={anc.malariaTest || ""} onChange={v("malariaTest")} options={POS_NEG_NOTDONE} />
              <SF label="HIV re-test" value={anc.hivTest || ""} onChange={v("hivTest")} options={REACTIVE_UNKNOWN} />
              <SF label="Syphilis (VDRL / RPR)" value={anc.syphilisTest || ""} onChange={v("syphilisTest")} options={REACTIVE_NOTDONE} />
              <SF label="Hepatitis B (HBsAg)" value={anc.hepatitisB || ""} onChange={v("hepatitisB")} options={POS_NEG_NOTDONE} />
            </SubSection>
            <SubSection title="Services given">
              <SF label="TT / Td dose" value={anc.ttDose || ""} onChange={v("ttDose")} options={["TT1", "TT2", "TT3", "TT4", "TT5", "Not given"]} />
              <SF label="IPTp-SP dose" value={anc.iptpDose || ""} onChange={v("iptpDose")} options={["IPTp1", "IPTp2", "IPTp3", "IPTp4", "Not given"]} />
              <SF label="Iron & folic acid" value={anc.ironFolate || ""} onChange={v("ironFolate")} options={YESNO} />
              <SF label="Albendazole" value={anc.albendazole || ""} onChange={v("albendazole")} options={YESNO} />
              <SF label="ITN issued" value={anc.itnGiven || ""} onChange={v("itnGiven")} options={YESNO} />
              <SF label="ARV / PMTCT" value={anc.arvGiven || ""} onChange={v("arvGiven")} options={["Not applicable", "Yes", "No"]} />
            </SubSection>
            <SubSection title="Plan & follow-up">
              <TF label="Next visit date" value={anc.nextVisitDate || ""} onChange={v("nextVisitDate")} type="date" />
              <SF label="Referred today" value={anc.referred || ""} onChange={v("referred")} options={YESNO} />
              <TF label="Provider name" value={anc.provider || ""} onChange={v("provider")} />
              <TA label="Counselling given" value={anc.counselling || ""} onChange={v("counselling")} placeholder="Nutrition, danger signs, birth preparedness..." />
              <TA label="Worker notes" value={notes} onChange={setNotes} placeholder="Notes for this visit" />
            </SubSection>
            <SubSection title="Ultrasound / scan image">
              <UltrasoundUpload value={ultrasound} onChange={setUltrasound} />
            </SubSection>
          </div>
        )}
        <div className="px-6 pb-6">
          <button type="submit" className="w-full px-4 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90">{t("Save visit & analyze")}</button>
        </div>
      </div>
    </form>
  );
}

const hiCls = "px-3 py-2 rounded-lg bg-white/15 placeholder-white/70 text-white text-sm outline-none focus:bg-white/25 [color-scheme:dark]";

/** Per-visit ultrasound uploader (stored with this visit only). */
function UltrasoundUpload({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  useLang();
  return (
    <div className="sm:col-span-2 lg:col-span-3">
      <label className="text-sm font-medium">{t("Upload ultrasound image for this visit (optional)")}</label>
      <div className="mt-2 grid sm:grid-cols-[1fr_240px] gap-4 items-start">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const reader = new FileReader();
            const input = e.target;
            reader.onload = async () => {
              const url = String(reader.result || "");
              if (!(await looksLikeUltrasound(url)) && !window.confirm(t("This doesn't look like an ultrasound scan. Upload anyway?"))) { input.value = ""; return; }
              onChange(url);
            };
            reader.readAsDataURL(f);
          }}
          className="w-full text-sm file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:text-sm px-3 py-2 rounded-lg bg-background border border-input"
        />
        <div className="aspect-video rounded-xl overflow-hidden bg-secondary grid place-items-center border border-border">
          {value ? (
            <img src={value} alt="Ultrasound preview" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs text-muted-foreground px-3 text-center">{t("No scan attached to this visit")}</span>
          )}
        </div>
      </div>
      {value && (
        <button type="button" onClick={() => onChange("")} className="mt-2 text-xs text-destructive underline">Remove image</button>
      )}
    </div>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  useLang();
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t(title)}</div>
      <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
    </div>
  );
}

/** BMI tag for the patient header. */
function BmiTag({ weight, heightCm }: { weight?: number; heightCm?: string }) {
  useLang();
  const bmi = computeBmi(weight, heightCm);
  if (bmi === undefined) return null;
  const st = bmiStatus(bmi);
  const tone = st.category === "High" ? "bg-destructive/10 text-destructive border-destructive/30"
    : st.category === "Moderate" ? "bg-accent/10 text-accent border-accent/30"
      : "bg-success/10 text-success border-success/30";
  return (
    <div className="mt-2 inline-flex items-center gap-2 text-xs">
      <span className="px-2.5 py-1 rounded-full border border-border bg-secondary font-medium">BMI {bmi} kg/m²</span>
      <span className={`px-2.5 py-1 rounded-full border font-medium ${tone}`}>{st.label}</span>
    </div>
  );
}

/** Bulleted alert chips naming the exact parameters driving the risk. */
function RiskDriverChips({ patient, visit }: { patient: Patient; visit?: CheckIn }) {
  useLang();
  if (!visit) return null;
  const drivers = riskDrivers(patient, visit);
  if (drivers.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{t("Risk drivers")}</div>
      <ul className="flex flex-wrap gap-2">
        {drivers.map((d, i) => {
          const tone = d.severity === "High" ? "bg-destructive/10 text-destructive border-destructive/30"
            : d.severity === "Moderate" ? "bg-accent/10 text-accent border-accent/30"
              : "bg-success/10 text-success border-success/30";
          return (
            <li key={i} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs ${tone}`}>
              <span className="size-1.5 rounded-full bg-current" />
              <span className="font-semibold">{t(d.label)}:</span> <span>{d.value}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ParamGroup({ title, rows }: { title: string; rows: [string, string | undefined][] }) {
  useLang();
  const filled = rows.filter(([, v]) => v !== undefined && v !== "" );
  if (filled.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t(title)}</div>
      <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {filled.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1">
            <dt className="text-muted-foreground">{t(k)}</dt>
            <dd className="font-medium text-right">{t(v ?? "")}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** All clinical parameters recorded on a given visit, grouped RCH4-style. */
function VisitClinicalGrid({ patient, visit }: { patient: Patient; visit: CheckIn }) {
  useLang();
  const anc: ANCVisitData = visit.anc || {};
  const bmi = computeBmi(visit.weight, patient.rch4?.height);
  const weightTxt = visit.weight
    ? `${visit.weight} kg${bmi !== undefined ? ` • BMI ${bmi} (${bmiStatus(bmi).label})` : ""}`
    : undefined;

  return (
    <div className="space-y-3">
      {anc.dangerSigns && anc.dangerSigns.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {anc.dangerSigns.map((s) => (
            <span key={s} className="px-2.5 py-1 rounded-full text-[11px] bg-destructive/10 text-destructive border border-destructive/30">{t(s)}</span>
          ))}
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-3">
        <ParamGroup title="Vitals & physical exam" rows={[
          ["Gestational age", anc.gestationWeeks ? t("{n} weeks", { n: anc.gestationWeeks }) : undefined],
          ["Blood pressure", visit.bloodPressure ? `${visit.bloodPressure} mmHg` : undefined],
          ["Weight & BMI", weightTxt],
          ["Pulse", anc.pulse ? `${anc.pulse} bpm` : undefined],
          ["Temperature", anc.temperature ? `${anc.temperature} °C` : undefined],
          ["MUAC", anc.muac ? `${anc.muac} cm` : undefined],
          ["Fundal height", anc.fundalHeight ? `${anc.fundalHeight} cm` : undefined],
          ["Fetal heart rate", anc.fetalHeartRate ? `${anc.fetalHeartRate} bpm` : undefined],
          ["Fetal presentation", anc.presentation],
          ["Fetal movement", anc.fetalMovement],
          ["Oedema", anc.oedema],
        ]} />
        <ParamGroup title="Laboratory investigations" rows={[
          ["Haemoglobin", anc.hb ? `${anc.hb} g/dL` : undefined],
          ["Urine protein", anc.urineProtein],
          ["Urine glucose", anc.urineGlucose],
          ["Blood sugar", anc.bloodSugar ? `${anc.bloodSugar} ${anc.bloodSugarUnit || "mmol/L"}` : undefined],
          ["Malaria (mRDT)", anc.malariaTest],
          ["HIV / PMTCT", anc.hivTest],
          ["Syphilis", anc.syphilisTest],
          ["Hepatitis B (HBsAg)", anc.hepatitisB],
        ]} />
        <ParamGroup title="Preventive services" rows={[
          ["IPTp-SP dose", anc.iptpDose],
          ["TT / Td dose", anc.ttDose],
          ["Iron & folic acid", anc.ironFolate],
          ["Deworming (albendazole)", anc.albendazole],
          ["ITN issued", anc.itnGiven],
          ["ARV / PMTCT", anc.arvGiven],
        ]} />
        <ParamGroup title="Plan & follow-up" rows={[
          ["Next visit date", anc.nextVisitDate],
          ["Referral status", anc.referred ? (/yes/i.test(anc.referred) ? "Referred" : "Not referred") : undefined],
          ["Provider name", anc.provider],
          ["Counselling notes", anc.counselling],
          ["Worker notes", visit.notes],
        ]} />
      </div>
    </div>
  );
}




const BAND_LEVEL: Record<Band, number> = { low: 1, medium: 2, high: 3, urgent: 4 };
const LEVEL_BAND: Record<number, Band> = { 1: "low", 2: "medium", 3: "high", 4: "urgent" };
const BAND_TONE: Record<Band, string> = {
  low: "bg-success/10 border-success/40 text-success",
  medium: "bg-warning/15 border-warning/50 text-warning-foreground",
  high: "bg-destructive/10 border-destructive/50 text-destructive",
  urgent: "bg-destructive border-destructive text-destructive-foreground",
};

/** The headline is the band, never the model's raw probability. */
function BandPanel({ analysis, previous }: { analysis: Analysis; previous?: Band }) {
  useLang();
  const b = analysis.band;
  const moved = previous && previous !== b ? (BAND_LEVEL[b] > BAND_LEVEL[previous] ? "up" : "down") : undefined;
  return (
    <div className={`rounded-2xl border-2 p-5 ${BAND_TONE[b]}`}>
      <div className="text-xs font-semibold uppercase tracking-wider opacity-80">{t("Risk level")}</div>
      <div className="text-4xl font-extrabold mt-1">{t(BAND_LABEL[b])}</div>
      {moved && (
        <div className="mt-2 text-sm font-medium">
          {moved === "up" ? t("Up from {band} at the last visit", { band: t(BAND_LABEL[previous!]) }) : t("Down from {band} at the last visit", { band: t(BAND_LABEL[previous!]) })}
        </div>
      )}
      {analysis.ruleOverride && <div className="mt-2 text-sm">{t("Set by a danger-sign rule, not the model.")}</div>}
    </div>
  );
}
