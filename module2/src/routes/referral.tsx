import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { getPatient, latest, latestAnalysis, listPatients, seedDemoIfEmpty, type Patient } from "@/lib/store";
import { assessConditions, conditionSummary } from "@/lib/conditions";
import { buildAlert } from "@/lib/alerts";
import { loadPhones, orderedFacilities, savePhone } from "@/lib/facilities";
import { useLang } from "@/components/ConditionDashboard";
import { Siren, Phone, MapPin, Send, WifiOff, CheckCircle2, Pencil } from "lucide-react";
import { toast } from "sonner";

const search = z.object({ id: z.string().optional() });

export const Route = createFileRoute("/referral")({
  validateSearch: (s) => search.parse(s),
  head: () => ({ meta: [{ title: "Emergency Referral — REFLEX AI Module 1" }] }),
  component: ReferralPage,
});

function ReferralPage() {
  const { id } = Route.useSearch();
  const [patient, setPatient] = useState<Patient | undefined>();
  const [highRisk, setHighRisk] = useState<Patient[]>([]);
  const [sent, setSent] = useState(false);
  const lang = useLang();
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | undefined>();
  const [draft, setDraft] = useState("");
  useEffect(() => { setPhones(loadPhones()); }, []);

  useEffect(() => {
    seedDemoIfEmpty();
    const all = listPatients();
    // queue = composite score High OR any single condition High
    const isHigh = (p: Patient) => latestAnalysis(p)?.category === "High" || conditionSummary(assessConditions(p)).needsReferral;
    setHighRisk(all.filter(isHigh));
    setPatient((id && getPatient(id)) || all.find(isHigh));
  }, [id]);

  function sendAlert() {
    setSent(true);
    toast.success("Demo: alert saved on this device. No SMS is sent until an SMS gateway is connected.");
  }

  const a = patient ? latestAnalysis(patient) : undefined;

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-2xl bg-destructive/15 text-destructive flex items-center justify-center animate-pulse-ring">
            <Siren className="size-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Emergency Referral Center</h1>
            <p className="text-muted-foreground text-sm flex items-center gap-1.5"><WifiOff className="size-3.5 text-accent" /> Alerts queued locally and delivered via SMS when online</p>
          </div>
        </div>

        {!patient ? (
          <div className="rounded-2xl bg-card border border-border p-12 text-center text-muted-foreground">
            No high-risk patients right now. Great work!
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6">
                <div className="text-xs font-semibold text-destructive uppercase tracking-wider">High-priority alert</div>
                <h2 className="text-xl font-bold mt-1">{patient.name} • Risk {a?.riskScore}%</h2>
                <p className="text-sm text-muted-foreground mt-1">{a?.recommendation}</p>
              </div>

              <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
                <div className="font-semibold mb-3">SMS preview</div>
                <div className="rounded-2xl bg-secondary p-4 max-w-md font-mono text-sm whitespace-pre-line">
{buildAlert(patient, lang)}
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <button
                    onClick={sendAlert} disabled={sent}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-destructive text-destructive-foreground font-medium hover:opacity-90 disabled:opacity-60"
                  >
                    {sent ? <CheckCircle2 className="size-4" /> : <Send className="size-4" />}
                    {sent ? "Alert queued" : "Send alert"}
                  </button>
                  <span className="text-xs text-muted-foreground">Demo mode: no SMS is sent until an SMS gateway is connected.</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="font-semibold flex items-center gap-2"><MapPin className="size-4 text-teal" /> Referral facilities in Zanzibar</div>
              <p className="text-xs text-muted-foreground">Confirm services and availability by phone before transfer. Facility details come from published 2015 to 2019 sources.</p>
              {orderedFacilities(patient).map(({ facility: f, suggested }) => (
                <div key={f.id} className={`rounded-2xl bg-card border p-4 shadow-card ${suggested ? "border-teal/60" : "border-border"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{f.name}</div>
                      <div className="text-xs text-muted-foreground">{f.level}</div>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-teal/15 text-teal shrink-0">{f.island}</span>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">{f.district}{suggested ? " · suggested for this patient's district" : ""}</div>
                  <div className="mt-3 text-xs">
                    {editing === f.id ? (
                      <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); setPhones(savePhone(f.id, draft)); setEditing(undefined); }}>
                        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="+255 …" inputMode="tel"
                          className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-background border border-input" />
                        <button type="submit" className="px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground">Save</button>
                        <button type="button" onClick={() => setEditing(undefined)} className="px-2.5 py-1.5 rounded-lg border border-border">Cancel</button>
                      </form>
                    ) : (
                      <div className="flex items-center justify-between">
                        {phones[f.id] ? (
                          <a href={`tel:${phones[f.id]}`} className="inline-flex items-center gap-1 text-primary hover:underline"><Phone className="size-3" /> {phones[f.id]}</a>
                        ) : (
                          <span className="text-muted-foreground">No number saved</span>
                        )}
                        <button onClick={() => { setDraft(phones[f.id] || ""); setEditing(f.id); }} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                          <Pencil className="size-3" /> {phones[f.id] ? "Edit" : "Add number"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="font-semibold mb-3">High-risk queue ({highRisk.length})</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {highRisk.map((p) => {
              const pa = latestAnalysis(p);
              const pl = latest(p);
              return (
                <button key={p.id} onClick={() => setPatient(p)} className={`text-left rounded-2xl border p-4 ${patient?.id === p.id ? "border-destructive bg-destructive/5" : "border-border bg-card"} hover:shadow-card`}>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.gestationWeeks}w • BP {pl?.bloodPressure ?? "—"} • Risk {pa?.riskScore}%</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
