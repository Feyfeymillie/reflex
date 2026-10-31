import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Baby, Check, ClipboardCheck, Gamepad2, Lightbulb, MessageCircleHeart, Puzzle } from "lucide-react";
import { PictureGame, StickerChart } from "@/components/ChildPlay";
import { BirthCard, type NewbornSummary } from "@/components/BirthCard";
import { AppShell } from "@/components/AppShell";
import { ConsentCard } from "@/components/ConsentCard";
import { api, errorText } from "@/lib/api";
import { giveConsent, type Consent } from "@/lib/store";

import { bi, t, useLang } from "@/lib/i18n";
export const Route = createFileRoute("/child/$id")({
  head: () => ({ meta: [{ title: "Child development — RefleX" }] }),
  component: ChildPage,
});

type Item = { code: string; sw: string; en: string };
type Child = {
  id: string; name: string; sex?: string; dob: string; ageMonths: number; corrected: boolean;
  mother?: { id: string; name: string } | null; consent: boolean; lastAnswers: Record<string, string>;
  play: { total: number; byCode: Record<string, number>; today: string[]; daysThisWeek: number };
  plan: { current_age: number | null; previous_age: number | null; next_age: number | null; current: Item[]; previous: Item[];
    activities: { code: string; title_sw: string; title_en: string; sw: string; en: string }[] };
  mchatAge: { min: number; max: number };
  mchat: { assessmentId: string; date: string; score: number; band: "low" | "medium" | "high"; ageMonths: number; actionSw: string; actionEn: string; referral: unknown }[];
  tasks: { date: string; task: string; accuracy: number; seconds: number; assistance: string; caution: boolean; note: string }[];
  newborn: NewbornSummary;
};
const BAND_TXT = { low: "Low likelihood", medium: "Medium likelihood: Follow-Up needed", high: "High likelihood: refer" } as const;
const TASK_TXT: Record<string, string> = { "feature-match": "Picture match", memory: "Where did it hide?", "joint-attention": "Look where I look", "target-pop": "Bubble pop", "play-observation": "Play together checklist" };
type Guidance = { advise_contact_chw: boolean; watch_closely: boolean; message_sw: string; message_en: string; overdue: string[]; practising: string[]; child: Child };

function ChildPage() {
  useLang();
  const { id } = Route.useParams();
  const [c, setC] = useState<Child>();
  const [answers, setAnswers] = useState<Record<string, "yes" | "not_yet">>({});
  const [lost, setLost] = useState(false);
  const [g, setG] = useState<Guidance>();
  const [consent, setConsent] = useState<Consent>({ care: false });
  const [playing, setPlaying] = useState(false);

  async function didIt(code: string) {
    try {
      setC(await api<Child>("POST", `/api/v1/children/${id}/play`, { code }));
      toast.success(t("Sticker earned! ⭐"));
    } catch (e) { toast.error(errorText(e)); }
  }

  const load = () => api<Child>("GET", `/api/v1/children/${id}`).then(setC).catch((e) => toast.error(errorText(e)));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    try {
      const r = await api<Guidance>("POST", `/api/v1/children/${id}/milestones`, { answers, lostSkill: lost });
      setG(r); setC(r.child);
    } catch (e) { toast.error(errorText(e)); }
  }

  if (!c) return <AppShell><div className="p-12 text-center text-muted-foreground">{t("Loading…")}</div></AppShell>;

  const Milestone = ({ m }: { m: Item }) => (
    <div className="rounded-xl border border-border p-3">
      <div className="font-medium text-sm">{bi(m.sw, m.en)}</div>
      <div className="mt-2 flex gap-2">
        {(["yes", "not_yet"] as const).map((v) => (
          <button key={v} type="button" onClick={() => setAnswers((a) => ({ ...a, [m.code]: v }))}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${answers[m.code] === v ? "border-primary bg-primary/10 font-semibold" : "border-border bg-background"}`}>
            {v === "yes" ? t("Yes") : t("Not yet")}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8 space-y-6">
        {c.mother && <Link to="/patient/$id" params={{ id: c.mother.id }} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {c.mother.name}</Link>}
        <div className="rounded-2xl bg-card border border-border p-6 shadow-card flex items-center gap-4">
          <div className="size-12 rounded-2xl bg-accent/15 text-accent flex items-center justify-center"><Baby className="size-6" /></div>
          <div>
            <h1 className="text-2xl font-bold">{c.name}</h1>
            <div className="text-sm text-muted-foreground">
              {t("{n} months", { n: c.ageMonths })}{c.corrected ? ` ${t("(corrected for early birth)")}` : ""} · {t("born {date}", { date: c.dob })}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{t("Milestones are parent guidance. The autism checklist is a screening, not a diagnosis.")}</div>
          </div>
        </div>

        {c.consent && <BirthCard childId={c.id} nb={c.newborn} onSaved={(k) => setC(k as Child)} />}

        {!c.consent ? (
          <div className="space-y-3">
            <ConsentCard module="child_dev" value={consent} onChange={setConsent} />
            <button disabled={!consent.care} onClick={async () => { try { await giveConsent(c.id, "child_dev", consent); load(); } catch (e) { toast.error(errorText(e)); } }}
              className="px-5 py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50">{t("Save consent")}</button>
          </div>
        ) : c.plan.current_age === null ? (
          <div className="rounded-2xl bg-card border border-border p-6 shadow-card text-sm">
            {t("The first milestone check is at 2 months. Until then: talk, sing and do short tummy time every day.")}
          </div>
        ) : (
          <>
            <button onClick={() => setPlaying(true)}
              className="w-full rounded-2xl bg-gradient-hero text-white p-6 shadow-glow flex items-center gap-4 text-left">
              <span className="text-5xl" aria-hidden>🐄🐔⚽</span>
              <span>
                <span className="block text-xl font-bold flex items-center gap-2"><Gamepad2 className="size-5" />{' '}{c.ageMonths < 12 ? t("Look and say") : t("Find the picture")}</span>
                <span className="block text-sm opacity-90">{c.ageMonths < 12 ? t("Big pictures to name together. Baby taps for the next one.") : t("Play together on this phone. Nothing is scored or saved.")}</span>
              </span>
            </button>
            {playing && <PictureGame ageMonths={c.ageMonths} name={c.name} onClose={() => setPlaying(false)} />}
            <div className="rounded-2xl bg-card border border-border p-6 shadow-card space-y-4">
              <div className="font-semibold">{t("What can {name} do now? (age {n} months)", { name: c.name, n: c.plan.current_age })}</div>
              <div className="grid sm:grid-cols-2 gap-3">{c.plan.current.map((m) => <Milestone key={m.code} m={m} />)}</div>
              {c.plan.previous.length > 0 && <>
                <div className="font-semibold pt-2">{t("Also check the earlier ones ({n} months)", { n: c.plan.previous_age })}</div>
                <div className="grid sm:grid-cols-2 gap-3">{c.plan.previous.map((m) => <Milestone key={m.code} m={m} />)}</div>
              </>}
              <label className="flex items-start gap-3 text-sm pt-2">
                <input type="checkbox" className="mt-0.5 size-5" checked={lost} onChange={(e) => setLost(e.target.checked)} />
                {t("Has lost a skill they used to have (for example, was talking and has stopped).")}
              </label>
              <button onClick={submit} className="w-full px-5 py-3 rounded-xl bg-primary text-primary-foreground font-medium">{t("Show guidance")}</button>
            </div>

            {g && (
              <div className={`rounded-2xl p-6 border-2 ${g.advise_contact_chw ? "border-accent bg-accent/10" : "border-success/40 bg-success/5"}`}>
                <div className="flex items-center gap-2 font-semibold"><MessageCircleHeart className="size-5" /> {g.advise_contact_chw ? t("Talk to your CHW") : t("Keep going")}</div>
                <p className="mt-2">{bi(g.message_sw, g.message_en)}</p>
                {g.watch_closely && <p className="mt-2 text-xs text-muted-foreground">{t("This child is followed more closely because of the birth record, so any milestone not yet reached counts.")}</p>}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              <Link to="/mchat/$id" params={{ id: c.id }}
                className="rounded-2xl bg-card border border-border p-5 shadow-card flex items-start gap-3 hover:border-primary">
                <ClipboardCheck className="size-6 text-primary shrink-0" />
                <span>
                  <span className="block font-semibold">{t("Autism screening (M-CHAT-R)")}</span>
                  <span className="block text-sm text-muted-foreground">
                    {c.ageMonths >= c.mchatAge.min && c.ageMonths <= c.mchatAge.max
                      ? t("20 yes/no questions for the parent.")
                      : t("For ages {min} to {max} months.", { min: c.mchatAge.min, max: c.mchatAge.max })}
                  </span>
                </span>
              </Link>
              <Link to="/play/$id" params={{ id: c.id }}
                className="rounded-2xl bg-card border border-border p-5 shadow-card flex items-start gap-3 hover:border-primary">
                <Puzzle className="size-6 text-primary shrink-0" />
                <span>
                  <span className="block font-semibold">{t("Play tasks")}</span>
                  <span className="block text-sm text-muted-foreground">{t("Five short games. Saved for the CHW, never scored.")}</span>
                </span>
              </Link>
            </div>

            {(c.mchat.length > 0 || c.tasks.length > 0) && (
              <div className="rounded-2xl bg-card border border-border p-6 shadow-card space-y-3">
                <div className="font-semibold">{t("Screening and play history")}</div>
                {c.mchat.map((m) => (
                  <div key={m.assessmentId} className="flex justify-between gap-3 text-sm border-b border-border pb-2">
                    <span>M-CHAT-R · {m.date.slice(0, 10)} · {t("{n} months", { n: m.ageMonths })}</span>
                    <span className={m.band === "high" ? "text-destructive font-semibold" : m.band === "medium" ? "font-semibold" : ""}>
                      {m.score}/20 · {t(BAND_TXT[m.band])}{m.referral ? ` · ${t("referred")}` : ""}
                    </span>
                  </div>
                ))}
                {c.tasks.map((x, k) => (
                  <div key={k} className="text-sm border-b border-border pb-2">
                    <div className="flex justify-between gap-3">
                      <span>{t(TASK_TXT[x.task] ?? x.task)} · {x.date.slice(0, 10)}</span>
                      <span>{x.accuracy}% · {x.seconds}s{x.caution ? " ⚠" : ""}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{x.note}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-2xl bg-card border border-border p-6 shadow-card space-y-4">
              <div className="flex items-center gap-2 font-semibold"><Lightbulb className="size-4 text-accent" />{' '}{t("Play ideas for this age")}</div>
              <StickerChart play={c.play} />
              <div className="grid sm:grid-cols-2 gap-3">
                {c.plan.activities.map((a) => {
                  const done = c.play.today.includes(a.code);
                  return (
                    <div key={a.code} className="rounded-xl bg-gradient-soft border border-border p-4 flex flex-col">
                      <div className="font-semibold">{bi(a.title_sw, a.title_en)}</div>
                      <p className="text-sm mt-2 flex-1">{bi(a.sw, a.en)}</p>
                      <button disabled={done} onClick={() => didIt(a.code)}
                        className={`mt-3 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium ${done ? "bg-success/15 text-success" : "bg-accent text-accent-foreground"}`}>
                        {done ? <><Check className="size-4" />{' '}{t("Done today ⭐")}</> : t("We did it today!")}
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">{t("Milestones adapted from CDC \"Learn the Signs. Act Early.\" (2022). Swahili is a draft for review.")}</p>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
