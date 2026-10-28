import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
// Ported from the team's module 3 (reflex-module3-v2). Colours mapped to the prototype theme.
export type Lang = "EN" | "SW";

export type GameResult = {
  accuracy: number; // 0-100
  durationMs: number;
  offTargetTaps: number;
  precisionErrorPx: number;
  level?: number;
  note: string;
};
type GameProps = { lang: Lang; onDone: (r: GameResult) => void };
const L = (lang: Lang, en: string, sw: string) => (lang === "SW" ? sw : en);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);

function Stage({ children }: { children: React.ReactNode }) {
  return <div className="border-border bg-background relative flex min-h-[340px] flex-col items-center justify-center gap-6 rounded-2xl border-2 p-4">{children}</div>;
}
function Progress({ i, n }: { i: number; n: number }) {
  return <div className="flex gap-1.5">{Array.from({ length: n }, (_, k) => <span key={k} className={`size-2.5 rounded-full ${k < i ? "bg-primary" : "bg-border"}`} />)}</div>;
}

// ---------- 1. Picture Puzzle Match (MITA-style multi-feature, adaptive) ----------
const COLORS = ["#14b8a6", "#e11d48", "#f59e0b", "#1e3a8a"];
const SHAPES = ["circle", "square", "triangle", "star"] as const;
type Item = { color: string; shape: (typeof SHAPES)[number]; big: boolean };
function ShapeIcon({ item, size = 72 }: { item: Item; size?: number }) {
  const s = item.big ? size : size * 0.55;
  const c = item.color;
  return <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden><g transform={`translate(50 50) scale(${s / size})`}>
    {item.shape === "circle" && <circle r="42" fill={c} />}
    {item.shape === "square" && <rect x="-40" y="-40" width="80" height="80" rx="8" fill={c} />}
    {item.shape === "triangle" && <polygon points="0,-44 44,38 -44,38" fill={c} />}
    {item.shape === "star" && <polygon points="0,-46 13,-14 46,-14 19,6 29,40 0,20 -29,40 -19,6 -46,-14 -13,-14" fill={c} />}
  </g></svg>;
}
function makePuzzle(level: number): { target: Item; options: Item[] } {
  const target: Item = { color: pick(COLORS), shape: pick([...SHAPES]), big: Math.random() > 0.5 };
  const distractors: Item[] = [];
  while (distractors.length < 2 + Math.min(level, 2)) {
    let d: Item;
    if (level === 1) d = { ...target, color: pick(COLORS.filter((c) => c !== target.color)) }; // colour only
    else if (level === 2) d = Math.random() > 0.5 ? { ...target, color: pick(COLORS.filter((c) => c !== target.color)) } : { ...target, shape: pick(SHAPES.filter((s) => s !== target.shape)) };
    else { const r = Math.random(); d = r < 0.33 ? { ...target, big: !target.big } : r < 0.66 ? { ...target, shape: pick(SHAPES.filter((s) => s !== target.shape)) } : { ...target, color: pick(COLORS.filter((c) => c !== target.color)) }; }
    if (!distractors.some((x) => x.color === d.color && x.shape === d.shape && x.big === d.big)) distractors.push(d);
  }
  return { target, options: shuffle([target, ...distractors]) };
}
export function FeatureMatchGame({ lang, onDone }: GameProps) {
  const TRIALS = 8;
  const [trial, setTrial] = useState(0);
  const [level, setLevel] = useState(1);
  const [streak, setStreak] = useState(0);
  const [stats, setStats] = useState({ correct: 0, wrong: 0, maxLevel: 1 });
  const [puzzle, setPuzzle] = useState(() => makePuzzle(1));
  const [fb, setFb] = useState<"ok" | "no" | null>(null);
  const start = useRef(Date.now());
  const choose = (o: Item) => {
    if (fb) return;
    const ok = o === puzzle.target;
    setFb(ok ? "ok" : "no");
    const nextStreak = ok ? streak + 1 : 0;
    let nextLevel = level;
    if (ok && nextStreak >= 2) nextLevel = Math.min(3, level + 1);
    if (!ok) nextLevel = Math.max(1, level - 1);
    const s = { correct: stats.correct + (ok ? 1 : 0), wrong: stats.wrong + (ok ? 0 : 1), maxLevel: Math.max(stats.maxLevel, nextLevel) };
    setStats(s);
    setTimeout(() => {
      setFb(null);
      if (trial + 1 >= TRIALS) {
        onDone({ accuracy: Math.round((s.correct / TRIALS) * 100), durationMs: Date.now() - start.current, offTargetTaps: s.wrong, precisionErrorPx: 0, level: s.maxLevel, note: `Matched ${s.correct}/${TRIALS} pictures; reached level ${s.maxLevel} of 3 (${["colour", "colour + shape", "colour + shape + size"][s.maxLevel - 1]}).` });
        return;
      }
      setStreak(nextStreak >= 2 ? 0 : nextStreak); setLevel(nextLevel); setTrial(trial + 1); setPuzzle(makePuzzle(nextLevel));
    }, 700);
  };
  return <Stage>
    <Progress i={trial} n={TRIALS} />
    <p className="text-center font-semibold">{L(lang, "Find the one that is exactly the same!", "Tafuta kinachofanana kabisa!")}</p>
    <div className={`bg-card rounded-2xl border-4 p-3 ${fb === "ok" ? "border-success" : fb === "no" ? "border-destructive" : "border-border"}`}><ShapeIcon item={puzzle.target} size={96} /></div>
    <div className="flex flex-wrap justify-center gap-3">{puzzle.options.map((o, i) => <button key={i} onClick={() => choose(o)} className="bg-card border-border active:scale-95 rounded-xl border-2 p-2 transition-transform" aria-label={`option ${i + 1}`}><ShapeIcon item={o} /></button>)}</div>
    <span className="text-muted-foreground text-xs">{L(lang, "Level", "Kiwango")} {level}/3</span>
  </Stage>;
}

// ---------- 2. Where Did It Hide? (working memory) ----------
const TOYS = ["🧸", "🐣", "🚗", "⚽", "🐶"];
export function MemoryGame({ lang, onDone }: GameProps) {
  const ROUNDS = [3, 3, 4, 4, 5, 5];
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<"show" | "hidden" | "reveal">("show");
  const [spot, setSpot] = useState(() => Math.floor(Math.random() * 3));
  const [toy, setToy] = useState(() => pick(TOYS));
  const [chosen, setChosen] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const start = useRef(Date.now());
  const cups = ROUNDS[round];
  useEffect(() => { if (phase === "show") { const t = setTimeout(() => setPhase("hidden"), 1800); return () => clearTimeout(t); } }, [phase, round]);
  const tap = (i: number) => {
    if (phase !== "hidden") return;
    const ok = i === spot; const c = correct + (ok ? 1 : 0);
    setChosen(i); setCorrect(c); setPhase("reveal");
    setTimeout(() => {
      if (round + 1 >= ROUNDS.length) { onDone({ accuracy: Math.round((c / ROUNDS.length) * 100), durationMs: Date.now() - start.current, offTargetTaps: ROUNDS.length - c, precisionErrorPx: 0, level: c >= 5 ? 3 : c >= 3 ? 2 : 1, note: `Remembered the hiding place ${c}/${ROUNDS.length} times (up to ${ROUNDS[ROUNDS.length - 1]} cups).` }); return; }
      const n = ROUNDS[round + 1];
      setRound(round + 1); setSpot(Math.floor(Math.random() * n)); setToy(pick(TOYS)); setChosen(null); setPhase("show");
    }, 1200);
  };
  return <Stage>
    <Progress i={round} n={ROUNDS.length} />
    <p className="text-center font-semibold">{phase === "show" ? L(lang, "Watch where the toy hides…", "Tazama mchezo unapojificha…") : L(lang, "Which cup is it under?", "Uko chini ya kikombe gani?")}</p>
    <div className="flex flex-wrap justify-center gap-3">{Array.from({ length: cups }, (_, i) => {
      const open = phase === "show" ? i === spot : phase === "reveal" && (i === spot || i === chosen);
      return <button key={i} onClick={() => tap(i)} className={`bg-card flex size-20 items-center justify-center rounded-2xl border-4 text-4xl transition-all ${phase === "reveal" && i === chosen ? (i === spot ? "border-success" : "border-destructive") : "border-border"}`}>
        {open && i === spot ? toy : <span className="bg-accent block h-12 w-14 rounded-t-full" />}
      </button>; })}</div>
  </Stage>;
}

// ---------- 3. Look Where I Look (joint attention) ----------
const PAIRS = [["🍎", "🎈"], ["🐱", "🚂"], ["🌸", "🧃"], ["🐟", "🦋"], ["🍌", "🥁"], ["🐘", "🌞"]];
export function JointAttentionGame({ lang, onDone }: GameProps) {
  const [trial, setTrial] = useState(0);
  const [side, setSide] = useState<0 | 1>(() => (Math.random() > 0.5 ? 1 : 0));
  const [cueOn, setCueOn] = useState(false);
  const [fb, setFb] = useState<number | null>(null);
  const res = useRef({ correct: 0, rts: [] as number[], start: Date.now(), cueAt: 0 });
  useEffect(() => { setCueOn(false); const t = setTimeout(() => { setCueOn(true); res.current.cueAt = Date.now(); }, 900); return () => clearTimeout(t); }, [trial]);
  const tap = (i: number) => {
    if (!cueOn || fb !== null) return;
    const ok = i === side;
    if (ok) res.current.correct++;
    res.current.rts.push(Date.now() - res.current.cueAt);
    setFb(i);
    setTimeout(() => {
      setFb(null);
      if (trial + 1 >= PAIRS.length) {
        const r = res.current; const avg = Math.round(r.rts.reduce((a, b) => a + b, 0) / r.rts.length);
        onDone({ accuracy: Math.round((r.correct / PAIRS.length) * 100), durationMs: Date.now() - r.start, offTargetTaps: PAIRS.length - r.correct, precisionErrorPx: 0, note: `Followed the friend's gaze and point ${r.correct}/${PAIRS.length} times; average response ${(avg / 1000).toFixed(1)}s.` });
        return;
      }
      setSide(Math.random() > 0.5 ? 1 : 0); setTrial(trial + 1);
    }, 800);
  };
  return <Stage>
    <Progress i={trial} n={PAIRS.length} />
    <p className="text-center font-semibold">{L(lang, "What is the friend looking at? Tap it!", "Rafiki anatazama nini? Kibonyeze!")}</p>
    <div className="flex w-full max-w-sm items-center justify-between">
      {[0, 1].map((i) => <button key={i} onClick={() => tap(i)} className={`bg-card flex size-24 items-center justify-center rounded-3xl border-4 text-5xl ${fb === i ? (i === side ? "border-success" : "border-destructive") : "border-border"} ${i === 1 ? "order-3" : "order-1"}`}>{PAIRS[trial][i]}</button>)}
      <div className="order-2 flex flex-col items-center">
        <span className={`text-6xl transition-transform duration-500 ${cueOn ? (side === 0 ? "-rotate-12 -translate-x-2" : "rotate-12 translate-x-2") : ""}`}>🧒🏾</span>
        <span className={`text-3xl transition-opacity ${cueOn ? "opacity-100" : "opacity-0"}`}>{side === 0 ? "👈" : "👉"}</span>
      </div>
    </div>
  </Stage>;
}

// ---------- 4. Bubble Pop (fine motor precision) ----------
export function TargetPopGame({ lang, onDone }: GameProps) {
  const N = 8;
  const box = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const res = useRef({ misses: 0, err: [] as number[], start: Date.now() });
  const move = () => setPos({ x: 15 + Math.random() * 70, y: 15 + Math.random() * 70 });
  const tapArea = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = box.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + (pos.x / 100) * r.width, cy = r.top + (pos.y / 100) * r.height;
    const d = Math.hypot(e.clientX - cx, e.clientY - cy);
    if (d > 40) { res.current.misses++; return; }
    res.current.err.push(d);
    const c = count + 1; setCount(c);
    if (c >= N) {
      const x = res.current; const avg = Math.round(x.err.reduce((a, b) => a + b, 0) / x.err.length);
      const acc = Math.round((N / (N + x.misses)) * 100);
      onDone({ accuracy: acc, durationMs: Date.now() - x.start, offTargetTaps: x.misses, precisionErrorPx: avg, note: `Popped ${N} bubbles with ${x.misses} missed taps; average distance from centre ${avg}px.` });
    } else move();
  };
  return <Stage>
    <Progress i={count} n={N} />
    <p className="text-center font-semibold">{L(lang, "Pop the bubble!", "Pasua kiputo!")}</p>
    <div ref={box} onPointerDown={tapArea} className="relative h-64 w-full touch-none">
      <span className="bg-primary/15 border-primary absolute size-16 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full border-4" style={{ left: `${pos.x}%`, top: `${pos.y}%` }} />
    </div>
  </Stage>;
}

// ---------- 5. Play Together Checklist (ASQ:SE-2 / INTER-NDA style observation) ----------
const PLAY_ITEMS = [
  { en: "Stacks 3 or more blocks", sw: "Hupanga matofali 3 au zaidi", emoji: "🧱" },
  { en: "Rolls a ball back and forth with you", sw: "Hubingirisha mpira kwako na kurudi", emoji: "⚽" },
  { en: "Copies an action (clap, wave bye-bye)", sw: "Huiga kitendo (kupiga makofi, kuaga)", emoji: "👏" },
  { en: "Follows a simple command (\"give me the cup\")", sw: "Hufuata agizo rahisi (\"nipe kikombe\")", emoji: "🥤" },
  { en: "Looks at you when you call their name", sw: "Hukutazama ukiita jina lake", emoji: "👀" },
  { en: "Shares enjoyment — smiles at you during play", sw: "Hufurahi pamoja — hukutabasamu wakati wa kucheza", emoji: "😊" },
  { en: "Uses words or gestures to ask for things", sw: "Hutumia maneno au ishara kuomba vitu", emoji: "🗣️" },
];
const SCORE = { yes: 2, sometimes: 1, no: 0 } as const;
export function PlayObservationGame({ lang, onDone }: GameProps) {
  const [ans, setAns] = useState<(keyof typeof SCORE | null)[]>(() => PLAY_ITEMS.map(() => null));
  const start = useRef(Date.now());
  const done = ans.every((a) => a !== null);
  const total = useMemo(() => ans.reduce((s, a) => s + (a ? SCORE[a] : 0), 0), [ans]);
  const finish = () => {
    const notYet = PLAY_ITEMS.filter((_, i) => ans[i] === "no").map((x) => x.en.toLowerCase());
    onDone({ accuracy: Math.round((total / (PLAY_ITEMS.length * 2)) * 100), durationMs: Date.now() - start.current, offTargetTaps: notYet.length, precisionErrorPx: 0, note: notYet.length ? `Caregiver reports "not yet" for: ${notYet.join("; ")}.` : "Caregiver observed all play behaviours at least sometimes." });
  };
  return <div className="space-y-2">
    <p className="text-muted-foreground text-sm">{L(lang, "Play with the child using real toys, then tick what you saw.", "Cheza na mtoto kwa vitu halisi, kisha weka alama ulichoona.")}</p>
    {PLAY_ITEMS.map((it, i) => <div key={i} className="border-border bg-card flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center">
      <span className="flex-1 font-medium"><span className="mr-2 text-2xl">{it.emoji}</span>{L(lang, it.en, it.sw)}</span>
      <div className="flex gap-1">{(["yes", "sometimes", "no"] as const).map((v) => <Button key={v} size="sm" variant={ans[i] === v ? "default" : "outline"} onClick={() => setAns(ans.map((a, k) => (k === i ? v : a)))}>
        {v === "yes" ? L(lang, "Yes", "Ndiyo") : v === "sometimes" ? L(lang, "Sometimes", "Wakati mwingine") : L(lang, "Not yet", "Bado")}</Button>)}</div>
    </div>)}
    <Button className="w-full" disabled={!done} onClick={finish}>{L(lang, "Finish observation", "Maliza uchunguzi")}</Button>
  </div>;
}
