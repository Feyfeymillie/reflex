import { useEffect, useMemo, useState } from "react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { Building2, ChevronDown, HeartPulse, ShieldAlert, Stethoscope } from "lucide-react";
import { assessConditions, conditionSummary, type ConditionResult } from "@/lib/conditions";
import type { Patient } from "@/lib/store";
import { StatusBadge } from "@/components/StatusBadge";
import { protocolFor } from "@/lib/protocols";
import { cn } from "@/lib/utils";

type Lang = "EN" | "SW";

const T = {
  EN: {
    title: "Multi-condition risk dashboard",
    sub: "10 pregnancy-related conditions scored from the latest visit and history. Each score shows what drove it.",
    high: "High", moderate: "Moderate", low: "Low",
    all: "All conditions", attention: "Needs attention",
    why: "Why this score", action: "Recommended action", facility: "Manage at",
    notApplicable: "Not applicable at this gestation",
    none: "No conditions need attention at this visit.",
    showAll: "Show all factors", showLess: "Show fewer",
    pts: "pts", top: "Highest risk", referral: "Referral recommended",
    disclaimer: "Decision support for trained health workers. It does not replace clinical judgement or national guidelines.",
    severe: "Severe features present", notSevere: "No severe features recorded", missing: "Missing test",
  },
  SW: {
    title: "Dashibodi ya hatari za magonjwa mbalimbali",
    sub: "Magonjwa 10 ya ujauzito yamepimwa kwa ziara ya hivi karibuni na historia. Kila alama inaonyesha chanzo chake.",
    high: "Juu", moderate: "Wastani", low: "Chini",
    all: "Yote", attention: "Yanayohitaji uangalizi",
    why: "Kwa nini alama hii", action: "Hatua inayopendekezwa", facility: "Mahali pa matibabu",
    notApplicable: "Haihusiani na umri huu wa ujauzito",
    none: "Hakuna ugonjwa unaohitaji uangalizi ziara hii.",
    showAll: "Onyesha vigezo vyote", showLess: "Onyesha vichache",
    pts: "pointi", top: "Hatari kubwa zaidi", referral: "Rufaa inapendekezwa",
    disclaimer: "Msaada wa maamuzi kwa watoa huduma waliofunzwa. Haichukui nafasi ya uamuzi wa daktari wala miongozo ya taifa.",
    severe: "Dalili kali zipo", notSevere: "Hakuna dalili kali zilizorekodiwa", missing: "Kipimo kinakosekana",
  },
} as const;

// Short radar labels so nothing is cut off mid-word
const SHORT: Record<string, { en: string; sw: string }> = {
  preeclampsia: { en: "Preeclampsia", sw: "Preeclampsia" },
  gdm: { en: "Gest. diabetes", sw: "Kisukari" },
  pph: { en: "PPH risk", sw: "Kutoka damu" },
  anaemia: { en: "Anaemia", sw: "Upungufu damu" },
  malaria: { en: "Malaria", sw: "Malaria" },
  hivsyph: { en: "HIV / Syphilis", sw: "VVU / Kaswende" },
  sepsis: { en: "Sepsis", sw: "Sepsis" },
  ectopic: { en: "Ectopic", sw: "Nje ya kizazi" },
  preterm: { en: "Preterm birth", sw: "Njiti" },
  depression: { en: "Depression", sw: "Msongo" },
};

export function useLang(): Lang {
  const [lang, setLang] = useState<Lang>("EN");
  useEffect(() => {
    const read = () => setLang(localStorage.getItem("mg:lang") === "SW" ? "SW" : "EN");
    read();
    const t = setInterval(read, 800); // AppShell toggles in the same tab; poll is cheap
    window.addEventListener("storage", read);
    return () => { clearInterval(t); window.removeEventListener("storage", read); };
  }, []);
  return lang;
}

const barColor = (l: ConditionResult["level"]) =>
  l === "High" ? "bg-destructive" : l === "Moderate" ? "bg-accent" : "bg-success";
const textColor = (l: ConditionResult["level"]) =>
  l === "High" ? "text-destructive" : l === "Moderate" ? "text-accent-foreground" : "text-success";

export function ConditionDashboard({ patient }: { patient: Patient }) {
  const lang = useLang();
  const t = T[lang];
  const [filter, setFilter] = useState<"all" | "attention">("all");
  const results = useMemo(() => assessConditions(patient), [patient]);
  const summary = useMemo(() => conditionSummary(results), [results]);

  if (results.length === 0) return null;

  const shown = results.filter((r) => (filter === "all" ? true : r.applicable && r.level !== "Low"));
  const radar = results.map((r) => ({
    condition: SHORT[r.id]?.[lang === "SW" ? "sw" : "en"] ?? r.name,
    score: r.applicable ? r.score : 0,
  }));

  return (
    <div className="rounded-2xl bg-card border border-border p-6 shadow-card print:hidden">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 font-semibold"><HeartPulse className="size-4 text-primary" /> {t.title}</div>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">{t.sub}</p>
        </div>
        {summary.needsReferral && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 text-destructive border border-destructive/40 px-3 py-1 text-xs font-medium">
            <ShieldAlert className="size-3.5" /> {t.referral}
          </span>
        )}
      </div>

      {/* Overview: radar + counts */}
      <div className="mt-5 grid md:grid-cols-[1fr_auto] gap-6 items-center">
        <div className="h-64 -ml-4">
          <ResponsiveContainer>
            <RadarChart data={radar} outerRadius="72%">
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis dataKey="condition" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} />
              <Radar dataKey="score" name="Risk" stroke="oklch(0.6 0.22 25)" fill="oklch(0.6 0.22 25)" fillOpacity={0.3} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-1 gap-3 min-w-[9rem]">
          <Count n={summary.high} label={t.high} tone="bg-destructive/15 text-destructive border-destructive/40" />
          <Count n={summary.moderate} label={t.moderate} tone="bg-warning/15 text-warning-foreground border-warning/40" />
          <Count n={summary.low} label={t.low} tone="bg-success/15 text-success border-success/30" />
        </div>
      </div>

      {/* Filter */}
      <div className="mt-5 inline-flex rounded-xl border border-border p-1 bg-secondary/50 text-sm">
        {(["all", "attention"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn("px-3 py-1.5 rounded-lg transition", filter === f ? "bg-card shadow-sm font-medium" : "text-muted-foreground hover:text-foreground")}>
            {f === "all" ? t.all : t.attention}
          </button>
        ))}
      </div>

      <div className="mt-4 grid lg:grid-cols-2 gap-3">
        {shown.length === 0 && <div className="text-sm text-muted-foreground lg:col-span-2">{t.none}</div>}
        {shown.map((r) => <ConditionCard key={r.id} r={r} lang={lang} />)}
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground">{t.disclaimer}</p>
    </div>
  );
}

function Count({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div className={cn("rounded-xl border px-4 py-3 text-center", tone)}>
      <div className="text-2xl font-bold leading-none">{n}</div>
      <div className="text-xs mt-1">{label}</div>
    </div>
  );
}

function ConditionCard({ r, lang }: { r: ConditionResult; lang: Lang }) {
  const t = T[lang];
  const [open, setOpen] = useState(r.level === "High");
  const [allDrivers, setAllDrivers] = useState(false);
  const drivers = allDrivers ? r.drivers : r.drivers.slice(0, 4);
  const maxPts = Math.max(1, ...r.drivers.map((d) => d.points));

  return (
    <div className={cn("rounded-xl border p-4 transition", r.applicable ? "border-border" : "border-border/60 opacity-60", r.level === "High" && r.applicable && "border-destructive/40 bg-destructive/5")}>
      <button onClick={() => r.applicable && setOpen(!open)} className="w-full text-left" aria-expanded={open}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium truncate">{lang === "SW" ? r.nameSw : r.name}</div>
            <div className="text-[11px] text-muted-foreground">{r.group}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {r.applicable ? <StatusBadge category={r.level} /> : <span className="text-[11px] text-muted-foreground">N/A</span>}
            {r.applicable && <ChevronDown className={cn("size-4 text-muted-foreground transition", open && "rotate-180")} />}
          </div>
        </div>
        {r.applicable ? (
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div className={cn("h-full rounded-full transition-all duration-700", barColor(r.level))} style={{ width: `${r.score}%` }} />
            </div>
            <div className={cn("text-sm font-semibold tabular-nums w-10 text-right", textColor(r.level))}>{r.score}%</div>
          </div>
        ) : (
          <div className="mt-2 text-xs text-muted-foreground">{t.notApplicable}</div>
        )}
      </button>

      {r.applicable && r.id === "preeclampsia" && r.htn && r.level !== "Low" && (
        <div className={cn("mt-2 inline-block rounded-full px-2.5 py-0.5 text-[11px] border",
          r.severe ? "bg-destructive/10 text-destructive border-destructive/40" : "bg-secondary text-muted-foreground border-border")}>
          {r.severe ? t.severe : t.notSevere}
        </div>
      )}
      {r.applicable && r.prompts.map((p, i) => (
        <div key={i} className="mt-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          <span className="font-semibold">{t.missing}: </span>{lang === "SW" ? p.sw : p.en}
        </div>
      ))}

      {open && r.applicable && (
        <div className="mt-4 space-y-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t.why}</div>
            {r.drivers.length === 0 ? (
              <div className="text-xs text-muted-foreground mt-2">—</div>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {drivers.map((d, i) => (
                  <li key={i} className="grid grid-cols-[1fr_auto] gap-x-3 items-center text-xs">
                    <div className="min-w-0">
                      <span className="font-medium">{d.label}</span>
                      {d.value && <span className="text-muted-foreground"> · {d.value}</span>}
                    </div>
                    <span className="tabular-nums text-muted-foreground">+{d.points} {t.pts}</span>
                    <div className="col-span-2 h-1 rounded-full bg-muted overflow-hidden">
                      <div className={cn("h-full rounded-full", barColor(r.level))} style={{ width: `${(d.points / maxPts) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {r.drivers.length > 4 && (
              <button onClick={() => setAllDrivers(!allDrivers)} className="mt-2 text-xs text-primary hover:underline">
                {allDrivers ? t.showLess : `${t.showAll} (${r.drivers.length})`}
              </button>
            )}
          </div>

          <div className="rounded-lg bg-secondary/60 p-3 text-xs space-y-2">
            <div className="flex gap-2"><Stethoscope className="size-3.5 mt-0.5 shrink-0 text-primary" />
              <div><span className="font-semibold">{t.action}: </span>{lang === "SW" ? r.actionSw : r.action}</div></div>
            <div className="flex gap-2"><Building2 className="size-3.5 mt-0.5 shrink-0 text-primary" />
              <div><span className="font-semibold">{t.facility}: </span>{r.facility}</div></div>
            {r.level !== "Low" && (protocolFor(r.id)?.refs || []).length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[11px]">
                {protocolFor(r.id)!.refs!.map((ref) => (
                  <a key={ref.url} href={ref.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {lang === "SW" ? "Mwongozo" : "Guideline"}: {ref.label.replace(/^Tanzania STG: /, "")}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
