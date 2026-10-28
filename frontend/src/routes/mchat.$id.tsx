import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { api, errorText } from "@/lib/api";
import { bi, t, useLang } from "@/lib/i18n";

// Module 3: M-CHAT-R toddler autism screening (16-30 months). Parent answers all 20 items with the CHW.
// Scored on the hub (app/mchat.py). A screening, never a diagnosis.
export const Route = createFileRoute("/mchat/$id")({
  head: () => ({ meta: [{ title: "Autism screening (M-CHAT-R) — RefleX" }] }),
  component: MchatPage,
});

type Q = { code: string; n: number; en: string; sw: string };
type Child = { id: string; name: string; ageMonths: number; consent: boolean; mchatAge: { min: number; max: number } };
type Result = { score: number; band: "low" | "medium" | "high"; riskItems: number[]; action_sw: string; action_en: string };

const BAND = {
  low: { en: "Low likelihood", cls: "border-success/40 bg-success/5" },
  medium: { en: "Medium likelihood: Follow-Up needed", cls: "border-warning bg-warning/10" },
  high: { en: "High likelihood: refer", cls: "border-destructive bg-destructive/10" },
} as const;

function MchatPage() {
  useLang();
  const { id } = Route.useParams();
  const [c, setC] = useState<Child>();
  const [qs, setQs] = useState<Q[]>([]);
  const [i, setI] = useState(0);
  const [ans, setAns] = useState<Record<string, "yes" | "no">>({});
  const [r, setR] = useState<Result>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Child>("GET", `/api/v1/children/${id}`).then(setC).catch((e) => toast.error(errorText(e)));
    api<{ questions: Q[] }>("GET", "/api/v1/mchat/questions").then((d) => setQs(d.questions)).catch((e) => toast.error(errorText(e)));
  }, [id]);

  async function submit() {
    setBusy(true);
    try {
      setR(await api<Result>("POST", `/api/v1/children/${id}/mchat`, { answers: ans }));
    } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  }

  const back = <Link to="/child/$id" params={{ id }} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {c?.name ?? t("Back")}</Link>;
  if (!c || !qs.length) return <AppShell><div className="p-12 text-center text-muted-foreground">{t("Loading…")}</div></AppShell>;

  const inAge = c.ageMonths >= c.mchatAge.min && c.ageMonths <= c.mchatAge.max;
  const q = qs[i];
  const answered = Object.keys(ans).length;

  function answer(v: "yes" | "no") {
    setAns((a) => ({ ...a, [q.code]: v }));
    if (i < qs.length - 1) setI(i + 1);
  }

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 lg:px-8 py-8 space-y-6">
        {back}
        <div className="rounded-2xl bg-card border border-border p-6 shadow-card flex items-center gap-4">
          <div className="size-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center"><ClipboardCheck className="size-6" /></div>
          <div>
            <h1 className="text-2xl font-bold">{t("Autism screening (M-CHAT-R)")}</h1>
            <div className="text-sm text-muted-foreground">{c.name} · {t("{n} months", { n: c.ageMonths })}</div>
            <div className="text-xs text-muted-foreground mt-1">{t("Ask the parent about how the child usually behaves. A screening, not a diagnosis.")}</div>
          </div>
        </div>

        {!c.consent ? (
          <div className="rounded-2xl bg-card border border-border p-6 text-sm">{t("Give child development consent on the child's page first.")}</div>
        ) : !inAge ? (
          <div className="rounded-2xl bg-card border border-border p-6 text-sm">
            {t("M-CHAT-R is for children aged {min} to {max} months. {name} is {n} months.", { min: c.mchatAge.min, max: c.mchatAge.max, name: c.name, n: c.ageMonths })}
          </div>
        ) : r ? (
          <div className={`rounded-2xl p-6 border-2 space-y-3 ${BAND[r.band].cls}`}>
            <div className="text-sm text-muted-foreground">{t("Score {s} of 20", { s: r.score })}</div>
            <div className="text-2xl font-bold">{t(BAND[r.band].en)}</div>
            <p>{bi(r.action_sw, r.action_en)}</p>
            {r.band === "high" && <p className="text-sm font-medium">{t("A referral was created automatically.")}</p>}
            {r.riskItems.length > 0 && <p className="text-xs text-muted-foreground">{t("At-risk answers on questions: {q}", { q: r.riskItems.join(", ") })}</p>}
            <Link to="/child/$id" params={{ id }} className="inline-block mt-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-medium">{t("Back to {name}", { name: c.name })}</Link>
          </div>
        ) : (
          <div className="rounded-2xl bg-card border border-border p-6 shadow-card space-y-5">
            <div className="flex gap-1">{qs.map((x, k) => (
              <button key={x.code} onClick={() => setI(k)} aria-label={`${k + 1}`}
                className={`h-2 flex-1 rounded-full ${k === i ? "bg-primary" : ans[x.code] ? "bg-primary/40" : "bg-border"}`} />
            ))}</div>
            <div className="text-sm text-muted-foreground">{t("Question {n} of {total}", { n: i + 1, total: qs.length })}</div>
            <div className="text-xl font-semibold min-h-[5rem]">{bi(q.sw, q.en)}</div>
            <div className="grid grid-cols-2 gap-3">
              {(["yes", "no"] as const).map((v) => (
                <button key={v} onClick={() => answer(v)}
                  className={`rounded-xl border-2 px-4 py-4 text-lg font-semibold ${ans[q.code] === v ? "border-primary bg-primary/10" : "border-border bg-background"}`}>
                  {v === "yes" ? t("Yes") : t("No")}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-sm">
              <button disabled={i === 0} onClick={() => setI(i - 1)} className="text-muted-foreground disabled:opacity-40">← {t("Previous")}</button>
              <span className="text-muted-foreground">{t("{n} of {total} answered", { n: answered, total: qs.length })}</span>
            </div>
            <button disabled={answered < qs.length || busy} onClick={submit}
              className="w-full px-5 py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50">{t("Score the checklist")}</button>
            <p className="text-[11px] text-muted-foreground">{t("M-CHAT-R © 2009 Diana Robins, Deborah Fein, Marianne Barton. Used for this demo; permission needed before real use. Swahili is a draft.")}</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
