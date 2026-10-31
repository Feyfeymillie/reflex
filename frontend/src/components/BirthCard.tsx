// Birth record on the child page: Apgar, golden-minute help, birth weight, and the "watch closely" flag.
import { useState } from "react";
import { toast } from "sonner";
import { Eye, HeartPulse } from "lucide-react";
import { BAND_CLS, BAND_TXT, BREATHING_HELP, NewbornFields, emptyNewborn, newbornPayload } from "@/components/NewbornFields";
import { api, errorText } from "@/lib/api";
import { bi, t, useLang } from "@/lib/i18n";

type Band = keyof typeof BAND_TXT;
export type NewbornSummary = {
  recorded: boolean; apgar1: number | null; apgar5: number | null; apgar1Band: Band | null; apgar5Band: Band | null;
  breathingHelp: string | null; birthWeightGrams: number | null; source: string | null; place: string | null;
  watchClosely: boolean; clinicCheck: boolean; reasons: { code: string; sw: string; en: string }[];
  messageSw: string; messageEn: string;
};

const HELP_LABEL = Object.fromEntries(Object.entries(BREATHING_HELP).map(([label, v]) => [v, label]));
const SOURCE_LABEL: Record<string, string> = { clinic_card: "Clinic card", birth_attendant: "Birth attendant", mother_report: "Mother's report" };

export function BirthCard({ childId, nb, onSaved }: { childId: string; nb: NewbornSummary; onSaved: (child: unknown) => void }) {
  useLang();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyNewborn);

  async function save() {
    try {
      onSaved(await api("POST", `/api/v1/children/${childId}/newborn`, newbornPayload(form)));
      setEditing(false); setForm(emptyNewborn());
      toast.success(t("Birth record saved"));
    } catch (e) { toast.error(errorText(e)); }
  }

  const Apgar = ({ n, v, b }: { n: number; v: number | null; b: Band | null }) => (
    <div className="rounded-xl border border-border p-3">
      <div className="text-xs text-muted-foreground">{t("Apgar at {n} minute(s)", { n })}</div>
      <div className="text-2xl font-bold">{v ?? "—"}<span className="text-sm font-normal text-muted-foreground">{v !== null ? "/10" : ""}</span></div>
      {b && <div className={`text-xs font-medium ${BAND_CLS[b]}`}>{t(BAND_TXT[b])}</div>}
    </div>
  );

  return (
    <div className={`rounded-2xl p-6 shadow-card space-y-4 border-2 ${nb.watchClosely ? "border-warning/60 bg-warning/5" : "border-border bg-card"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold"><HeartPulse className="size-5 text-accent" /> {t("Birth record")}</div>
        <button onClick={() => setEditing((e) => !e)} className="text-sm text-primary font-medium">
          {editing ? t("Cancel") : nb.recorded ? t("Correct") : t("Add Apgar and birth details")}
        </button>
      </div>

      {nb.recorded && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Apgar n={1} v={nb.apgar1} b={nb.apgar1Band} />
          <Apgar n={5} v={nb.apgar5} b={nb.apgar5Band} />
          <div className="rounded-xl border border-border p-3">
            <div className="text-xs text-muted-foreground">{t("First minute")}</div>
            <div className="text-sm font-medium mt-1">{nb.breathingHelp ? t(HELP_LABEL[nb.breathingHelp] ?? nb.breathingHelp) : "—"}</div>
          </div>
          <div className="rounded-xl border border-border p-3">
            <div className="text-xs text-muted-foreground">{t("Birth weight (grams)")}</div>
            <div className="text-2xl font-bold">{nb.birthWeightGrams ?? "—"}</div>
          </div>
        </div>
      )}
      {nb.recorded && nb.source && <div className="text-xs text-muted-foreground">{t("Source")}: {t(SOURCE_LABEL[nb.source] ?? nb.source)}</div>}

      {nb.watchClosely && (
        <div className="rounded-xl bg-warning/10 p-4 text-sm space-y-2">
          <div className="flex items-center gap-2 font-semibold"><Eye className="size-4" /> {t("Watch closely")}</div>
          <ul className="list-disc pl-5">{nb.reasons.map((r) => <li key={r.code}>{bi(r.sw, r.en)}</li>)}</ul>
          <p>{bi(nb.messageSw, nb.messageEn)}</p>
        </div>
      )}
      {!nb.watchClosely && nb.recorded && <p className="text-sm">{bi(nb.messageSw, nb.messageEn)}</p>}
      {!nb.recorded && !editing && <p className="text-sm text-muted-foreground">{t("No Apgar recorded yet. Copy it from the clinic card, or ask the mother whether the baby needed help to breathe.")}</p>}

      {editing && (
        <div className="space-y-3">
          <NewbornFields n={form} onChange={setForm} />
          <button onClick={save} className="px-5 py-3 rounded-xl bg-primary text-primary-foreground font-medium">{t("Save birth record")}</button>
        </div>
      )}
    </div>
  );
}
