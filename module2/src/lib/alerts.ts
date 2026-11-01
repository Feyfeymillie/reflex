// Referral alert text (SMS style), built from the same engine as the dashboard.
import { assessConditions } from "./conditions";
import { gestationAt, latest, type Patient } from "./store";

export function buildAlert(p: Patient, lang: "EN" | "SW"): string {
  const visit = latest(p);
  if (!visit) return "";
  const gest = gestationAt(p, visit.date);
  const top = assessConditions(p).find((r) => r.applicable);
  const clinic = p.rch4?.clinicName || "-";
  if (!top) return lang === "SW" ? "Hakuna hatari iliyobainishwa." : "No risk flagged.";
  if (lang === "SW") {
    return [
      "REFLEX AI DHARURA",
      `Mgonjwa: ${p.name}, miaka ${p.age}`,
      `Ujauzito wiki ${gest}, BP ${visit.bloodPressure}`,
      `Hatari: ${top.nameSw} (${top.score}%)`,
      `Rufaa kwa: ${top.facility}`,
      `Kutoka: ${clinic}`,
    ].join("\n");
  }
  return [
    "REFLEX AI URGENT",
    `Patient: ${p.name}, age ${p.age}`,
    `${gest} weeks, BP ${visit.bloodPressure}`,
    `Risk: ${top.name} (${top.score}%)`,
    `Findings: ${top.drivers.slice(0, 3).map((d) => d.label + (d.value ? ` ${d.value}` : "")).join(", ") || "-"}`,
    `Refer to: ${top.facility}`,
    `From: ${clinic}`,
  ].join("\n");
}
