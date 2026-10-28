import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Hand } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  FeatureMatchGame, JointAttentionGame, MemoryGame, PlayObservationGame, TargetPopGame, type GameResult,
} from "@/components/ScreeningGames";
import { api, errorText } from "@/lib/api";
import { t, useLang } from "@/lib/i18n";

// Module 3: the team's play tasks. Results are saved as observations for the CHW to read.
// Nothing here scores, flags or refers: the games are not validated as a screening.
export const Route = createFileRoute("/play/$id")({
  head: () => ({ meta: [{ title: "Play tasks — RefleX" }] }),
  component: PlayPage,
});

type Task = "feature-match" | "memory" | "joint-attention" | "target-pop" | "play-observation";
type Assistance = "Independent" | "Verbal Prompt" | "Hand-over-Hand";
type Child = { id: string; name: string; ageMonths: number; consent: boolean };

const TASKS: { key: Task; emoji: string; en: string; desc: string }[] = [
  { key: "feature-match", emoji: "🔷", en: "Picture match", desc: "Find the picture that is exactly the same." },
  { key: "memory", emoji: "🧸", en: "Where did it hide?", desc: "Remember which cup the toy is under." },
  { key: "joint-attention", emoji: "👉", en: "Look where I look", desc: "Tap what the friend is looking at." },
  { key: "target-pop", emoji: "🫧", en: "Bubble pop", desc: "Tap the bubble as it moves." },
  { key: "play-observation", emoji: "🧱", en: "Play together checklist", desc: "Play with real toys, then tick what you saw." },
];
const CONTEXT = [
  { key: "rested", en: "Child is rested (not sleepy)" },
  { key: "fed", en: "Child has eaten / is not hungry" },
  { key: "calm", en: "Child is calm and well today" },
  { key: "touch", en: "Child has used a phone or tablet before" },
];
const ASSIST: { key: Assistance; en: string }[] = [
  { key: "Independent", en: "On their own" },
  { key: "Verbal Prompt", en: "With spoken help" },
  { key: "Hand-over-Hand", en: "Hand-over-hand help" },
];

function PlayPage() {
  const lang = useLang();
  const { id } = Route.useParams();
  const [c, setC] = useState<Child>();
  const [task, setTask] = useState<Task | null>(null);
  const [phase, setPhase] = useState<"pick" | "ready" | "play" | "done">("pick");
  const [ctx, setCtx] = useState<Record<string, boolean>>({ rested: true, fed: true, calm: true, touch: true });
  const [res, setRes] = useState<GameResult | null>(null);
  const [assist, setAssist] = useState<Assistance>("Independent");
  const [round, setRound] = useState(0);
  const [saved, setSaved] = useState(false);

  useEffect(() => { api<Child>("GET", `/api/v1/children/${id}`).then(setC).catch((e) => toast.error(errorText(e))); }, [id]);

  const meta = TASKS.find((x) => x.key === task);
  const caution = Object.values(ctx).some((v) => !v);
  const G = { lang: lang === "sw" ? "SW" : "EN", onDone: (r: GameResult) => { setRes(r); setPhase("done"); } } as const;

  async function save() {
    if (!res || !task) return;
    const missing = CONTEXT.filter((x) => !ctx[x.key]).map((x) => x.en.toLowerCase());
    try {
      await api("POST", `/api/v1/children/${id}/tasks`, {
        task, accuracy: res.accuracy, seconds: Math.round(res.durationMs / 1000), assistance: assist, caution,
        note: res.note + (missing.length ? ` Context: ${missing.map((m) => `not "${m}"`).join("; ")}.` : ""),
      });
      setSaved(true);
      toast.success(t("Saved to {name}'s record", { name: c?.name ?? "" }));
    } catch (e) { toast.error(errorText(e)); }
  }

  if (!c) return <AppShell><div className="p-12 text-center text-muted-foreground">{t("Loading…")}</div></AppShell>;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 lg:px-8 py-8 space-y-6">
        <Link to="/child/$id" params={{ id }} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {c.name}</Link>
        <div>
          <h1 className="text-2xl font-bold">{t("Play tasks")}</h1>
          <p className="text-sm text-muted-foreground">{t("Observations for the CHW, not a screening result. Nothing here gives a score or a referral.")}</p>
        </div>

        {!c.consent ? (
          <div className="rounded-2xl bg-card border border-border p-6 text-sm">{t("Give child development consent on the child's page first.")}</div>
        ) : phase === "pick" ? (
          <div className="grid gap-3">
            {TASKS.map((x) => (
              <button key={x.key} onClick={() => { setTask(x.key); setPhase("ready"); }}
                className="rounded-2xl bg-card border border-border p-4 shadow-card flex items-center gap-4 text-left hover:border-primary">
                <span className="text-4xl" aria-hidden>{x.emoji}</span>
                <span><span className="block font-semibold">{t(x.en)}</span><span className="block text-sm text-muted-foreground">{t(x.desc)}</span></span>
              </button>
            ))}
          </div>
        ) : phase === "ready" && meta ? (
          <div className="rounded-2xl bg-card border border-border p-6 shadow-card space-y-4">
            <div className="text-xl font-semibold">{meta.emoji} {t(meta.en)}</div>
            <div className="font-medium text-sm">{t("Before you start, is the child ready?")}</div>
            {CONTEXT.map((x) => (
              <label key={x.key} className="flex items-center gap-3 text-sm">
                <input type="checkbox" className="size-5" checked={ctx[x.key]} onChange={(e) => setCtx({ ...ctx, [x.key]: e.target.checked })} />
                {t(x.en)}
              </label>
            ))}
            <p className="text-xs text-muted-foreground">{t("Under-5s vary a lot. Tiredness, hunger or being new to touchscreens can lower results.")}</p>
            <div className="flex gap-2">
              <button onClick={() => setPhase("pick")} className="px-5 py-3 rounded-xl border border-border">{t("Back")}</button>
              <button onClick={() => { setRes(null); setSaved(false); setAssist("Independent"); setRound(round + 1); setPhase("play"); }}
                className="flex-1 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-medium">{t("Start")}</button>
            </div>
          </div>
        ) : phase === "play" ? (
          <div key={round}>
            {task === "feature-match" && <FeatureMatchGame {...G} />}
            {task === "memory" && <MemoryGame {...G} />}
            {task === "joint-attention" && <JointAttentionGame {...G} />}
            {task === "target-pop" && <TargetPopGame {...G} />}
            {task === "play-observation" && <PlayObservationGame {...G} />}
            <button onClick={() => setPhase("pick")} className="mt-3 text-sm text-muted-foreground">← {t("Stop")}</button>
          </div>
        ) : res && meta ? (
          <div className="rounded-2xl bg-card border border-border p-6 shadow-card space-y-4">
            <div className="text-xl font-semibold">{meta.emoji} {t(meta.en)}</div>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-muted p-3"><div className="text-2xl font-bold">{res.accuracy}%</div><div className="text-xs text-muted-foreground">{t("Correct")}</div></div>
              <div className="rounded-xl bg-muted p-3"><div className="text-2xl font-bold">{Math.round(res.durationMs / 1000)}s</div><div className="text-xs text-muted-foreground">{t("Time")}</div></div>
            </div>
            <p className="text-sm">{res.note}</p>
            {caution && <p className="text-sm text-warning-foreground bg-warning/15 rounded-lg p-2">{t("The child was not fully ready, so read this result with care.")}</p>}
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Hand className="size-4" />{t("How much help did the child need?")}</div>
              <div className="grid gap-2 sm:grid-cols-3">
                {ASSIST.map((a) => (
                  <button key={a.key} onClick={() => { setAssist(a.key); setSaved(false); }}
                    className={`rounded-lg border px-3 py-2 text-sm ${assist === a.key ? "border-primary bg-primary/10 font-semibold" : "border-border"}`}>{t(a.en)}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPhase("pick")} className="px-5 py-3 rounded-xl border border-border">{t("Another game")}</button>
              <button disabled={saved} onClick={save} className="flex-1 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50">
                {saved ? t("Saved ✓") : t("Save to record")}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
