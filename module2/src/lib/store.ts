// Lightweight localStorage-backed patient store with continuous (multi-visit) analysis
export type RiskCategory = "Low" | "Moderate" | "High";

export type Finding = { label: string; severity: RiskCategory; note: string };

export type Analysis = {
  riskScore: number; // 0-100
  category: RiskCategory;
  findings: Finding[];
  recommendation: string;
  trend?: "improving" | "stable" | "worsening";
  delta?: number; // change vs previous visit
};

//import { syncPatientInBackground, syncCheckInInBackground } from "./sync";

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
  date: string;
  bloodPressure: string; // "120/80"
  weight: number;
  symptoms: string;
  notes: string;
  anc?: ANCVisitData;
  ultrasound?: string; // per-visit ultrasound / scan image (data URL)
  analysis: Analysis;
};

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
  checkIns: CheckIn[];
};


const KEY = "mamaguard:patients:v4";

export function listPatients(): Patient[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
export function getPatient(id: string) { return listPatients().find((p) => p.id === id); }
export function savePatient(p: Patient) {
  const all = listPatients();
  const idx = all.findIndex((x) => x.id === p.id);
  if (idx >= 0) all[idx] = p; else all.unshift(p);
  localStorage.setItem(KEY, JSON.stringify(all));
  //void syncPatientInBackground(p); // fire-and-forget — never awaited, never blocks the UI
}
export function latest(p: Patient): CheckIn | undefined { return p.checkIns[p.checkIns.length - 1]; }
export function latestAnalysis(p: Patient): Analysis | undefined { return latest(p)?.analysis; }

export function gestationAt(p: Patient, when: string): number {
  const startMs = new Date(p.createdAt).getTime() - p.gestationWeeks * 7 * 86400000;
  const weeks = Math.max(0, Math.round((new Date(when).getTime() - startMs) / (7 * 86400000)));
  return weeks;
}

function sysBp(bp: string) { return parseInt(bp.split("/")[0] || "0", 10) || 0; }
function diaBp(bp: string) { return parseInt(bp.split("/")[1] || "0", 10) || 0; }

export type CheckInput = {
  bloodPressure: string;
  weight: number;
  symptoms: string;
  notes: string;
  date?: string;
  anc?: ANCVisitData;
  ultrasound?: string;
};

export function appendCheckIn(p: Patient, input: CheckInput): Patient {
  const date = input.date || new Date().toISOString();
  const id = `c-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const draft: CheckIn = {
    id, date,
    bloodPressure: input.bloodPressure,
    weight: input.weight,
    symptoms: input.symptoms,
    anc: input.anc,
    ultrasound: input.ultrasound,

    notes: input.notes,
    analysis: { riskScore: 0, category: "Low", findings: [], recommendation: "" },
  };
  const next: Patient = { ...p, checkIns: [...p.checkIns, draft] };
  next.checkIns[next.checkIns.length - 1].analysis = computeAnalysis(next, next.checkIns.length - 1);
  //void syncCheckInInBackground(next, next.checkIns[next.checkIns.length - 1]);
  return next;
}

/** Trend-aware analysis: looks at current check-in + history. */
export function computeAnalysis(p: Patient, idx: number): Analysis {
  const c = p.checkIns[idx];
  const prev = idx > 0 ? p.checkIns[idx - 1] : undefined;
  const sys = sysBp(c.bloodPressure);
  const dia = diaBp(c.bloodPressure);
  const gest = gestationAt(p, c.date);

  let score = 10;
  const findings: Finding[] = [];

  // Acute red flags (visible at any first visit)
  if (sys >= 160 || dia >= 110) {
    score += 50;
    findings.push({ label: "Severe hypertension", severity: "High", note: "BP ≥ 160/110 mmHg — urgent obstetric review needed." });
  } else if (sys >= 140 || dia >= 90) {
    score += 32;
    findings.push({ label: "Preeclampsia risk", severity: "High", note: "BP ≥ 140/90 mmHg suggests hypertensive disorder of pregnancy." });
  } else if (sys >= 130) {
    score += 16;
    findings.push({ label: "Borderline hypertension", severity: "Moderate", note: "Elevated systolic BP; monitor at every visit." });
  }

  // Symptom red flags
  const s = (c.symptoms || "").toLowerCase();
  if (/blurred|vision|severe headache|seizure|fits/.test(s)) { score += 25; findings.push({ label: "Neurological warning signs", severity: "High", note: "Visual changes or severe headache may indicate preeclampsia." }); }
  if (/bleed/.test(s)) { score += 30; findings.push({ label: "Vaginal bleeding", severity: "High", note: "Any antepartum bleeding requires immediate referral." }); }
  if (/swell|edema/.test(s)) { score += 8; findings.push({ label: "Edema", severity: "Moderate", note: "Persistent swelling — monitor BP and proteinuria." }); }
  if (/fever/.test(s)) { score += 10; findings.push({ label: "Fever", severity: "Moderate", note: "Possible infection; check for chorioamnionitis." }); }
  if (/no movement|reduced movement|baby not moving/.test(s)) { score += 22; findings.push({ label: "Reduced fetal movement", severity: "High", note: "Recommend immediate fetal assessment." }); }

  // Static risk factors
  if (p.age >= 35) { score += 8; findings.push({ label: "Advanced maternal age", severity: "Moderate", note: "Baseline risk slightly elevated." }); }
  if (p.age <= 17) { score += 10; findings.push({ label: "Adolescent pregnancy", severity: "Moderate", note: "Higher risk for preeclampsia and preterm birth." }); }
  if (/preeclampsia/i.test(p.complications)) { score += 14; findings.push({ label: "Prior preeclampsia", severity: "Moderate", note: "Recurrence risk; monitor BP weekly." }); }
  if (/diabetes/i.test(p.complications)) { score += 10; findings.push({ label: "Diabetes history", severity: "Moderate", note: "Watch for macrosomia and glycemic spikes." }); }

  // Trend (continuous) signals across visits
  let delta = 0;
  let trend: Analysis["trend"] = "stable";
  if (prev) {
    const dSys = sys - sysBp(prev.bloodPressure);
    const dWt = c.weight - prev.weight;
    if (dSys >= 10) { score += 15; findings.push({ label: "Rising blood pressure", severity: "High", note: `Systolic BP rose by ${dSys} mmHg since last visit.` }); }
    else if (dSys >= 5) { score += 6; findings.push({ label: "Upward BP trend", severity: "Moderate", note: `BP trending up (+${dSys} mmHg).` }); }
    if (dWt >= 2) { score += 6; findings.push({ label: "Rapid weight gain", severity: "Moderate", note: `+${dWt.toFixed(1)} kg since last visit — possible fluid retention.` }); }
  }

  // Three consecutive moderate+ visits → escalate
  const recent = p.checkIns.slice(Math.max(0, idx - 2), idx); // prior 2
  if (recent.length === 2 && recent.every((x) => x.analysis.category !== "Low")) {
    score += 8;
    findings.push({ label: "Persistent risk pattern", severity: "High", note: "Risk has been elevated across recent visits — escalate care." });
  }

  score = Math.max(2, Math.min(98, Math.round(score)));
  if (prev) {
    // compared after the cap, so it matches the scores shown on screen
    delta = score - prev.analysis.riskScore;
    trend = delta > 4 ? "worsening" : delta < -4 ? "improving" : "stable";
  }
  const category: RiskCategory = score >= 60 ? "High" : score >= 32 ? "Moderate" : "Low";
  const recommendation =
    category === "High"
      ? "Immediate referral to nearest hospital with obstetric care."
      : category === "Moderate"
        ? `Schedule follow-up in ${gest >= 32 ? 3 : 7} days. Monitor BP daily.`
        : "Continue routine prenatal checkups every 4 weeks.";

  return { riskScore: score, category, findings, recommendation, trend, delta };
}

export function recomputeAll(p: Patient): Patient {
  const next = { ...p, checkIns: p.checkIns.map((c) => ({ ...c })) };
  for (let i = 0; i < next.checkIns.length; i++) {
    next.checkIns[i].analysis = computeAnalysis(next, i);
  }
  return next;
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

export function seedDemoIfEmpty() {
  if (typeof window === "undefined") return;
  if (listPatients().length > 0) return;
  const today = Date.now();
  const day = 86400000;
  const mk = (id: string, name: string, age: number, gest: number, comp: string, hist: string, visits: { d: number; bp: string; w: number; sx: string; n: string }[]): Patient => {
    let p: Patient = { id, name, age, gestationWeeks: gest, complications: comp, history: hist, createdAt: new Date(today - visits[0].d * day).toISOString(), checkIns: [] };
    for (const v of visits) {
      p = appendCheckIn(p, { bloodPressure: v.bp, weight: v.w, symptoms: v.sx, notes: v.n, date: new Date(today - v.d * day).toISOString() });
    }
    return p;
  };
  const demo: Patient[] = [
    mk("p-001", "Amina Okafor", 28, 20, "None", "First pregnancy", [
      { d: 21, bp: "114/72", w: 62, sx: "Mild fatigue", n: "Booking visit" },
      { d: 14, bp: "116/74", w: 63, sx: "", n: "Routine" },
      { d: 7,  bp: "118/76", w: 64, sx: "", n: "Feeling well" },
      { d: 0,  bp: "120/78", w: 64.5, sx: "", n: "Stable" },
    ]),
    mk("p-002", "Fatou Diallo", 35, 28, "Preeclampsia in last pregnancy", "Hypertension, anemia", [
      { d: 28, bp: "128/82", w: 75, sx: "", n: "Baseline" },
      { d: 21, bp: "132/86", w: 76, sx: "Mild swelling", n: "Watch closely" },
      { d: 10, bp: "142/92", w: 78, sx: "Headache, swelling", n: "BP rising" },
      { d: 1,  bp: "148/96", w: 79.5, sx: "Headache, swelling, blurred vision", n: "Urgent review" },
    ]),
    mk("p-003", "Grace Mwangi", 31, 26, "Gestational diabetes", "Family history of diabetes", [
      { d: 16, bp: "126/80", w: 69, sx: "Thirst", n: "Glucose check" },
      { d: 9, bp: "128/82", w: 70, sx: "Excessive thirst", n: "Glucose monitoring" },
      { d: 2, bp: "132/88", w: 71, sx: "Excessive thirst", n: "Diet review" },
    ]),
    mk("p-004", "Zainab Hassan", 24, 32, "None", "Routine", [
      { d: 0, bp: "118/76", w: 68, sx: "", n: "First visit, all normal" },
    ]),
    mk("p-005", "Aisha Bello", 22, 18, "None", "First pregnancy", [
      { d: 14, bp: "110/70", w: 58, sx: "", n: "Booking" },
      { d: 0, bp: "112/72", w: 59, sx: "Mild nausea", n: "Routine" },
    ]),
    mk("p-006", "Esther Achieng", 38, 30, "Prior C-section", "Anemia, mild asthma", [
      { d: 20, bp: "130/84", w: 78, sx: "Back pain", n: "Watching BP" },
      { d: 10, bp: "134/88", w: 79, sx: "Back pain, swelling", n: "" },
      { d: 1, bp: "138/90", w: 80, sx: "Swelling, headache", n: "Plan referral if rises" },
    ]),
    mk("p-007", "Ngozi Eze", 29, 24, "None", "Healthy", [
      { d: 12, bp: "120/78", w: 66, sx: "", n: "" },
      { d: 5, bp: "122/80", w: 67, sx: "", n: "" },
      { d: 0, bp: "124/82", w: 67.5, sx: "Mild edema", n: "Continue monitoring" },
    ]),
    mk("p-008", "Mariam Traoré", 17, 22, "Adolescent pregnancy", "First pregnancy, undernutrition", [
      { d: 18, bp: "108/68", w: 49, sx: "Fatigue", n: "Iron prescribed" },
      { d: 8, bp: "112/70", w: 50, sx: "Fatigue", n: "" },
      { d: 0, bp: "118/74", w: 50.5, sx: "Headache, fatigue", n: "Monitor" },
    ]),
    mk("p-009", "Chiamaka Nwosu", 33, 34, "Twin pregnancy", "Multiparous", [
      { d: 25, bp: "126/82", w: 82, sx: "Back pain", n: "Twin gestation" },
      { d: 12, bp: "130/86", w: 84, sx: "Back pain, swelling", n: "" },
      { d: 3, bp: "136/90", w: 85, sx: "Swelling, fatigue", n: "Close watch" },
    ]),
    mk("p-010", "Hawa Camara", 26, 16, "None", "Healthy", [
      { d: 7, bp: "116/74", w: 60, sx: "", n: "First trimester end" },
      { d: 0, bp: "118/76", w: 61, sx: "", n: "Routine" },
    ]),
    mk("p-011", "Blessing Adeyemi", 41, 36, "Prior preeclampsia, diabetes", "Two prior pregnancies", [
      { d: 30, bp: "138/88", w: 85, sx: "Mild headache", n: "High-risk baseline" },
      { d: 18, bp: "146/94", w: 86, sx: "Headache, swelling", n: "BP elevated" },
      { d: 7, bp: "158/102", w: 87, sx: "Severe headache, blurred vision, swelling", n: "Refer urgently" },
      { d: 0, bp: "162/108", w: 88, sx: "Severe headache, vision changes, epigastric pain", n: "Emergency referral" },
    ]),
    mk("p-012", "Sade Olamide", 30, 26, "None", "Routine", [
      { d: 14, bp: "118/76", w: 70, sx: "", n: "" },
      { d: 7, bp: "120/78", w: 70.5, sx: "", n: "" },
      { d: 0, bp: "120/78", w: 71, sx: "", n: "Stable" },
    ]),
  ];
  localStorage.setItem(KEY, JSON.stringify(demo));
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

/** True for Positive / Reactive, but not for Negative / Non-Reactive. */
const isPos = (v?: string): v is string => !!v && /positive|reactive/i.test(v) && !/non-?reactive|negative/i.test(v);

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
  if (isPos(anc.malariaTest)) out.push({ label: "Malaria positive", value: anc.malariaTest, severity: "High" });
  if (isPos(anc.hivTest)) out.push({ label: "HIV reactive", value: anc.hivTest, severity: "High" });
  if (isPos(anc.syphilisTest)) out.push({ label: "Syphilis reactive", value: anc.syphilisTest, severity: "High" });
  if (isPos(anc.hepatitisB)) out.push({ label: "Hepatitis B positive", value: anc.hepatitisB, severity: "High" });

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
