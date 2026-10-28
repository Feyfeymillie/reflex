import type { ReactNode } from "react";

import { t, useLang } from "@/lib/i18n";
export const DANGER_SIGNS = [
  "Severe headache",
  "Blurred vision",
  "Vaginal bleeding",
  "Severe abdominal pain",
  "Fever",
  "Convulsions / fits",
  "Reduced fetal movement",
  "Swelling of face or hands",
  "Difficulty breathing",
  "Severe vomiting",
  "Painful urination",
  "Leaking liquor",
];

export function Section({ title, step, hint, children }: { title: string; step?: string; hint?: string; children: ReactNode }) {
  useLang();
  return (
    <section className="rounded-2xl bg-card border border-border p-5 lg:p-6 shadow-card">
      <div className="flex items-start gap-3">
        {step && (
          <span className="shrink-0 mt-0.5 size-7 grid place-items-center rounded-lg bg-primary/10 text-primary text-xs font-bold">{step}</span>
        )}
        <div>
          <h2 className="font-semibold">{t(title)}</h2>
          {hint && <p className="text-xs text-muted-foreground mt-0.5">{t(hint)}</p>}
        </div>
      </div>
      <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
    </section>
  );
}

const inputCls =
  "mt-1.5 w-full px-3 py-2.5 rounded-lg bg-background border border-input text-sm outline-none focus:ring-2 focus:ring-ring";

export function TF({ label, value, onChange, placeholder, type = "text", span }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; span?: boolean;
}) {
  useLang();
  return (
    <div className={span ? "sm:col-span-2 lg:col-span-3" : undefined}>
      <label className="text-sm font-medium">{t(label)}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder && t(placeholder)} className={inputCls} />
    </div>
  );
}

export function SF({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  useLang();
  return (
    <div>
      <label className="text-sm font-medium">{t(label)}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">—</option>
        {options.map((o) => <option key={o} value={o}>{t(o)}</option>)}
      </select>
    </div>
  );
}

export function TA({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  useLang();
  return (
    <div className="sm:col-span-2 lg:col-span-3">
      <label className="text-sm font-medium">{t(label)}</label>
      <textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className={`${inputCls} resize-none`} />
    </div>
  );
}

export function DangerSigns({ selected, onToggle }: { selected: string[]; onToggle: (s: string) => void }) {
  useLang();
  return (
    <div className="sm:col-span-2 lg:col-span-3">
      <label className="text-sm font-medium">{t("Danger signs observed this visit")}</label>
      <div className="mt-2 flex flex-wrap gap-2">
        {DANGER_SIGNS.map((s) => {
          const on = selected.includes(s);
          return (
            <button key={s} type="button" onClick={() => onToggle(s)}
              className={`px-3 py-1.5 rounded-full text-xs border transition ${on ? "bg-destructive text-destructive-foreground border-destructive" : "bg-background border-border hover:bg-secondary"}`}>
              {t(s)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const YESNO = ["Yes", "No"];
export const TEST_RESULT = ["Not done", "Negative", "Positive"];

/* ---- RCH4 laboratory option sets ---- */
export const URINE_PROTEIN = ["Nil", "Trace", "1+", "2+", "3+", "4+"];
export const URINE_GLUCOSE = ["Nil", "Trace", "1+", "2+", "3+"];
export const REACTIVE_UNKNOWN = ["Non-Reactive", "Reactive", "Unknown"];
export const REACTIVE_NOTDONE = ["Non-Reactive", "Reactive", "Not Done"];
export const POS_NEG_NOTDONE = ["Negative", "Positive", "Not Done"];
export const BLOOD_GROUPS = ["A", "B", "AB", "O"];
export const RHESUS = ["Rh+", "Rh-"];
export const SUGAR_UNITS = ["mmol/L", "mg/dL"];

/** Numeric input with a fixed unit suffix. */
export function NF({ label, value, onChange, placeholder, suffix, step = "0.1" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; suffix?: string; step?: string;
}) {
  useLang();
  return (
    <div>
      <label className="text-sm font-medium">{t(label)}</label>
      <div className="mt-1.5 flex items-stretch rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring overflow-hidden">
        <input type="number" inputMode="decimal" step={step} value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} className="w-full px-3 py-2.5 bg-transparent text-sm outline-none" />
        {suffix && <span className="shrink-0 px-3 grid place-items-center text-xs text-muted-foreground bg-secondary border-l border-input">{suffix}</span>}
      </div>
    </div>
  );
}

/** Numeric input with a selectable unit (e.g. blood sugar mmol/L vs mg/dL). */
export function NUF({ label, value, onChange, unit, onUnitChange, units, placeholder, step = "0.1" }: {
  label: string; value: string; onChange: (v: string) => void;
  unit: string; onUnitChange: (u: string) => void; units: string[];
  placeholder?: string; step?: string;
}) {
  useLang();
  return (
    <div>
      <label className="text-sm font-medium">{t(label)}</label>
      <div className="mt-1.5 flex items-stretch rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring overflow-hidden">
        <input type="number" inputMode="decimal" step={step} value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} className="w-full px-3 py-2.5 bg-transparent text-sm outline-none" />
        <select value={unit || units[0]} onChange={(e) => onUnitChange(e.target.value)}
          className="shrink-0 px-2 text-xs bg-secondary border-l border-input outline-none">
          {units.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
    </div>
  );
}
