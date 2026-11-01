import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardCheck, Clock, Copy, Send, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { assessConditions, conditionSummary } from "@/lib/conditions";
import { latest, gestationAt, type Patient } from "@/lib/store";
import {
  PHASE_LABEL, POSTPARTUM_ACTIONS, PROTOCOLS, protocolFor, visibleActions, type Level, type Phase,
} from "@/lib/protocols";
import {
  REF_STEPS, advanceReferral, loadPlan, minutesToFirstAction, savePlan, suggestedFollowUpDays,
  toggleAction, undoReferral, type PlanState,
} from "@/lib/interventions";
import { StatusBadge } from "@/components/StatusBadge";
import { useLang } from "@/components/ConditionDashboard";
import { cn } from "@/lib/utils";

const T = {
  EN: {
    title: "Module 2 · Intervention plan",
    sub: "What to do now that a risk is flagged. Tick each step as it is done; times are recorded.",
    flagged: "Flagged", actions: "Actions done", first: "Time to first action", minutes: "min",
    none: "none yet", referral: "Referral", noFlag: "No condition needs intervention at this visit. Continue routine care and book the next visit.",
    overdue: "No action recorded yet for a high-risk flag. Start the first step now or refer.",
    refTitle: "Referral tracker", refNext: "Mark as", refUndo: "Undo", facility: "Manage at",
    note: "Referral note (SBAR)", copy: "Copy", copied: "Copied", sms: "SMS alert (Swahili)",
    follow: "Follow-up", followHint: "Suggested from the risk level. Confirm against your guideline.", followDone: "Follow-up done",
    postpartum: "Postpartum monitoring", delivered: "Delivery date", ppHint: "Hypertensive disorders can start or continue after birth.",
    source: "Source", disclaimer: "Decision support for trained health workers. Doses and regimens come from the national guideline, not from this tool.",
    severe: "Severe features present", notSevere: "No severe features recorded", missing: "Missing test",
    errBefore: "Delivery date cannot be before the last ANC visit.", errFuture: "Delivery date cannot be in the future.",
    errSaved: "The saved delivery date is not valid for this patient. Please correct it.", errFollow: "Follow-up date cannot be in the past.",
    guideline: "Guideline",
    verStg: "Checked against the Tanzania STG", verPartial: "Partly checked against the Tanzania STG", verGeneral: "General practice, not yet checked against the Tanzania STG",
  },
  SW: {
    title: "Moduli 2 · Mpango wa hatua",
    sub: "Nini cha kufanya baada ya hatari kubainishwa. Weka alama kila hatua inapokamilika; muda unarekodiwa.",
    flagged: "Imebainishwa", actions: "Hatua zilizofanyika", first: "Muda hadi hatua ya kwanza", minutes: "dak",
    none: "bado", referral: "Rufaa", noFlag: "Hakuna ugonjwa unaohitaji hatua ziara hii. Endelea na huduma ya kawaida na panga ziara ijayo.",
    overdue: "Hakuna hatua iliyorekodiwa kwa hatari kubwa. Anza hatua ya kwanza sasa au toa rufaa.",
    refTitle: "Ufuatiliaji wa rufaa", refNext: "Weka kama", refUndo: "Rudisha", facility: "Mahali pa matibabu",
    note: "Barua ya rufaa (SBAR)", copy: "Nakili", copied: "Imenakiliwa", sms: "Ujumbe wa SMS (Kiswahili)",
    follow: "Ufuatiliaji", followHint: "Imependekezwa kulingana na kiwango cha hatari. Thibitisha na mwongozo wako.", followDone: "Ufuatiliaji umefanyika",
    postpartum: "Ufuatiliaji baada ya kujifungua", delivered: "Tarehe ya kujifungua", ppHint: "Shinikizo la damu linaweza kuanza au kuendelea baada ya kujifungua.",
    source: "Chanzo", disclaimer: "Msaada wa maamuzi kwa watoa huduma waliofunzwa. Dozi na taratibu hutoka kwenye mwongozo wa taifa, si zana hii.",
    severe: "Dalili kali zipo", notSevere: "Hakuna dalili kali zilizorekodiwa", missing: "Kipimo kinakosekana",
    errBefore: "Tarehe ya kujifungua haiwezi kuwa kabla ya ziara ya mwisho ya ANC.", errFuture: "Tarehe ya kujifungua haiwezi kuwa ya baadaye.",
    errSaved: "Tarehe ya kujifungua iliyohifadhiwa si sahihi kwa mgonjwa huyu. Tafadhali irekebishe.", errFollow: "Tarehe ya ufuatiliaji haiwezi kuwa ya zamani.",
    guideline: "Mwongozo",
    verStg: "Imelinganishwa na STG ya Tanzania", verPartial: "Imelinganishwa kwa sehemu na STG ya Tanzania", verGeneral: "Mazoezi ya kawaida, bado haijalinganishwa na STG ya Tanzania",
  },
} as const;

const REF_SW: Record<string, string> = {
  "Not sent": "Haijatumwa", Sent: "Imetumwa", Accepted: "Imekubaliwa", Arrived: "Amefika", Treated: "Amehudumiwa",
};

const PHASE_ORDER: Phase[] = ["stabilise", "refer", "prevent", "followup"];
const ACTION_TEXT = new Map<string, string>([
  ...PROTOCOLS.flatMap((p) => p.actions).map((a) => [a.id, a.text] as [string, string]),
  ...POSTPARTUM_ACTIONS.map((a) => [a.id, a.text] as [string, string]),
]);

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const localDay = (d: Date = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return localDay(d); };

export function InterventionPlan({ patient }: { patient: Patient }) {
  const lang = useLang();
  const t = T[lang];
  const sw = lang === "SW";
  const visit = latest(patient);
  const results = useMemo(() => assessConditions(patient), [patient]);
  const summary = useMemo(() => conditionSummary(results), [results]);
  const flagged = results.filter((r) => r.applicable && r.level !== "Low");
  const [plan, setPlan] = useState<PlanState | undefined>();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => { if (visit) setPlan(loadPlan(patient.id, visit.id)); }, [patient.id, visit?.id]);
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(i); }, []);

  if (!visit || !plan) return null;

  const gest = gestationAt(patient, visit.date);
  const todayStr = localDay();
  const visitDay = localDay(new Date(visit.date));
  const deliveredInvalid = !!plan.delivered && (plan.delivered < visitDay || plan.delivered > todayStr);
  const topHigh = flagged.find((r) => r.level === "High");
  const topLevel = summary.high > 0 ? "High" : summary.moderate > 0 ? "Moderate" : "Low";

  // actions visible for the flagged conditions
  const visibleIds = flagged.flatMap((r) =>
    visibleActions(protocolFor(r.id), r.level as Level, r.severe, r.htn, r.variant).map((a) => a.id));
  const doneCount = visibleIds.filter((id) => plan.actions[id]).length;
  const first = minutesToFirstAction(plan);
  const overdue = summary.needsReferral && Object.keys(plan.actions).length === 0 && now - new Date(plan.flaggedAt).getTime() > 30 * 60000;

  const update = (p: PlanState) => setPlan(p);
  const followValue = plan.followUpDate || addDays(suggestedFollowUpDays(topLevel, gest));

  const hypertensive = (flagged.some((r) => r.id === "preeclampsia")) || /preeclampsia|hypertension/i.test(patient.complications || "");

  function sbar(): string {
    const done = Object.entries(plan!.actions)
      .map(([id, v]) => `${ACTION_TEXT.get(id) ?? id} (${hhmm(v.at)})`);
    const a = flagged.filter((r) => r.level === "High")
      .map((r) => `${r.name} ${r.score}% (${r.drivers.slice(0, 3).map((d) => d.label + (d.value ? ` ${d.value}` : "")).join(", ")})`).join("; ");
    return [
      `S: ${patient.name}, ${patient.age} yrs, ${gest} weeks. BP ${visit!.bloodPressure}.`,
      `B: ${[patient.complications, patient.history].filter((x) => x && !/^none$|^no$/i.test(x)).join("; ") || "No significant history recorded"}.`,
      `A: ${a || "See flagged conditions"}.`,
      `Done so far: ${done.length ? done.join("; ") : "nothing recorded yet"}.`,
      `R: Needs ${topHigh?.facility ?? "hospital"}. Please prepare to receive.`,
    ].join("\n");
  }

  function smsText(): string {
    return [
      "REFLEX AI DHARURA",
      `Mgonjwa: ${patient.name}, miaka ${patient.age}`,
      `Ujauzito wiki ${gest}, BP ${visit!.bloodPressure}`,
      `Hatari: ${topHigh ? topHigh.nameSw : "-"} (${topHigh?.score ?? 0}%)`,
      `Rufaa kwa: ${topHigh?.facility ?? "hospitali"}`,
      `Kituo: ${patient.rch4?.clinicName || "-"}`,
    ].join("\n");
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast.success(t.copied); } catch { toast.error("Copy failed"); }
  }

  const refIdx = REF_STEPS.indexOf(plan.referral.status);
  const nextRef = REF_STEPS[refIdx + 1];

  return (
    <div className="rounded-2xl bg-card border border-border p-6 shadow-card print:hidden">
      <div className="flex items-center gap-2 font-semibold"><ClipboardCheck className="size-4 text-primary" /> {t.title}</div>
      <p className="text-xs text-muted-foreground mt-1 max-w-2xl">{t.sub}</p>

      {/* metrics */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label={t.flagged} value={hhmm(plan.flaggedAt)} />
        <Metric label={t.actions} value={visibleIds.length ? `${doneCount} / ${visibleIds.length}` : "-"} />
        <Metric label={t.first} value={first === undefined ? t.none : `${first} ${t.minutes}`} />
        <Metric label={t.referral} value={summary.needsReferral ? (sw ? REF_SW[plan.referral.status] : plan.referral.status) : "-"} />
      </div>

      {overdue && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" /> {t.overdue}
        </div>
      )}

      {flagged.length === 0 && <p className="mt-4 text-sm text-muted-foreground">{t.noFlag}</p>}

      {/* per-condition checklists */}
      <div className="mt-4 space-y-3">
        {flagged.map((r) => {
          const proto = protocolFor(r.id);
          const acts = visibleActions(proto, r.level as Level, r.severe, r.htn, r.variant);
          const done = acts.filter((a) => plan.actions[a.id]).length;
          return (
            <div key={r.id} className={cn("rounded-xl border p-4", r.level === "High" ? "border-destructive/40 bg-destructive/5" : "border-border")}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="font-medium">{sw ? r.nameSw : r.name} <span className="text-xs text-muted-foreground">· {r.score}%</span></div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground tabular-nums">{done}/{acts.length}</span>
                  <StatusBadge category={r.level} />
                </div>
              </div>
              {r.id === "preeclampsia" && r.htn && (
                <div className={cn("mt-2 inline-block rounded-full px-2.5 py-0.5 text-[11px] border",
                  r.severe ? "bg-destructive/10 text-destructive border-destructive/40" : "bg-secondary text-muted-foreground border-border")}>
                  {r.severe ? t.severe : t.notSevere}
                </div>
              )}
              {r.prompts.map((p, i) => (
                <div key={i} className="mt-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                  <span className="font-semibold">{t.missing}: </span>{sw ? p.sw : p.en}
                </div>
              ))}
              <div className="mt-3 space-y-3">
                {PHASE_ORDER.map((ph) => {
                  const list = acts.filter((a) => a.phase === ph);
                  if (list.length === 0) return null;
                  return (
                    <div key={ph}>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{PHASE_LABEL[ph][sw ? "sw" : "en"]}</div>
                      <ul className="mt-1.5 space-y-1.5">
                        {list.map((a) => {
                          const d = plan.actions[a.id];
                          return (
                            <li key={a.id}>
                              <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                                <input type="checkbox" checked={!!d} onChange={() => update(toggleAction(plan, a.id))}
                                  className="mt-1 size-4 accent-[var(--primary)]" />
                                <span className={cn(d && "text-muted-foreground line-through")}>{a.text}</span>
                                {d && <span className="ml-auto shrink-0 text-xs text-success inline-flex items-center gap-1"><Clock className="size-3" />{hhmm(d.at)}</span>}
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
              {proto && (
                <div className="mt-3 text-[11px] text-muted-foreground">
                  <div className={cn("font-medium", proto.verified === "stg" ? "text-success" : proto.verified === "partial" ? "text-warning-foreground" : "text-muted-foreground")}>
                    {proto.verified === "stg" ? t.verStg : proto.verified === "partial" ? t.verPartial : t.verGeneral}
                  </div>
                  <div>{t.source}: {proto.source}</div>
                  {proto.refs && (
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      {proto.refs.map((ref) => (
                        <a key={ref.url} href={ref.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{t.guideline}: {ref.label.replace(/^Tanzania STG: /, "")}</a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* referral tracker */}
      {summary.needsReferral && (
        <div className="mt-5 rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 font-medium"><Send className="size-4 text-primary" /> {t.refTitle}</div>
          <div className="mt-1 text-xs text-muted-foreground">{t.facility}: {topHigh?.facility}</div>
          <ol className="mt-3 flex flex-wrap items-center gap-2">
            {REF_STEPS.map((s, i) => (
              <li key={s} className={cn("px-3 py-1 rounded-full text-xs border", i <= refIdx ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}>
                {sw ? REF_SW[s] : s}{plan.referral.times[s] ? ` · ${hhmm(plan.referral.times[s]!)}` : ""}
              </li>
            ))}
          </ol>
          <div className="mt-3 flex gap-2">
            {nextRef && (
              <button onClick={() => update(advanceReferral(plan))} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90">
                <CheckCircle2 className="size-4" /> {t.refNext} {sw ? REF_SW[nextRef] : nextRef}
              </button>
            )}
            {refIdx > 0 && (
              <button onClick={() => update(undoReferral(plan))} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-secondary">
                <Undo2 className="size-4" /> {t.refUndo}
              </button>
            )}
          </div>

          <div className="mt-4 grid md:grid-cols-2 gap-4">
            <TextBlock title={t.note} text={sbar()} copyLabel={t.copy} onCopy={() => copy(sbar())} />
            <TextBlock title={t.sms} text={smsText()} copyLabel={t.copy} onCopy={() => copy(smsText())} mono />
          </div>
        </div>
      )}

      {/* follow-up */}
      <div className="mt-5 rounded-xl border border-border p-4">
        <div className="flex items-center gap-2 font-medium"><CalendarClock className="size-4 text-primary" /> {t.follow}</div>
        <p className="text-xs text-muted-foreground mt-1">{t.followHint}</p>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <input type="date" value={followValue} min={todayStr}
            onChange={(e) => {
              if (e.target.value && e.target.value < todayStr) { toast.error(t.errFollow); return; }
              const n = { ...plan, followUpDate: e.target.value }; savePlan(n); update(n);
            }}
            className="px-3 py-2 rounded-lg bg-background border border-input text-sm" />
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={!!plan.followUpDone} className="size-4 accent-[var(--primary)]"
              onChange={(e) => { const n = { ...plan, followUpDone: e.target.checked ? new Date().toISOString() : undefined }; savePlan(n); update(n); }} />
            {t.followDone}{plan.followUpDone ? ` · ${hhmm(plan.followUpDone)}` : ""}
          </label>
        </div>
      </div>

      {/* postpartum */}
      <div className="mt-5 rounded-xl border border-border p-4">
        <div className="font-medium">{t.postpartum}</div>
        <p className="text-xs text-muted-foreground mt-1">{t.ppHint}</p>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <label className="text-sm">{t.delivered}</label>
          <input type="date" value={plan.delivered || ""} min={visitDay} max={todayStr}
            onChange={(e) => {
              const v = e.target.value;
              if (v && v < visitDay) { toast.error(t.errBefore); return; }
              if (v && v > todayStr) { toast.error(t.errFuture); return; }
              const n = { ...plan, delivered: v || undefined }; savePlan(n); update(n);
            }}
            className="px-3 py-2 rounded-lg bg-background border border-input text-sm" />
        </div>
        {deliveredInvalid && <p className="mt-2 text-xs text-destructive">{t.errSaved}</p>}
        {plan.delivered && !deliveredInvalid && hypertensive && (
          <ul className="mt-3 space-y-1.5">
            {POSTPARTUM_ACTIONS.map((a) => {
              const d = plan.actions[a.id];
              return (
                <li key={a.id}>
                  <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                    <input type="checkbox" checked={!!d} onChange={() => update(toggleAction(plan, a.id))} className="mt-1 size-4 accent-[var(--primary)]" />
                    <span className={cn(d && "text-muted-foreground line-through")}>{a.text}</span>
                    {d && <span className="ml-auto shrink-0 text-xs text-success inline-flex items-center gap-1"><Clock className="size-3" />{hhmm(d.at)}</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground">{t.disclaimer}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/60 px-3 py-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function TextBlock({ title, text, onCopy, copyLabel, mono }: { title: string; text: string; onCopy: () => void; copyLabel: string; mono?: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
        <button onClick={onCopy} className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><Copy className="size-3" /> {copyLabel}</button>
      </div>
      <pre className={cn("mt-1.5 rounded-lg bg-secondary p-3 text-xs whitespace-pre-wrap break-words", mono ? "font-mono" : "font-sans")}>{text}</pre>
    </div>
  );
}
