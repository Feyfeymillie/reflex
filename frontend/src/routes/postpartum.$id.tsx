import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Baby, HeartHandshake, PhoneCall, Save, Siren } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ConsentCard } from "@/components/ConsentCard";
import { BandBadge, BAND_LABEL, ChwDecision } from "@/components/ChwDecision";
import { BirthFields, OUTCOME, PLACE } from "@/components/BirthFields";
import { api, errorText } from "@/lib/api";
import { useDraft, clearDraft } from "@/lib/draft";
import { fetchPatient, giveConsent, type Band, type Consent, type Patient } from "@/lib/store";

import { bi, t, useLang } from "@/lib/i18n";
export const Route = createFileRoute("/postpartum/$id")({
  head: () => ({ meta: [{ title: "Postpartum check — RefleX" }] }),
  component: PostpartumPage,
});

type Question = { code: string; domain_sw: string; domain_en: string; sw: string; en: string; options: { score: number; sw: string; en: string }[] };
type EpdsResult = { assessmentId: string; score: number; band: Band; self_harm: boolean; action_sw: string; action_en: string;
  context: { pregnancyBand?: Band | null; outcome?: string | null; deliveryPlace?: string | null }; patient: Patient };

function PostpartumPage() {
  useLang();
  const { id } = Route.useParams();
  const [p, setP] = useState<Patient>();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [result, setResult] = useState<EpdsResult>();

  useEffect(() => {
    fetchPatient(id).then(setP).catch((e) => toast.error(errorText(e)));
    api<{ questions: Question[] }>("GET", "/api/v1/epds/questions").then((r) => setQuestions(r.questions)).catch(() => {});
  }, [id]);

  if (!p) return <AppShell><div className="p-12 text-center text-muted-foreground">{t("Loading…")}</div></AppShell>;
  const delivered = p.pregnancy && p.pregnancy.outcome !== "ongoing";
  const preg = p.checkIns[p.checkIns.length - 1];

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8 space-y-6">
        <Link to="/postpartum" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />{' '}{t("Postpartum list")}</Link>
        <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
          <div className="text-sm text-muted-foreground">{t("Mother")}</div>
          <h1 className="text-2xl font-bold">{p.name}</h1>
          <div className="text-xs text-muted-foreground">{t("Age {n}", { n: p.age })}{p.village ? ` · ${p.village}` : ""}</div>
          {/* The cross-module moment: what the pregnancy module already knew about her */}
          <div className="mt-4 rounded-xl bg-secondary/60 p-4 text-sm">
            <div className="font-semibold mb-1">{t("From her pregnancy record")}</div>
            {preg ? (
              <div className="flex flex-wrap items-center gap-2">
                {t("Last pregnancy risk:")}{' '}<BandBadge band={preg.review?.finalBand ?? preg.analysis.band} />
                <span className="text-muted-foreground">({t("{n} ANC visit(s)", { n: p.checkIns.length })})</span>
                <Link to="/patient/$id" params={{ id: p.id }} className="text-primary text-xs">{t("open")}</Link>
              </div>
            ) : <div className="text-muted-foreground">{t("No ANC visits recorded. She entered RefleX after delivery.")}</div>}
            {delivered && <div className="mt-1">{t("Outcome:")}{' '}<b>{t(p.pregnancy!.outcome)}</b> · {p.pregnancy!.deliveryDate}{p.pregnancy!.deliveryPlace ? ` (${t(p.pregnancy!.deliveryPlace)})` : ""}</div>}
            {(preg && ["high", "urgent"].includes(preg.analysis.band) || p.pregnancy?.outcome === "stillbirth") &&
              <div className="mt-2 text-accent-foreground font-medium">{t("Screen her first: a high-risk pregnancy or a loss raises the chance of postpartum depression.")}</div>}
          </div>
        </div>

        {!delivered && <BirthForm patient={p} onDone={setP} />}
        {!p.consent.postnatal_mh ? <ModuleConsent patient={p} onDone={setP} /> : (
          <>
            {result ? <EpdsResultCard r={result} onAgain={() => setResult(undefined)} onChange={setP} /> :
              <EpdsForm patientId={p.id} questions={questions} onResult={(r) => { setResult(r); setP(r.patient); }} />}
            {p.postnatal.length > 0 && (
              <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
                <div className="font-semibold">{t("Previous screens")}</div>
                <div className="mt-3 divide-y divide-border">
                  {[...p.postnatal].reverse().map((s) => (
                    <div key={s.assessmentId} className="py-2 flex items-center justify-between text-sm">
                      <span>{new Date(s.date).toLocaleDateString()} · EPDS {s.score}{s.selfHarm ? ` · ${t("self-harm item positive")}` : ""}{s.review ? ` · CHW: ${t(s.review.decision === "accept" ? "accepted" : "overridden")}` : ""}</span>
                      <BandBadge band={s.review?.finalBand ?? s.band} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        {p.children.map((c) => (
          <Link key={c.id} to="/child/$id" params={{ id: c.id }} className="flex gap-3 rounded-2xl bg-card border border-border p-5 shadow-card hover:bg-secondary/40">
            <Baby className="size-5 text-accent" /><div><div className="font-semibold">{t("{name}: growing up", { name: c.name })}</div><div className="text-xs text-muted-foreground">{t("Milestones and play ideas")}</div></div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}

function BirthForm({ patient, onDone }: { patient: Patient; onDone: (p: Patient) => void }) {
  useLang();
  const [f, setF] = useState({ outcome: "", date: "", place: "", babyName: "", babySex: "", gestationAtBirthWeeks: "" });
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  async function save() {
    try {
      onDone(await api<Patient>("POST", `/api/v1/patients/${patient.id}/birth`, {
        outcome: OUTCOME[f.outcome], date: f.date, place: PLACE[f.place], babyName: f.babyName,
        babySex: f.babySex.toLowerCase() || undefined, gestationAtBirthWeeks: f.gestationAtBirthWeeks || undefined,
      }));
      toast.success(t("Birth recorded. The baby now has their own record linked to the mother."));
    } catch (e) { toast.error(errorText(e)); }
  }
  return (
    <div className="space-y-3">
      <BirthFields f={f} set={set} step="1" />
      <button onClick={save} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-medium"><Save className="size-4" />{' '}{t("Record birth")}</button>
    </div>
  );
}

function ModuleConsent({ patient, onDone }: { patient: Patient; onDone: (p: Patient) => void }) {
  useLang();
  const [c, setC] = useState<Consent>({ care: false });
  async function save() {
    try { await giveConsent(patient.id, "postnatal_mh", c); onDone(await fetchPatient(patient.id)); }
    catch (e) { toast.error(errorText(e)); }
  }
  return (
    <div className="space-y-3">
      <ConsentCard module="postnatal_mh" value={c} onChange={setC} />
      <button disabled={!c.care} onClick={save} className="px-5 py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50">{t("Save consent and start EPDS")}</button>
    </div>
  );
}

function EpdsForm({ patientId, questions, onResult }: { patientId: string; questions: Question[]; onResult: (r: EpdsResult) => void }) {
  useLang();
  const DRAFT = `reflex:draft:epds:${patientId}`;
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  useDraft(DRAFT, answers, setAnswers);
  const done = questions.length > 0 && questions.every((q) => answers[q.code] !== undefined);

  async function submit() {
    setBusy(true);
    try {
      const r = await api<EpdsResult>("POST", `/api/v1/patients/${patientId}/epds`, { answers });
      clearDraft(DRAFT);
      onResult(r);
    } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
      <div className="flex items-center gap-2 font-semibold"><HeartHandshake className="size-4 text-teal" />{' '}{t("EPDS: in the past 7 days…")}</div>
      <p className="text-xs text-muted-foreground mt-1">{t("Read each question to her and tap her answer. Swahili wording is a draft until replaced by the validated Swahili EPDS.")}</p>
      <ol className="mt-4 space-y-5">
        {questions.map((q, i) => (
          <li key={q.code}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-teal">{bi(q.domain_sw, q.domain_en)}</div>
            <div className="font-medium">{i + 1}. {bi(q.sw, q.en)}</div>
            <div className="mt-2 grid sm:grid-cols-2 gap-2">
              {q.options.map((o) => {
                const on = answers[q.code] === o.score;
                return (
                  <button key={o.score} type="button" onClick={() => setAnswers((a) => ({ ...a, [q.code]: o.score }))}
                    className={`text-left rounded-xl border px-3 py-2.5 text-sm transition ${on ? "border-primary bg-primary/10 font-semibold" : "border-border bg-background hover:bg-secondary"}`}>
                    {bi(o.sw, o.en)}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
      <button disabled={!done || busy} onClick={submit} className="mt-6 w-full px-5 py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50">
        {busy ? t("Saving…") : done ? t("See result") : t("Answer all {n} questions", { n: questions.length })}
      </button>
    </div>
  );
}

function EpdsResultCard({ r, onAgain, onChange }: { r: EpdsResult; onAgain: () => void; onChange: (p: Patient) => void }) {
  useLang();
  const screen = r.patient.postnatal.find((s) => s.assessmentId === r.assessmentId);
  return (
    <div className="space-y-4">
      {r.self_harm && (
        <div className="rounded-2xl border-2 border-destructive bg-destructive/10 p-6">
          <div className="flex items-center gap-2 text-destructive font-bold text-lg"><Siren className="size-5" />{' '}{t("Call the CHW / facility today")}</div>
          <p className="mt-2">{t("Question 10 (self-harm) was answered above \"Never\". Do not leave her alone. This alert fires whatever the total score. A same-day referral was created automatically.")}</p>
          <div className="mt-3 inline-flex items-center gap-2 text-sm"><PhoneCall className="size-4" />{' '}{t("Add the facility's number for this ward before deployment.")}</div>
        </div>
      )}
      <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
        <div className="text-xs text-muted-foreground">{t("Screening result, not a diagnosis")}</div>
        <div className="mt-1 flex items-center gap-3"><span className="text-4xl font-bold">{r.score}</span><span className="text-muted-foreground">/ 30</span><BandBadge band={r.band} /></div>
        <p className="mt-3 font-medium">{bi(r.action_sw, r.action_en)}</p>
        {r.context.pregnancyBand && (
          <p className="mt-3 text-sm">{t("Her pregnancy risk was")}{' '}<b>{t(BAND_LABEL[r.context.pregnancyBand])}</b>{r.context.outcome ? ` · ${t(r.context.outcome)}` : ""}. {t("The CHW should weigh this together with the score.")}</p>
        )}
        <p className="text-[11px] text-muted-foreground mt-3">{t("Rule-scored EPDS (no AI) · cut-offs 10 possible / 13 probable, to be confirmed by a clinician")}</p>
        <button onClick={onAgain} className="mt-4 text-sm text-primary">{t("Screen again")}</button>
      </div>
      {screen && <ChwDecision visit={{ assessmentId: screen.assessmentId, review: screen.review, referral: screen.referral, analysis: { band: screen.band } }} onChange={onChange} />}
    </div>
  );
}
