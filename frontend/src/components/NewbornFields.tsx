// Birth record of the baby: Apgar at 1 and 5 minutes (tap each sign, or type the total from the card),
// golden-minute breathing help and birth weight. The hub applies the rules (app/newborn.py); nothing here diagnoses.
import { t, useLang } from "@/lib/i18n";

export const APGAR_SIGNS = [
  { key: "appearance", label: "Appearance (skin colour)", options: ["Blue or pale all over", "Body pink, hands and feet blue", "Pink all over"] },
  { key: "pulse", label: "Pulse (heart rate)", options: ["No heartbeat", "Below 100 per minute", "100 or more per minute"] },
  { key: "grimace", label: "Grimace (reflex when touched)", options: ["No response", "Grimaces", "Cries, coughs or sneezes"] },
  { key: "activity", label: "Activity (muscle tone)", options: ["Limp", "Some bending of arms and legs", "Moves actively"] },
  { key: "respiration", label: "Respiration (breathing)", options: ["Not breathing", "Slow or irregular, weak cry", "Breathing well, strong cry"] },
] as const;
type SignKey = (typeof APGAR_SIGNS)[number]["key"];
type Parts = Partial<Record<SignKey, number>>;

export const BREATHING_HELP: Record<string, string> = {
  "Cried or breathed well on their own": "none",
  "Needed drying and rubbing only": "stimulation",
  "Needed bag-and-mask breathing": "bag_mask",
  "Don't know": "unknown",
};
export const NB_SOURCE: Record<string, string> = {
  "Clinic card": "clinic_card",
  "Birth attendant": "birth_attendant",
  "Mother's report": "mother_report",
};

export type Newborn = {
  mode1: "signs" | "total"; parts1: Parts; total1: string;
  mode5: "signs" | "total"; parts5: Parts; total5: string;
  breathingHelp: string; birthWeightGrams: string; source: string;
};
export const emptyNewborn = (): Newborn => ({
  mode1: "signs", parts1: {}, total1: "", mode5: "signs", parts5: {}, total5: "", breathingHelp: "", birthWeightGrams: "", source: "",
});

const sum = (p: Parts) => Object.values(p).reduce<number>((a, b) => a + (b ?? 0), 0);
const complete = (p: Parts) => APGAR_SIGNS.every((s) => p[s.key] !== undefined);

export function apgarBand(total: number | null | undefined): "reassuring" | "moderate" | "low" | null {
  if (total === null || total === undefined) return null;
  return total >= 7 ? "reassuring" : total >= 4 ? "moderate" : "low";
}
export const BAND_TXT = { reassuring: "Reassuring (7-10)", moderate: "Moderately abnormal (4-6)", low: "Low (0-3)" } as const;
export const BAND_CLS = { reassuring: "text-success", moderate: "text-warning", low: "text-destructive" } as const;

/** What the hub expects: a total 0-10, all five signs, or nothing. Half-filled signs are sent so the hub explains the error. */
export function newbornPayload(n: Newborn) {
  const one = (mode: "signs" | "total", parts: Parts, total: string) =>
    mode === "total" ? (total === "" ? undefined : total) : Object.keys(parts).length ? parts : undefined;
  return {
    apgar1: one(n.mode1, n.parts1, n.total1), apgar5: one(n.mode5, n.parts5, n.total5),
    breathingHelp: BREATHING_HELP[n.breathingHelp] || undefined,
    birthWeightGrams: n.birthWeightGrams || undefined, source: NB_SOURCE[n.source] || undefined,
  };
}

function ApgarAt({ minute, mode, parts, total, onMode, onPart, onTotal }: {
  minute: 1 | 5; mode: "signs" | "total"; parts: Parts; total: string;
  onMode: (m: "signs" | "total") => void; onPart: (k: SignKey, v: number) => void; onTotal: (v: string) => void;
}) {
  useLang();
  const shown = mode === "signs" ? (complete(parts) ? sum(parts) : null) : total === "" ? null : Number(total);
  const band = shown !== null && shown >= 0 && shown <= 10 ? apgarBand(shown) : null;
  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold text-sm">{t("Apgar at {n} minute(s)", { n: minute })}</div>
        <div className="flex gap-1 text-xs">
          {(["signs", "total"] as const).map((m) => (
            <button key={m} type="button" onClick={() => onMode(m)}
              className={`px-2.5 py-1 rounded-md border ${mode === m ? "border-primary bg-primary/10 font-semibold" : "border-border"}`}>
              {m === "signs" ? t("Score each sign") : t("Total from card")}
            </button>
          ))}
        </div>
      </div>
      {mode === "signs" ? APGAR_SIGNS.map((s) => (
        <div key={s.key}>
          <div className="text-xs font-medium text-muted-foreground">{t(s.label)}</div>
          <div className="mt-1 grid grid-cols-3 gap-1.5">
            {s.options.map((o, i) => (
              <button key={o} type="button" onClick={() => onPart(s.key, i)}
                className={`rounded-lg border px-2 py-2 text-xs text-left ${parts[s.key] === i ? "border-primary bg-primary/10 font-semibold" : "border-border bg-background"}`}>
                <span className="font-bold">{i}</span> · {t(o)}
              </button>
            ))}
          </div>
        </div>
      )) : (
        <input type="number" min={0} max={10} value={total} onChange={(e) => onTotal(e.target.value)} placeholder="0-10"
          className="w-32 px-3 py-2.5 rounded-lg bg-background border border-input text-sm" />
      )}
      <div className="text-sm">
        {t("Total")}: <span className="font-bold">{shown ?? "—"}</span>{band && <span className={`ml-2 font-medium ${BAND_CLS[band]}`}>{t(BAND_TXT[band])}</span>}
      </div>
    </div>
  );
}

export function NewbornFields({ n, onChange }: { n: Newborn; onChange: (n: Newborn) => void }) {
  useLang();
  const up = (patch: Partial<Newborn>) => onChange({ ...n, ...patch });
  const sel = "mt-1.5 w-full px-3 py-2.5 rounded-lg bg-background border border-input text-sm";
  return (
    <div className="sm:col-span-2 lg:col-span-3 space-y-3">
      <p className="text-xs text-muted-foreground">
        {t("Leave blank what you don't know. Apgar is not a diagnosis: a low score or breathing help only means the child is followed more closely.")}
      </p>
      <div className="grid lg:grid-cols-2 gap-3">
        <ApgarAt minute={1} mode={n.mode1} parts={n.parts1} total={n.total1} onMode={(m) => up({ mode1: m })}
          onPart={(k, v) => up({ parts1: { ...n.parts1, [k]: v } })} onTotal={(v) => up({ total1: v })} />
        <ApgarAt minute={5} mode={n.mode5} parts={n.parts5} total={n.total5} onMode={(m) => up({ mode5: m })}
          onPart={(k, v) => up({ parts5: { ...n.parts5, [k]: v } })} onTotal={(v) => up({ total5: v })} />
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className="text-sm font-medium">{t("First minute: did the baby need help to breathe?")}</label>
          <select value={n.breathingHelp} onChange={(e) => up({ breathingHelp: e.target.value })} className={sel}>
            <option value="">—</option>
            {Object.keys(BREATHING_HELP).map((o) => <option key={o} value={o}>{t(o)}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">{t("Birth weight (grams)")}</label>
          <input type="number" value={n.birthWeightGrams} onChange={(e) => up({ birthWeightGrams: e.target.value })} placeholder="3200" className={sel} />
        </div>
        <div>
          <label className="text-sm font-medium">{t("Where do these values come from?")}</label>
          <select value={n.source} onChange={(e) => up({ source: e.target.value })} className={sel}>
            <option value="">—</option>
            {Object.keys(NB_SOURCE).map((o) => <option key={o} value={o}>{t(o)}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
