import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Baby, CheckCircle2, HeartHandshake, PenLine, Siren, UserCheck } from "lucide-react";
import { errorText } from "@/lib/api";
import { reviewAssessment, type Analysis, type Band, type CheckIn, type Patient } from "@/lib/store";

import { bi, t, useLang } from "@/lib/i18n";
export const BAND_LABEL: Record<Band, string> = { low: "Low", medium: "Moderate", high: "High", urgent: "URGENT" };
export const BAND_CLASS: Record<Band, string> = {
  low: "bg-success/15 text-success border-success/30",
  medium: "bg-warning/15 text-warning-foreground border-warning/40",
  high: "bg-destructive/15 text-destructive border-destructive/40",
  urgent: "bg-destructive text-destructive-foreground border-destructive",
};

export function BandBadge({ band }: { band: Band }) {
  useLang();
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${BAND_CLASS[band]}`}>
      {t(BAND_LABEL[band])}
    </span>
  );
}

export function ModelNote({ analysis }: { analysis: Analysis }) {
  useLang();
  return (
    <p className="text-[11px] text-muted-foreground mt-3">
      {t("Flag for CHW review, not a diagnosis")} · {t("model")} {analysis.modelVersion}
      {analysis.computeMs !== undefined && <> · {t("scored in {ms} ms on the hub", { ms: analysis.computeMs.toFixed(1) })}</>}
      {analysis.modelVersion.startsWith("synthetic") && <> · {t("placeholder trained on synthetic data, not clinically validated")}</>}
    </p>
  );
}

export function UrgentBanner({ analysis }: { analysis: Analysis }) {
  useLang();
  if (!analysis.urgent) return null;
  return (
    <div className="mt-5 rounded-xl border border-destructive bg-destructive/10 p-4 flex gap-3">
      <Siren className="size-5 text-destructive shrink-0 mt-0.5" />
      <div>
        <div className="font-semibold text-destructive">{t("URGENT: danger sign found")}</div>
        <div className="text-sm">{t("A danger-sign rule overrides the model score.")} {bi(analysis.recommendationSw, analysis.recommendation)}</div>
        <div className="text-xs text-muted-foreground">{t("A referral was created automatically.")}</div>
      </div>
    </div>
  );
}

/** Human in control: every flag is accepted or overridden (with a reason) by the CHW. */
export function ChwDecision({ visit, onChange }: { visit: Pick<CheckIn, "assessmentId" | "review" | "referral"> & { analysis: { band: Band } }; onChange: (p: Patient) => void }) {
  useLang();
  const [overriding, setOverriding] = useState(false);
  const [band, setBand] = useState<Band>(visit.analysis.band);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function decide(decision: "accept" | "override") {
    if (decision === "override" && !reason.trim()) { toast.error(t("Write a reason for the override.")); return; }
    setBusy(true);
    try {
      onChange(await reviewAssessment(visit.assessmentId, decision, decision === "override" ? band : undefined, reason));
      toast.success(decision === "accept" ? t("Decision recorded") : t("Override recorded with reason"));
      setOverriding(false);
    } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  }

  const r = visit.review;
  return (
    <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
      <div className="flex items-center gap-2 font-semibold"><UserCheck className="size-4 text-primary" />{' '}{t("CHW decision")}</div>
      <p className="text-xs text-muted-foreground mt-1">{t("The hub only flags. You decide, and your decision is what counts.")}</p>
      {r ? (
        <div className="mt-3 text-sm flex flex-wrap items-center gap-2">
          {r.decision === "accept" ? <CheckCircle2 className="size-4 text-success" /> : <PenLine className="size-4 text-accent" />}
          {r.decision === "accept" ? t("Accepted as") : t("Overridden to")} <BandBadge band={r.finalBand} />
          {r.reason && <span className="text-muted-foreground">{t("Reason:")} {r.reason}</span>}
          {visit.referral && <span className="text-muted-foreground">· {t("Referral:")} {t(visit.referral.status)}</span>}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => decide("accept")}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50">
              <CheckCircle2 className="size-4" /> {t("Accept")} ({t(BAND_LABEL[visit.analysis.band])})
            </button>
            <button disabled={busy} onClick={() => setOverriding(!overriding)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card hover:bg-secondary">
              <PenLine className="size-4" />{' '}{t("I disagree: override")}
            </button>
          </div>
          {overriding && (
            <div className="grid sm:grid-cols-[180px_1fr_auto] gap-2 items-end">
              <label className="text-sm">{t("Correct level")}
                <select value={band} onChange={(e) => setBand(e.target.value as Band)}
                  className="mt-1 w-full px-3 py-2.5 rounded-lg bg-background border border-input text-sm">
                  {(["low", "medium", "high", "urgent"] as Band[]).map((b) => <option key={b} value={b}>{t(BAND_LABEL[b])}</option>)}
                </select>
              </label>
              <label className="text-sm">{t("Reason (required)")}
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("e.g. BP re-measured 128/82 after rest")}
                  className="mt-1 w-full px-3 py-2.5 rounded-lg bg-background border border-input text-sm" />
              </label>
              <button disabled={busy} onClick={() => decide("override")}
                className="px-4 py-2.5 rounded-xl bg-accent text-accent-foreground font-medium disabled:opacity-50">{t("Save")}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The one-journey links: the same record continues into the postpartum and child modules. */
export function ModuleLinks({ patient }: { patient: Patient }) {
  useLang();
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <Link to="/postpartum/$id" params={{ id: patient.id }}
        className="rounded-2xl bg-card border border-border p-5 shadow-card hover:bg-secondary/40 flex gap-3">
        <HeartHandshake className="size-5 text-teal shrink-0" />
        <div>
          <div className="font-semibold">{t("After birth: postpartum check")}</div>
          <div className="text-xs text-muted-foreground">
            {patient.pregnancy?.outcome && patient.pregnancy.outcome !== "ongoing"
              ? t("Delivered {date} · {n} EPDS screen(s)", { date: patient.pregnancy.deliveryDate ?? "", n: patient.postnatal.length })
              : t("Record the birth, then screen with EPDS")}
          </div>
        </div>
      </Link>
      {patient.children.length > 0 ? patient.children.map((c) => (
        <Link key={c.id} to="/child/$id" params={{ id: c.id }}
          className="rounded-2xl bg-card border border-border p-5 shadow-card hover:bg-secondary/40 flex gap-3">
          <Baby className="size-5 text-accent shrink-0" />
          <div>
            <div className="font-semibold">{t("{name}: growing up", { name: c.name })}</div>
            <div className="text-xs text-muted-foreground">{t("Milestones and play ideas for the parent")}</div>
          </div>
        </Link>
      )) : (
        <div className="rounded-2xl border border-dashed border-border p-5 flex gap-3 text-muted-foreground">
          <Baby className="size-5 shrink-0" />
          <div className="text-sm">{t("The child's page appears here once the birth is recorded.")}</div>
        </div>
      )}
    </div>
  );
}
