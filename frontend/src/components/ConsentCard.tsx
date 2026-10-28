import { ShieldCheck } from "lucide-react";
import type { Consent } from "@/lib/store";

import { bi, t, useLang } from "@/lib/i18n";
const SCRIPTS = {
  pregnancy: {
    sw: "Mimi ni mhudumu wa afya. Nitakuuliza maswali kuhusu ujauzito wako na kupima shinikizo la damu. Majibu yatahifadhiwa kwenye kifaa hiki cha kliniki tu, si kwenye intaneti. Kifaa kitanisaidia kuona kama unahitaji kwenda kituo cha afya mapema, lakini uamuzi ni wangu na wako, si wa kifaa. Unaweza kukataa au kusitisha wakati wowote, na bado utapata huduma.",
    en: "I'm a health worker. I'll ask about your pregnancy and check your blood pressure. Answers stay on this clinic device only, not the internet. The device helps me see if you need the facility early, but the decision is mine and yours, not the device's. You can refuse or stop at any time and still get care.",
  },
  postnatal_mh: {
    sw: "Nitakuuliza maswali 10 kuhusu jinsi ulivyojisikia siku 7 zilizopita. Hakuna jibu sahihi au baya. Majibu yanabaki kwenye kifaa hiki tu, na hayatatumwa kwa SMS. Ukihitaji msaada, nitakusaidia kuupata.",
    en: "I'll ask 10 questions about how you have felt in the past 7 days. There are no right or wrong answers. Answers stay on this device only and are never sent by SMS. If you need support, I'll help you get it.",
  },
  child_dev: {
    sw: "Tutaangalia pamoja mambo ambayo mtoto wako anaweza kufanya kwa umri wake, na nitakupa michezo ya kumsaidia. Hii si kipimo wala utambuzi. Taarifa zinabaki kwenye kifaa hiki tu.",
    en: "We'll look together at what your child can do for their age, and I'll give you play ideas to help. This is not a test or a diagnosis. Information stays on this device only.",
  },
} as const;

export function ConsentCard({ module, value, onChange }: {
  module: keyof typeof SCRIPTS; value: Consent; onChange: (c: Consent) => void;
}) {
  useLang();
  const s = SCRIPTS[module];
  const box = (k: keyof Consent, label: string) => (
    <label className="flex items-start gap-3 py-2 cursor-pointer">
      <input type="checkbox" className="mt-0.5 size-5 accent-[var(--primary)]" checked={!!value[k]}
        onChange={(e) => onChange({ ...value, [k]: e.target.checked })} />
      <span className="text-sm">{label}</span>
    </label>
  );
  return (
    <section className="rounded-2xl bg-card border border-border p-5 lg:p-6 shadow-card">
      <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-teal" />{' '}{t("Consent")}</div>
      <p className="text-xs text-muted-foreground mt-1">{t("Read this aloud to the mother:")}</p>
      <p className="mt-2 rounded-xl bg-secondary/60 p-3 text-sm">{bi(s.sw, s.en)}</p>
      <details className="mt-1 text-xs text-muted-foreground">
        <summary className="cursor-pointer">{t("Show in the other language")}</summary>
        <p className="mt-1">{bi(s.en, s.sw)}</p>
      </details>
      <div className="mt-3">
        {box("care", module === "child_dev" ? t("The mother agrees, for her child, to care and to the information being stored on this hub (required)") : t("She agrees to care and to the information being stored on this hub (required)"))}
        {box("aggregate_reporting", t("Anonymous counts may be used in district reports"))}
        {box("research", t("De-identified data may be used for research (separate opt-in)"))}
      </div>
      <p className="text-[11px] text-muted-foreground">{t("Verbal consent witnessed by the CHW · script sw-care-v0.1")}</p>
    </section>
  );
}
