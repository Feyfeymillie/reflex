import { useEffect, useMemo, useState } from "react";
import { Volume2, X } from "lucide-react";
import { getLang, t, useLang } from "@/lib/i18n";

// Pictures a Tanzanian toddler sees every day. Emoji are drawn by the phone's own font, so nothing is downloaded.
const PICTURES = [
  { e: "🐄", sw: "ng'ombe", where: "Ng'ombe yuko wapi?", en: "cow" },
  { e: "🐔", sw: "kuku", where: "Kuku yuko wapi?", en: "chicken" },
  { e: "🐐", sw: "mbuzi", where: "Mbuzi yuko wapi?", en: "goat" },
  { e: "🐕", sw: "mbwa", where: "Mbwa yuko wapi?", en: "dog" },
  { e: "🐈", sw: "paka", where: "Paka yuko wapi?", en: "cat" },
  { e: "🐟", sw: "samaki", where: "Samaki yuko wapi?", en: "fish" },
  { e: "🍌", sw: "ndizi", where: "Ndizi iko wapi?", en: "banana" },
  { e: "🥭", sw: "embe", where: "Embe liko wapi?", en: "mango" },
  { e: "⚽", sw: "mpira", where: "Mpira uko wapi?", en: "ball" },
  { e: "🚗", sw: "gari", where: "Gari liko wapi?", en: "car" },
  { e: "👶", sw: "mtoto", where: "Mtoto yuko wapi?", en: "baby" },
  { e: "☕", sw: "kikombe", where: "Kikombe kiko wapi?", en: "cup" },
];
type Pic = (typeof PICTURES)[number];
const word = (p: Pic) => (getLang() === "sw" ? p.sw : p.en);
// Swahili agreement changes with the noun class (yuko / iko / liko / uko / kiko), so each picture carries its own question.
const where = (p: Pic) => (getLang() === "sw" ? p.where : `Where is the ${p.en}?`);
const look = (p: Pic) => (getLang() === "sw" ? `Tazama! ${p.sw[0].toUpperCase()}${p.sw.slice(1)}` : `Look! A ${p.en}`);

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

/** Read aloud only if the phone already has a voice for the chosen language. Nothing is fetched. */
function useVoice() {
  const lang = useLang();
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  useEffect(() => {
    if (typeof speechSynthesis === "undefined") return;
    const find = () => setVoice(speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang) && v.localService) ?? null);
    find();
    speechSynthesis.addEventListener("voiceschanged", find);
    return () => speechSynthesis.removeEventListener("voiceschanged", find);
  }, [lang]);
  return voice ? (text: string) => { const u = new SpeechSynthesisUtterance(text); u.voice = voice; u.lang = voice.lang; speechSynthesis.cancel(); speechSynthesis.speak(u); } : null;
}

/**
 * Full-screen play for the child, with the parent beside them.
 * Under 12 months: "Look and say", one big picture at a time; the parent names it, the baby taps for the next.
 * 12 months and up: "Find the picture", 2 to 4 tiles by age; the parent reads the question, the child points or taps.
 * Nothing is scored or saved: a wrong tap just wiggles.
 */
export function PictureGame({ ageMonths, name, onClose }: { ageMonths: number; name: string; onClose: () => void }) {
  useLang();
  const say = useVoice();
  const tiles = ageMonths < 12 ? 1 : ageMonths < 18 ? 2 : ageMonths < 24 ? 3 : 4;
  const [round, setRound] = useState(0);
  const [stars, setStars] = useState(0);
  const [wrong, setWrong] = useState<string>();
  const [won, setWon] = useState(false);
  const { choices, target } = useMemo(() => {
    const c = shuffle(PICTURES).slice(0, tiles);
    return { choices: c, target: c[Math.floor(Math.random() * c.length)] };
  }, [round, tiles]);

  const prompt = tiles === 1 ? look(target) : where(target);
  useEffect(() => { say?.(prompt); }, [round]); // eslint-disable-line react-hooks/exhaustive-deps

  function tap(p: Pic) {
    if (won) return;
    if (tiles === 1 || p === target) {
      setWon(true); setStars((s) => s + 1);
      say?.(t("Well done!"));
      setTimeout(() => { setWon(false); setWrong(undefined); setRound((r) => r + 1); }, tiles === 1 ? 700 : 1400);
    } else {
      setWrong(p.e);
      setTimeout(() => setWrong(undefined), 500);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-gradient-soft flex flex-col" role="dialog" aria-label={t("Find the picture")}>
      <div className="flex items-center justify-between p-4">
        <div className="text-lg font-bold">{"⭐".repeat(Math.min(stars, 10))}{stars > 10 ? ` +${stars - 10}` : ""}</div>
        <button onClick={onClose} className="size-12 rounded-full bg-card border border-border flex items-center justify-center" aria-label={t("Close")}><X className="size-6" /></button>
      </div>
      <div className="px-4 text-center">
        <div className="text-3xl sm:text-4xl font-bold leading-tight">{prompt}</div>
        <div className="text-sm text-muted-foreground mt-2">
          {tiles === 1 ? t("Say the word with {name}, then tap the picture.", { name }) : t("Read the question to {name}. Let them point or tap.", { name })}
        </div>
        {say && <button onClick={() => say(prompt)} className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border text-sm"><Volume2 className="size-4" />{' '}{t("Say it again")}</button>}
      </div>
      <div className={`flex-1 grid gap-4 p-4 sm:p-8 content-center mx-auto w-full max-w-3xl ${tiles === 1 ? "grid-cols-1" : tiles === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {choices.map((p) => (
          <button key={p.e} onClick={() => tap(p)}
            className={`aspect-square rounded-3xl bg-card border-4 shadow-card flex items-center justify-center select-none transition-transform active:scale-95
              ${won && (p === target || tiles === 1) ? "border-success animate-bounce" : "border-border"} ${wrong === p.e ? "animate-wiggle" : ""}`}
            style={{ fontSize: tiles === 1 ? "min(45vw, 40vh)" : tiles === 2 ? "min(30vw, 28vh)" : "min(18vw, 20vh)" }}
            aria-label={word(p)}>
            <span aria-hidden>{p.e}</span>
          </button>
        ))}
      </div>
      {won && tiles > 1 && <div className="pointer-events-none fixed inset-0 flex items-center justify-center text-6xl font-extrabold text-success drop-shadow animate-pop">{t("Well done!")} 🎉</div>}
    </div>
  );
}

/** "We did it today" on each play idea; one sticker per idea per day, kept on the hub. */
export function StickerChart({ play }: { play: { total: number; daysThisWeek: number } }) {
  useLang();
  return (
    <div className="rounded-xl bg-secondary/60 p-4 flex flex-wrap items-center gap-3">
      <div className="text-2xl tracking-wider" aria-hidden>{play.total === 0 ? "☆☆☆" : "⭐".repeat(Math.min(play.total, 14))}{play.total > 14 ? "…" : ""}</div>
      <div className="text-sm">
        <div className="font-semibold">{t("{n} stickers", { n: play.total })}</div>
        <div className="text-muted-foreground text-xs">{t("Played on {n} of the last 7 days", { n: play.daysThisWeek })}</div>
      </div>
    </div>
  );
}
