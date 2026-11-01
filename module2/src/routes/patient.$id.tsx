import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  appendCheckIn, bmiStatus, computeBmi, getPatient, latest, riskDrivers,
  savePatient, seedDemoIfEmpty, type ANCVisitData, type CheckIn, type Patient,
} from "@/lib/store";
import {
  DANGER_SIGNS, NF, NUF, POS_NEG_NOTDONE, REACTIVE_NOTDONE, REACTIVE_UNKNOWN, SF, SUGAR_UNITS,
  TA, TF, URINE_GLUCOSE, URINE_PROTEIN, YESNO,
} from "@/components/anc-fields";
import { StatusBadge } from "@/components/StatusBadge";
import { ConditionDashboard } from "@/components/ConditionDashboard";
import { InterventionPlan } from "@/components/InterventionPlan";
import { assessConditions, conditionSummary } from "@/lib/conditions";
import { Printer, Siren, FileText, Activity, Plus, TrendingDown, TrendingUp, Minus, ChevronRight, ChevronDown, Calendar as CalendarIcon, ArrowLeft } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Line, LineChart } from "recharts";
import { toast } from "sonner";


export const Route = createFileRoute("/patient/$id")({
  head: () => ({ meta: [{ title: "Patient Detail — REFLEX AI Module 1" }] }),
  component: PatientDetailPage,
  notFoundComponent: () => (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Patient not found</h1>
        <Link to="/patients" className="text-primary mt-3 inline-block">← Back to patients</Link>
      </div>
    </AppShell>
  ),
});

function PatientDetailPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const [patient, setPatient] = useState<Patient | undefined>();
  const [expandedVisit, setExpandedVisit] = useState<string | undefined>();

  useEffect(() => {
    seedDemoIfEmpty();
    setPatient(getPatient(id));
  }, [id]);

  const a = patient ? latest(patient)?.analysis : undefined;
  const scoreColor = useMemo(() => {
    if (!a) return "text-muted-foreground";
    return a.category === "High" ? "text-destructive" : a.category === "Moderate" ? "text-accent" : "text-success";
  }, [a]);

  function addCheckIn(values: { bp: string; weight: string; symptoms: string; notes: string; date: string; anc?: ANCVisitData; ultrasound?: string }) {
    if (!patient) return;
    if (!values.bp) { toast.error("Blood pressure is required"); return; }
    if (!values.date) { toast.error("Visit date is required"); return; }
    const next = appendCheckIn(patient, {
      bloodPressure: values.bp,
      weight: parseFloat(values.weight) || 0,
      symptoms: values.symptoms,
      notes: values.notes,
      date: values.date ? new Date(values.date).toISOString() : undefined,
      anc: values.anc,
      ultrasound: values.ultrasound,
    });

    // keep the most recent scan as the patient's cover ultrasound too
    if (values.ultrasound) next.ultrasound = values.ultrasound;
    savePatient(next);
    setPatient(getPatient(patient.id));
    toast.success("Check-in recorded — risk re-analyzed");
  }

  if (!patient) {
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto px-4 py-20 text-center text-muted-foreground">
          Loading patient…
          <div className="mt-4"><Link to="/patients" className="text-primary">← Back to patients</Link></div>
        </div>
      </AppShell>
    );
  }

  // change vs the previous visit, from the stored (capped) scores so old records also display correctly
  const prevVisit = patient.checkIns.length > 1 ? patient.checkIns[patient.checkIns.length - 2] : undefined;
  const shownDelta = a && prevVisit ? a.riskScore - prevVisit.analysis.riskScore : undefined;
  const shownTrend = shownDelta === undefined ? undefined : shownDelta > 4 ? "worsening" : shownDelta < -4 ? "improving" : "stable";
  const TrendIcon = shownTrend === "worsening" ? TrendingUp : shownTrend === "improving" ? TrendingDown : Minus;
  const trendColor = shownTrend === "worsening" ? "text-destructive" : shownTrend === "improving" ? "text-success" : "text-muted-foreground";

  const trendData = patient.checkIns.map((c) => ({
    date: new Date(c.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    risk: c.analysis.riskScore,
    sys: parseInt(c.bloodPressure.split("/")[0] || "0", 10),
    weight: c.weight,
  }));

  // referral is needed when the composite score OR any single condition is High
  const needsReferral = a?.category === "High" || conditionSummary(assessConditions(patient)).needsReferral;

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-8">
        {/* Top bar */}
        <div className="print:hidden flex items-center justify-between gap-4 flex-wrap">
          <button onClick={() => router.history.back()} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Back to list
          </button>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-card border border-border text-sm hover:bg-secondary">
              <Printer className="size-4" /> Print report
            </button>
            {needsReferral && (
              <Link to="/referral" search={{ id: patient.id }} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive text-destructive-foreground text-sm hover:opacity-90 animate-pulse-ring">
                <Siren className="size-4" /> Emergency referral
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
                <div className="text-sm text-muted-foreground">Patient</div>
                <h1 className="text-2xl font-bold">{patient.name}</h1>
                <div className="text-xs text-muted-foreground">Age {patient.age} • {patient.gestationWeeks}w gestation at start • {patient.checkIns.length} visits recorded</div>
                <BmiTag weight={latest(patient)?.weight} heightCm={patient.rch4?.height} />
              </div>
              {a && <StatusBadge category={a.category} />}
            </div>
            <div className="mt-6 grid sm:grid-cols-2 gap-6 items-center">
              <RiskGauge score={a?.riskScore ?? 0} />
              <div>
                <div className={`text-5xl font-bold ${scoreColor}`}>{a?.riskScore}%</div>
                <div className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                  Overall risk score
                  {shownTrend && shownDelta !== undefined && (
                    <span className={`inline-flex items-center gap-0.5 ${trendColor}`}>
                      • <TrendIcon className="size-3.5" /> {shownDelta > 0 ? "+" : ""}{shownDelta} vs last visit ({shownTrend})
                    </span>
                  )}
                </div>
                <p className="mt-4 text-sm">{a?.recommendation}</p>
              </div>
            </div>
          </div>

          <ConditionDashboard patient={patient} />
          <InterventionPlan patient={patient} />

          <CheckInForm onSubmit={addCheckIn} />

          {trendData.length > 1 && (
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
                <div className="font-semibold">Risk score trend</div>
                <div className="text-xs text-muted-foreground">Continuous AI analysis across {trendData.length} visits</div>
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
                      <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" fontSize={11} />
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} />
                      <Area type="monotone" dataKey="risk" stroke="oklch(0.6 0.22 25)" fill="url(#riskGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
                <div className="font-semibold">Vital signs trend</div>
                <div className="text-xs text-muted-foreground">Systolic BP & weight across visits</div>
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
            <div className="flex items-center gap-2 font-semibold"><Activity className="size-4 text-primary" /> Detected red flags (latest visit)</div>
            <RiskDriverChips patient={patient} visit={latest(patient)} />
            <div className="mt-4 space-y-3">
              {a?.findings.length === 0 && <div className="text-sm text-muted-foreground">No red flags detected. Continue routine care.</div>}
              {a?.findings.map((f, i) => (
                <div key={i} className="rounded-xl border border-border p-4 bg-gradient-soft">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{f.label}</div>
                    <StatusBadge category={f.severity} />
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">{f.note}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Visit timeline — expandable, per-day detail */}
          <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
            <div className="font-semibold flex items-center gap-2"><FileText className="size-4 text-teal" /> Visit history</div>
            <p className="text-xs text-muted-foreground mt-1">Tap a date to see that day's metrics, ultrasound, AI analysis and any complications detected.</p>
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
                    label={isLatest ? "Most recent" : `Visit ${patient.checkIns.length - idx}`}
                    onToggle={() => setExpandedVisit(isOpen ? undefined : c.id)}
                  />
                );
              })}
            </div>
          </div>

          {/* Profile */}
          <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
            <div className="font-semibold">Profile</div>
            <dl className="mt-3 text-sm grid grid-cols-2 gap-y-2">
              <dt className="text-muted-foreground">Complications</dt><dd>{patient.complications || "—"}</dd>
              <dt className="text-muted-foreground">History</dt><dd>{patient.history || "—"}</dd>
              <dt className="text-muted-foreground">Registered</dt><dd>{new Date(patient.createdAt).toLocaleDateString()}</dd>
              {patient.rch4?.clinicName && <><dt className="text-muted-foreground">Clinic</dt><dd>{patient.rch4.clinicName}</dd></>}
              {patient.rch4?.rchNumber && <><dt className="text-muted-foreground">RCH number</dt><dd>{patient.rch4.rchNumber}</dd></>}
              {patient.rch4?.village && <><dt className="text-muted-foreground">Village / ward</dt><dd>{[patient.rch4.village, patient.rch4.ward, patient.rch4.district].filter(Boolean).join(", ")}</dd></>}
              {patient.rch4?.phone && <><dt className="text-muted-foreground">Phone</dt><dd>{patient.rch4.phone}</dd></>}
              {patient.rch4?.partnerName && <><dt className="text-muted-foreground">Partner</dt><dd>{[patient.rch4.partnerName, patient.rch4.partnerAge ? `${patient.rch4.partnerAge} yrs` : "", patient.rch4.partnerOccupation].filter(Boolean).join(" • ")}</dd></>}
              {patient.rch4?.gravida && <><dt className="text-muted-foreground">Gravida / Para</dt><dd>G{patient.rch4.gravida} P{patient.rch4.para || 0} • {patient.rch4.livingChildren || 0} living{patient.rch4.abortions ? ` • ${patient.rch4.abortions} abortion(s)` : ""}</dd></>}
              {patient.rch4?.lmp && <><dt className="text-muted-foreground">LMP / EDD</dt><dd>{patient.rch4.lmp} → {patient.rch4.edd || "—"}</dd></>}
              {patient.rch4?.bloodGroup && <><dt className="text-muted-foreground">Blood group</dt><dd>{patient.rch4.bloodGroup} {patient.rch4.rhesus || ""}</dd></>}
              {patient.rch4?.deliveryPlace && <><dt className="text-muted-foreground">Birth plan</dt><dd>{[patient.rch4.deliveryPlace, patient.rch4.transportPlan && `transport: ${patient.rch4.transportPlan}`, patient.rch4.bloodDonor && `donor: ${patient.rch4.bloodDonor}`].filter(Boolean).join(" • ")}</dd></>}

            </dl>
          </div>
        </div>

        {/* Print-only clinical report */}
        <PrintReport patient={patient} />
      </div>
    </AppShell>
  );
}

/** Conditions at Moderate or High risk for a visit, from the same engine as the dashboard. */
function flaggedConditions(patient: Patient, visit?: CheckIn) {
  return assessConditions(patient, visit)
    .filter((r) => r.applicable && r.level !== "Low")
    .map((r) => ({
      name: r.name,
      severity: r.level,
      reason: `${r.score}%. ${r.drivers.slice(0, 3).map((d) => d.label + (d.value ? ` (${d.value})` : "")).join(", ")}`,
    }));
}

function VisitItem({ patient, visit, isOpen, isLatest, label, onToggle }: {
  patient: Patient; visit: CheckIn; isOpen: boolean; isLatest: boolean; label: string; onToggle: () => void;
}) {
  const comps = flaggedConditions(patient, visit);
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button onClick={onToggle} className="w-full flex flex-wrap items-center gap-4 justify-between p-4 hover:bg-secondary/50 text-left">
        <div className="flex items-center gap-3 min-w-0">
          {isOpen ? <ChevronDown className="size-4 text-muted-foreground shrink-0" /> : <ChevronRight className="size-4 text-muted-foreground shrink-0" />}
          <div className="min-w-0">
            <div className="font-medium">{new Date(visit.date).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" })}</div>
            <div className="text-xs text-muted-foreground">{label} • BP {visit.bloodPressure} • {visit.weight}kg</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-lg font-bold">{visit.analysis.riskScore}%</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">risk</div>
          </div>
          <StatusBadge category={visit.analysis.category} />
        </div>
      </button>
      {isOpen && (
        <div className="border-t border-border p-4 bg-gradient-soft space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Visit summary</div>
              <dl className="text-sm grid grid-cols-[120px_1fr] gap-y-1.5">
                <dt className="text-muted-foreground">Visit date</dt><dd>{new Date(visit.date).toLocaleString()}</dd>
                <dt className="text-muted-foreground">Visit number</dt><dd>{visit.anc?.visitNumber || "—"}</dd>
                <dt className="text-muted-foreground">Symptoms</dt><dd>{visit.symptoms || "—"}</dd>
                <dt className="text-muted-foreground">Provider</dt><dd>{visit.anc?.provider || "—"}</dd>
              </dl>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Ultrasound</div>
              <div className="aspect-video rounded-xl overflow-hidden bg-secondary flex items-center justify-center">
                {visit.ultrasound || patient.ultrasound ? (
                  <img src={visit.ultrasound || patient.ultrasound} alt="Ultrasound" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-xs text-muted-foreground p-4 text-center">No ultrasound attached to this visit. AI used clinical features only.</div>
                )}
              </div>
            </div>
          </div>

          <VisitClinicalGrid patient={patient} visit={visit} />
          <RiskDriverChips patient={patient} visit={visit} />

          <div>

            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">AI analysis result</div>
            <div className="text-sm"><span className="font-semibold">Risk:</span> {visit.analysis.riskScore}% ({visit.analysis.category})</div>
            <div className="text-sm mt-1"><span className="font-semibold">Recommendation:</span> {visit.analysis.recommendation}</div>
            {visit.analysis.findings.length > 0 ? (
              <div className="mt-2">
                <div className="text-xs font-semibold text-muted-foreground">Red flags detected:</div>
                <ul className="mt-1 text-sm list-disc list-inside space-y-0.5">
                  {visit.analysis.findings.map((f, i) => (
                    <li key={i}><span className="font-medium">{f.label}</span> — <span className="text-muted-foreground">{f.note}</span></li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground mt-2">No red flags detected this day.</div>
            )}
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Complications detected this day</div>
            <div className="grid sm:grid-cols-2 gap-2">
              {comps.map((c, i) => (
                <div key={i} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm">{c.name}</div>
                    <StatusBadge category={c.severity} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{c.reason}</div>
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
  const a = latest(patient)?.analysis;
  const comps = flaggedConditions(patient);
  return (
    <div className="hidden print:block" style={{ fontFamily: "Inter, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #0d9488", paddingBottom: 8, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>REFLEX AI Module 1 — Prenatal Risk Report</div>
          <div style={{ fontSize: 11, color: "#555" }}>African maternal model v2.4 • Generated {new Date().toLocaleString()}</div>
        </div>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 700, margin: "12px 0 6px" }}>Patient</h2>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <tbody>
          <tr><td style={cellL}>Name</td><td style={cell}>{patient.name}</td><td style={cellL}>Age</td><td style={cell}>{patient.age}</td></tr>
          <tr><td style={cellL}>Gestation at start</td><td style={cell}>{patient.gestationWeeks} weeks</td><td style={cellL}>Visits</td><td style={cell}>{patient.checkIns.length}</td></tr>
          <tr><td style={cellL}>History</td><td style={cell}>{patient.history || "—"}</td><td style={cellL}>Known complications</td><td style={cell}>{patient.complications || "—"}</td></tr>
        </tbody>
      </table>

      {a && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "16px 0 6px" }}>Current Risk Assessment</h2>
          <p style={{ fontSize: 13 }}><b>Risk score:</b> {a.riskScore}% ({a.category})</p>
          <p style={{ fontSize: 13 }}><b>Recommendation:</b> {a.recommendation}</p>

          <h3 style={{ fontSize: 13, fontWeight: 700, margin: "10px 0 4px" }}>Red flags (latest visit)</h3>
          {a.findings.length ? (
            <ul style={{ fontSize: 12, margin: 0, paddingLeft: 18 }}>
              {a.findings.map((f, i) => <li key={i}><b>{f.label}</b> ({f.severity}) — {f.note}</li>)}
            </ul>
          ) : <p style={{ fontSize: 12 }}>None detected.</p>}

          <h3 style={{ fontSize: 13, fontWeight: 700, margin: "10px 0 4px" }}>Conditions flagged</h3>
          <ul style={{ fontSize: 12, margin: 0, paddingLeft: 18 }}>
            {comps.map((c, i) => <li key={i}><b>{c.name}</b> ({c.severity}) — {c.reason}</li>)}
          </ul>
        </>
      )}

      <h2 style={{ fontSize: 16, fontWeight: 700, margin: "16px 0 6px" }}>Visit History</h2>
      <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={cellH}>Date</th><th style={cellH}>BP</th><th style={cellH}>Weight</th>
            <th style={cellH}>Symptoms</th><th style={cellH}>Risk</th><th style={cellH}>Category</th>
          </tr>
        </thead>
        <tbody>
          {[...patient.checkIns].reverse().map((c) => (
            <tr key={c.id}>
              <td style={cell}>{new Date(c.date).toLocaleDateString()}</td>
              <td style={cell}>{c.bloodPressure}</td>
              <td style={cell}>{c.weight} kg</td>
              <td style={cell}>{c.symptoms || "—"}</td>
              <td style={cell}>{c.analysis.riskScore}%</td>
              <td style={cell}>{c.analysis.category}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ fontSize: 10, color: "#777", marginTop: 24, borderTop: "1px solid #ddd", paddingTop: 8 }}>
        Generated by REFLEX AI Module 1. This decision-support report does not replace clinical judgement.
      </p>
    </div>
  );
}

const cell: React.CSSProperties = { border: "1px solid #ddd", padding: "4px 8px", verticalAlign: "top" };
const cellL: React.CSSProperties = { ...cell, background: "#f3f4f6", fontWeight: 600, width: "18%" };
const cellH: React.CSSProperties = { ...cell, background: "#0d9488", color: "#fff", fontWeight: 700, textAlign: "left" };

function CheckInForm({ onSubmit }: { onSubmit: (v: { bp: string; weight: string; symptoms: string; notes: string; date: string; anc: ANCVisitData; ultrasound?: string }) => void }) {
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
        if (!date) { toast.error("Visit date is required"); return; }
        const symptomText = [symptoms, ...danger].filter(Boolean).join(", ");
        onSubmit({ bp, weight, symptoms: symptomText, notes, date, anc: { ...anc, dangerSigns: danger }, ultrasound: ultrasound || undefined });
        reset();
      }}
      className="rounded-2xl overflow-hidden shadow-glow ring-4 ring-primary/20"
    >
      <div className="bg-gradient-hero text-white p-6 lg:p-8 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold"><Plus className="size-5" /> New ANC visit (RCH4)</div>
            <p className="text-sm opacity-90 mt-1">Recorded as a separate visit — previous visits are never overwritten.</p>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-xs"><CalendarIcon className="size-3.5" /> Continuous screening</div>
        </div>
        <div className="grid sm:grid-cols-4 gap-3">
          <label className="text-xs opacity-90 flex flex-col gap-1">
            Visit date *
            <input value={date} onChange={(e) => setDate(e.target.value)} type="date" className={hiCls} />
          </label>
          <label className="text-xs opacity-90 flex flex-col gap-1">
            Visit number
            <input value={anc.visitNumber || ""} onChange={(e) => v("visitNumber")(e.target.value)} placeholder="e.g. 3" className={hiCls} />
          </label>
          <label className="text-xs opacity-90 flex flex-col gap-1">
            Blood pressure *
            <input value={bp} onChange={(e) => setBp(e.target.value)} placeholder="e.g. 130/85" className={hiCls} />
          </label>
          <label className="text-xs opacity-90 flex flex-col gap-1">
            Weight (kg)
            <input value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="65" type="number" className={hiCls} />
          </label>
        </div>
        <div className="grid sm:grid-cols-4 gap-3">
          <label className="text-xs opacity-90 flex flex-col gap-1">
            Gestation (weeks)
            <input value={anc.gestationWeeks || ""} onChange={(e) => v("gestationWeeks")(e.target.value)} type="number" placeholder="28" className={hiCls} />
          </label>
          <label className="text-xs opacity-90 flex flex-col gap-1">
            Temperature (°C)
            <input value={anc.temperature || ""} onChange={(e) => v("temperature")(e.target.value)} type="number" placeholder="36.8" className={hiCls} />
          </label>
          <label className="text-xs opacity-90 flex flex-col gap-1">
            Pulse (bpm)
            <input value={anc.pulse || ""} onChange={(e) => v("pulse")(e.target.value)} type="number" placeholder="80" className={hiCls} />
          </label>
          <label className="text-xs opacity-90 flex flex-col gap-1">
            MUAC (cm)
            <input value={anc.muac || ""} onChange={(e) => v("muac")(e.target.value)} type="number" placeholder="24" className={hiCls} />
          </label>
        </div>
        <div>
          <div className="text-xs opacity-90">Danger signs today</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {DANGER_SIGNS.map((s) => {
              const on = danger.includes(s);
              return (
                <button key={s} type="button"
                  onClick={() => setDanger((d) => d.includes(s) ? d.filter((x) => x !== s) : [...d, s])}
                  className={`px-3 py-1.5 rounded-full text-xs border transition ${on ? "bg-white text-destructive border-white font-semibold" : "bg-white/10 border-white/30 hover:bg-white/20"}`}>
                  {s}
                </button>
              );
            })}
          </div>
        </div>
        <textarea value={symptoms} onChange={(e) => setSymptoms(e.target.value)} rows={2} placeholder="Other complaints / symptoms" className="w-full px-3 py-2 rounded-lg bg-white/15 placeholder-white/70 text-white text-sm outline-none focus:bg-white/25 resize-none" />
      </div>

      <div className="bg-card border-x border-b border-border">
        <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-6 py-3 text-sm font-medium hover:bg-secondary/50">
          <span>RCH4 examination, investigations & services {open ? "" : "(optional)"}</span>
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
          <button type="submit" className="w-full px-4 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90">Save visit & analyze</button>
        </div>
      </div>
    </form>
  );
}

const hiCls = "px-3 py-2 rounded-lg bg-white/15 placeholder-white/70 text-white text-sm outline-none focus:bg-white/25 [color-scheme:dark]";

/** Per-visit ultrasound uploader (stored with this visit only). */
function UltrasoundUpload({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="sm:col-span-2 lg:col-span-3">
      <label className="text-sm font-medium">Upload ultrasound image for this visit (optional)</label>
      <div className="mt-2 grid sm:grid-cols-[1fr_240px] gap-4 items-start">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => onChange(String(reader.result || ""));
            reader.readAsDataURL(f);
          }}
          className="w-full text-sm file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:text-sm px-3 py-2 rounded-lg bg-background border border-input"
        />
        <div className="aspect-video rounded-xl overflow-hidden bg-secondary grid place-items-center border border-border">
          {value ? (
            <img src={value} alt="Ultrasound preview" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs text-muted-foreground px-3 text-center">No scan attached to this visit</span>
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
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
    </div>
  );
}

/** BMI tag for the patient header. */
function BmiTag({ weight, heightCm }: { weight?: number; heightCm?: string }) {
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
  if (!visit) return null;
  const drivers = riskDrivers(patient, visit);
  if (drivers.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Risk drivers</div>
      <ul className="flex flex-wrap gap-2">
        {drivers.map((d, i) => {
          const tone = d.severity === "High" ? "bg-destructive/10 text-destructive border-destructive/30"
            : d.severity === "Moderate" ? "bg-accent/10 text-accent border-accent/30"
              : "bg-success/10 text-success border-success/30";
          return (
            <li key={i} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs ${tone}`}>
              <span className="size-1.5 rounded-full bg-current" />
              <span className="font-semibold">{d.label}:</span> <span>{d.value}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ParamGroup({ title, rows }: { title: string; rows: [string, string | undefined][] }) {
  const filled = rows.filter(([, v]) => v !== undefined && v !== "" );
  if (filled.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {filled.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-medium text-right">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** All clinical parameters recorded on a given visit, grouped RCH4-style. */
function VisitClinicalGrid({ patient, visit }: { patient: Patient; visit: CheckIn }) {
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
            <span key={s} className="px-2.5 py-1 rounded-full text-[11px] bg-destructive/10 text-destructive border border-destructive/30">{s}</span>
          ))}
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-3">
        <ParamGroup title="Vitals & physical exam" rows={[
          ["Gestational age", anc.gestationWeeks ? `${anc.gestationWeeks} weeks` : undefined],
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



function RiskGauge({ score }: { score: number }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const color = score >= 60 ? "var(--destructive)" : score >= 32 ? "var(--accent)" : "var(--success)";
  return (
    <svg viewBox="0 0 180 180" className="w-48 h-48 mx-auto">
      <circle cx="90" cy="90" r={r} stroke="var(--muted)" strokeWidth="14" fill="none" />
      <circle
        cx="90" cy="90" r={r} stroke={color} strokeWidth="14" fill="none"
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
        transform="rotate(-90 90 90)"
        style={{ transition: "stroke-dashoffset 800ms ease" }}
      />
      <text x="90" y="98" textAnchor="middle" fontSize="28" fontWeight="700" fill="currentColor">{score}%</text>
    </svg>
  );
}
