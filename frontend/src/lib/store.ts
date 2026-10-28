// Patient store backed by the RefleX hub (Raspberry Pi) API. Scoring happens on the hub:
// XGBoost model + danger-sign rules (app/pregnancy.py). Nothing clinical is computed in the browser.
import { api } from "./api";

export type RiskCategory = "Low" | "Moderate" | "High";
export type Band = "low" | "medium" | "high" | "urgent";

export type Finding = { label: string; labelSw?: string; severity: RiskCategory; note: string; noteSw?: string };

export type Analysis = {
  riskScore: number; // 0-100, model probability x 100
  category: RiskCategory;
  band: Band; // "urgent" = a danger-sign rule overrode the model
  urgent: boolean;
  findings: Finding[];
  recommendation: string;
  recommendationSw?: string;
  modelVersion: string;
  ruleOverride: boolean;
  computeMs?: number;
  trend?: "improving" | "stable" | "worsening";
  delta?: number; // change vs previous visit
};

export type Review = { decision: "accept" | "override"; finalBand: Band; reason?: string; at: string };
export type Referral = { status: "created" | "sent" | "acknowledged" | "attended" | "lost"; urgency: Band };

/** RCH4 ANC card — per-visit clinical record (all optional, additive). */
export type ANCVisitData = {
  visitNumber?: string;
  gestationWeeks?: string;
  // Vitals
  temperature?: string;
  pulse?: string;
  respiratoryRate?: string;
  muac?: string;
  // Obstetric examination
  fundalHeight?: string;
  presentation?: string;
  fetalHeartRate?: string;
  fetalMovement?: string;
  oedema?: string;
  // Danger signs (RCH4 "dalili za hatari")
  dangerSigns?: string[];
  // Investigations
  hb?: string;
  urineProtein?: string;
  urineGlucose?: string;
  bloodSugar?: string;
  bloodSugarUnit?: string; // "mmol/L" | "mg/dL"
  malariaTest?: string;
  hivTest?: string;
  syphilisTest?: string;
  hepatitisB?: string;

  // Services given
  ttDose?: string;
  iptpDose?: string;
  ironFolate?: string;
  albendazole?: string;
  itnGiven?: string;
  arvGiven?: string;
  // Plan
  counselling?: string;
  referred?: string;
  nextVisitDate?: string;
  provider?: string;
};

/** RCH4 ANC card — registration / booking-visit profile (all optional, additive). */
export type RCH4Profile = {
  clinicName?: string;
  rchNumber?: string;
  village?: string;
  ward?: string;
  district?: string;
  phone?: string;
  dateOfBirth?: string;
  maritalStatus?: string;
  education?: string;
  occupation?: string;
  partnerName?: string;
  partnerAge?: string;
  partnerOccupation?: string;
  partnerHiv?: string;
  gravida?: string;
  para?: string;
  livingChildren?: string;
  abortions?: string;
  lmp?: string;
  edd?: string;
  height?: string;
  bloodGroup?: string;
  rhesus?: string;
  priorCsection?: string;
  priorStillbirth?: string;
  priorPph?: string;
  priorPreeclampsia?: string;
  // Birth plan
  deliveryPlace?: string;
  birthCompanion?: string;
  transportPlan?: string;
  bloodDonor?: string;
  savings?: string;
};

export type CheckIn = {
  id: string;
  assessmentId: string;
  date: string;
  bloodPressure: string; // "120/80"
  weight: number;
  symptoms: string;
  notes: string;
  anc?: ANCVisitData;
  ultrasound?: string; // per-visit ultrasound / scan image (data URL), stored only, not analysed
  analysis: Analysis;
  review?: Review | null;
  referral?: Referral | null;
};

export type PostnatalScreen = {
  assessmentId: string; date: string; score: number; band: Band; selfHarm: boolean;
  actionSw: string; actionEn: string; review?: Review | null; referral?: Referral | null;
  context?: { pregnancyBand?: Band | null; outcome?: string | null; deliveryPlace?: string | null };
};

export type ChildSummary = { id: string; name: string; sex?: string; dob: string; gestationAtBirthWeeks?: number | null };

export type Patient = {
  id: string;
  name: string;
  age: number;
  gestationWeeks: number; // at registration
  complications: string; // historical
  history: string;
  ultrasound?: string;
  rch4?: RCH4Profile;
  createdAt: string;
  village?: string | null;
  checkIns: CheckIn[];
  consent: { pregnancy: boolean; postnatal_mh: boolean; child_dev: boolean };
  pregnancy?: { id: string; outcome: string; deliveryDate?: string | null; deliveryPlace?: string | null } | null;
  children: ChildSummary[];
  postnatal: PostnatalScreen[];
};

export type Consent = { care: boolean; aggregate_reporting?: boolean; research?: boolean };

export type CheckInput = {
  bloodPressure: string;
  weight: number;
  symptoms: string;
  notes: string;
  date?: string;
  anc?: ANCVisitData;
  ultrasound?: string;
};

let cache: Patient[] = [];

/** Fetch all mothers from the hub and refresh the in-memory cache. */
export async function loadPatients(): Promise<Patient[]> {
  cache = await api<Patient[]>("GET", "/api/v1/patients");
  return cache;
}
export function listPatients(): Patient[] { return cache; }
export async function fetchPatient(id: string): Promise<Patient> {
  const p = await api<Patient>("GET", `/api/v1/patients/${id}`);
  cache = [p, ...cache.filter((x) => x.id !== p.id)];
  return p;
}
export function latest(p: Patient): CheckIn | undefined { return p.checkIns[p.checkIns.length - 1]; }
export function latestAnalysis(p: Patient): Analysis | undefined { return latest(p)?.analysis; }

/** Band after the CHW's decision, if any. */
export function finalBand(c: CheckIn): Band { return c.review?.finalBand ?? c.analysis.band; }

export function gestationAt(p: Patient, when: string): number {
  const startMs = new Date(p.createdAt).getTime() - p.gestationWeeks * 7 * 86400000;
  return Math.max(0, Math.round((new Date(when).getTime() - startMs) / (7 * 86400000)));
}

function sysBp(bp: string) { return parseInt(bp.split("/")[0] || "0", 10) || 0; }
function diaBp(bp: string) { return parseInt(bp.split("/")[1] || "0", 10) || 0; }

export async function registerPatient(input: {
  name: string; age: number; gestationWeeks: number; complications: string; history: string;
  rch4: RCH4Profile; phoneOwner?: string; consent: Consent; checkIn: CheckInput;
}): Promise<Patient> {
  return api<Patient>("POST", "/api/v1/patients", input);
}

export async function addCheckIn(patientId: string, input: CheckInput): Promise<Patient> {
  return api<Patient>("POST", `/api/v1/patients/${patientId}/checkins`, input);
}

export async function reviewAssessment(assessmentId: string, decision: "accept" | "override", finalBand?: Band, reason?: string) {
  return api<Patient>("POST", `/api/v1/assessments/${assessmentId}/review`, { decision, finalBand, reason });
}

export async function giveConsent(personId: string, module: "pregnancy" | "postnatal_mh" | "child_dev", c: Consent) {
  return api<{ ok: boolean }>("POST", `/api/v1/persons/${personId}/consent`, { module, ...c });
}

/** Potential complications to monitor for, derived from findings + history. */
export function possibleComplications(p: Patient, a: Analysis): { name: string; reason: string; severity: RiskCategory }[] {
  const out: { name: string; reason: string; severity: RiskCategory }[] = [];
  const f = a.findings.map((x) => x.label.toLowerCase()).join(" | ");
  const comp = (p.complications || "").toLowerCase();
  const sxAll = p.checkIns.map((c) => c.symptoms || "").join(" ").toLowerCase();

  if (/hypertension|preeclampsia|rising blood|upward bp|neurological/.test(f) || /preeclampsia/.test(comp)) {
    out.push({ name: "Preeclampsia", reason: "Elevated BP and/or neurological symptoms detected.", severity: a.category === "Low" ? "Moderate" : "High" });
  }
  if (/severe hypertension|neurological/.test(f)) {
    out.push({ name: "Eclampsia", reason: "Severe hypertension with neurological warning signs raises seizure risk.", severity: "High" });
    out.push({ name: "HELLP syndrome", reason: "Severe preeclampsia can progress to hemolysis, elevated liver enzymes, low platelets.", severity: "High" });
  }
  if (/bleeding/.test(f)) {
    out.push({ name: "Placental abruption", reason: "Antepartum bleeding may indicate placental separation.", severity: "High" });
    out.push({ name: "Placenta previa", reason: "Painless bleeding can suggest abnormal placental position.", severity: "High" });
  }
  if (/reduced fetal movement/.test(f)) {
    out.push({ name: "Fetal distress / IUGR", reason: "Reduced movement may signal hypoxia or growth restriction.", severity: "High" });
  }
  if (/diabetes/.test(f) || /diabetes/.test(comp) || /thirst/.test(sxAll)) {
    out.push({ name: "Gestational diabetes", reason: "History or symptoms suggest glycemic dysregulation.", severity: "Moderate" });
    out.push({ name: "Fetal macrosomia", reason: "Uncontrolled glucose increases risk of large-for-gestational-age baby.", severity: "Moderate" });
  }
  if (/rapid weight gain|edema/.test(f)) {
    out.push({ name: "Fluid overload / preeclampsia", reason: "Rapid weight gain and edema together raise preeclampsia suspicion.", severity: "Moderate" });
  }
  if (/fever/.test(f)) {
    out.push({ name: "Chorioamnionitis", reason: "Maternal fever during pregnancy can indicate intrauterine infection.", severity: "High" });
  }
  if (/adolescent|advanced maternal age/.test(f)) {
    out.push({ name: "Preterm labor", reason: "Age-related risk factor for early delivery.", severity: "Moderate" });
  }
  if (out.length === 0 && a.category === "Low") {
    out.push({ name: "No specific complication predicted", reason: "Continue routine antenatal screening; reassess at every visit.", severity: "Low" });
  }
  // Deduplicate by name
  const seen = new Set<string>();
  return out.filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true)));
}

/* ============ Derived clinical helpers (display only) ============ */

export function computeBmi(weightKg?: number, heightCm?: string | number): number | undefined {
  const w = Number(weightKg);
  const h = Number(heightCm);
  if (!w || !h || h < 80 || h > 250) return undefined;
  const m = h / 100;
  return Math.round((w / (m * m)) * 10) / 10;
}

export function bmiStatus(bmi: number): { label: string; category: RiskCategory } {
  if (bmi < 18.5) return { label: "Underweight", category: "Moderate" };
  if (bmi < 25) return { label: "Normal", category: "Low" };
  if (bmi < 30) return { label: "Overweight", category: "Moderate" };
  return { label: "Obese", category: "High" };
}

export type RiskDriver = { label: string; value: string; severity: RiskCategory };

/** Concrete parameters behind the red flags of a given visit. */
export function riskDrivers(p: Patient, c: CheckIn): RiskDriver[] {
  const out: RiskDriver[] = [];
  const anc = c.anc || {};
  const sys = sysBp(c.bloodPressure);
  const dia = diaBp(c.bloodPressure);

  if (sys >= 160 || dia >= 110) out.push({ label: "Severe hypertension", value: `${c.bloodPressure} mmHg`, severity: "High" });
  else if (sys >= 140 || dia >= 90) out.push({ label: "High blood pressure", value: `${c.bloodPressure} mmHg`, severity: "High" });
  else if (sys >= 130) out.push({ label: "Borderline blood pressure", value: `${c.bloodPressure} mmHg`, severity: "Moderate" });

  const hb = parseFloat(anc.hb || "");
  if (hb) {
    if (hb < 7) out.push({ label: "Severe anaemia", value: `Hb ${hb} g/dL`, severity: "High" });
    else if (hb < 11) out.push({ label: "Anaemia", value: `Hb ${hb} g/dL`, severity: "Moderate" });
  }

  if (anc.urineProtein && !/^nil$/i.test(anc.urineProtein)) {
    const heavy = /2\+|3\+|4\+|\+\+/.test(anc.urineProtein);
    out.push({ label: "Proteinuria", value: anc.urineProtein, severity: heavy ? "High" : "Moderate" });
  }
  if (anc.urineGlucose && !/^nil$/i.test(anc.urineGlucose)) {
    out.push({ label: "Glycosuria", value: anc.urineGlucose, severity: "Moderate" });
  }

  const bs = parseFloat(anc.bloodSugar || "");
  if (bs) {
    const mmol = (anc.bloodSugarUnit || "mmol/L") === "mg/dL" ? bs / 18 : bs;
    if (mmol >= 11.1) out.push({ label: "High blood sugar", value: `${bs} ${anc.bloodSugarUnit || "mmol/L"}`, severity: "High" });
    else if (mmol >= 7.8) out.push({ label: "Raised blood sugar", value: `${bs} ${anc.bloodSugarUnit || "mmol/L"}`, severity: "Moderate" });
  }

  const temp = parseFloat(anc.temperature || "");
  if (temp >= 38) out.push({ label: "Fever", value: `${temp} °C`, severity: "High" });

  const fhr = parseFloat(anc.fetalHeartRate || "");
  if (fhr && (fhr < 110 || fhr > 160)) out.push({ label: "Abnormal fetal heart rate", value: `${fhr} bpm`, severity: "High" });

  if (anc.fetalMovement && /reduced|absent/i.test(anc.fetalMovement)) {
    out.push({ label: "Fetal movement", value: anc.fetalMovement, severity: "High" });
  }
  if (anc.oedema && /moderate|severe/i.test(anc.oedema)) {
    out.push({ label: "Oedema", value: anc.oedema, severity: "Moderate" });
  }
  if (anc.malariaTest && /positive/i.test(anc.malariaTest)) out.push({ label: "Malaria positive", value: anc.malariaTest, severity: "High" });
  if (anc.hivTest && /positive|reactive/i.test(anc.hivTest)) out.push({ label: "HIV reactive", value: anc.hivTest, severity: "High" });
  if (anc.syphilisTest && /positive|reactive/i.test(anc.syphilisTest)) out.push({ label: "Syphilis reactive", value: anc.syphilisTest, severity: "High" });
  if (anc.hepatitisB && /positive|reactive/i.test(anc.hepatitisB)) out.push({ label: "Hepatitis B positive", value: anc.hepatitisB, severity: "High" });

  const muac = parseFloat(anc.muac || "");
  if (muac && muac < 23) out.push({ label: "Low MUAC (undernutrition)", value: `${muac} cm`, severity: "Moderate" });

  const bmi = computeBmi(c.weight, p.rch4?.height);
  if (bmi !== undefined) {
    const st = bmiStatus(bmi);
    if (st.category !== "Low") out.push({ label: `BMI ${st.label}`, value: `${bmi} kg/m²`, severity: st.category });
  }

  for (const s of anc.dangerSigns || []) out.push({ label: "Danger sign", value: s, severity: "High" });

  return out;
}
