// Module 2: intervention tracking. Stored in localStorage (offline-first), separate from patient records.
// One plan per patient per visit, so every flag keeps its own audit trail.
export type RefStatus = "Not sent" | "Sent" | "Accepted" | "Arrived" | "Treated";
export const REF_STEPS: RefStatus[] = ["Not sent", "Sent", "Accepted", "Arrived", "Treated"];

export type PlanState = {
  patientId: string;
  visitId: string;
  flaggedAt: string; // when this plan was first opened for the visit
  actions: Record<string, { at: string }>; // action id -> completion time
  referral: { status: RefStatus; times: Partial<Record<RefStatus, string>> };
  followUpDate?: string; // yyyy-mm-dd
  followUpDone?: string;
  delivered?: string; // yyyy-mm-dd
};

const KEY = "reflex:interventions:v1";

function readAll(): Record<string, PlanState> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}

function writeAll(all: Record<string, PlanState>) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage full or blocked: keep working in memory */ }
}

const k = (patientId: string, visitId: string) => `${patientId}:${visitId}`;

export function loadPlan(patientId: string, visitId: string): PlanState {
  const all = readAll();
  const existing = all[k(patientId, visitId)];
  if (existing) return existing;
  const fresh: PlanState = {
    patientId, visitId,
    flaggedAt: new Date().toISOString(),
    actions: {},
    referral: { status: "Not sent", times: {} },
  };
  // carry over delivery date and referral status from the previous plan of this patient, if any
  const prev = Object.values(all).filter((p) => p.patientId === patientId).sort((a, b) => b.flaggedAt.localeCompare(a.flaggedAt))[0];
  if (prev?.delivered) fresh.delivered = prev.delivered;
  all[k(patientId, visitId)] = fresh;
  writeAll(all);
  return fresh;
}

export function savePlan(plan: PlanState) {
  const all = readAll();
  all[k(plan.patientId, plan.visitId)] = plan;
  writeAll(all);
}

export function toggleAction(plan: PlanState, actionId: string): PlanState {
  const actions = { ...plan.actions };
  if (actions[actionId]) delete actions[actionId];
  else actions[actionId] = { at: new Date().toISOString() };
  const next = { ...plan, actions };
  savePlan(next);
  return next;
}

export function advanceReferral(plan: PlanState): PlanState {
  const i = REF_STEPS.indexOf(plan.referral.status);
  if (i >= REF_STEPS.length - 1) return plan;
  const status = REF_STEPS[i + 1];
  const next = { ...plan, referral: { status, times: { ...plan.referral.times, [status]: new Date().toISOString() } } };
  savePlan(next);
  return next;
}

export function undoReferral(plan: PlanState): PlanState {
  const i = REF_STEPS.indexOf(plan.referral.status);
  if (i <= 0) return plan;
  const times = { ...plan.referral.times };
  delete times[plan.referral.status];
  const next = { ...plan, referral: { status: REF_STEPS[i - 1], times } };
  savePlan(next);
  return next;
}

/** Minutes from the flag to the first completed action, or undefined if nothing is done yet. */
export function minutesToFirstAction(plan: PlanState): number | undefined {
  const times = Object.values(plan.actions).map((a) => new Date(a.at).getTime());
  if (times.length === 0) return undefined;
  return Math.max(0, Math.round((Math.min(...times) - new Date(plan.flaggedAt).getTime()) / 60000));
}

/** Suggested next contact by level. Intervals are suggestions: confirm with your guideline. */
export function suggestedFollowUpDays(level: "High" | "Moderate" | "Low", gestWeeks: number): number {
  if (level === "High") return 1; // call the patient / receiving facility the next day
  if (level === "Moderate") return gestWeeks >= 32 ? 3 : 7;
  return 28;
}
