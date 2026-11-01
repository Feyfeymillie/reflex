// Multi-condition maternal risk engine.
// Scores 10 pregnancy-related conditions per patient from the latest visit + history,
// and returns SHAP-style "drivers": each factor with the points it contributed.
// Rule-based and fully explainable. Swap `assessConditions` for a model endpoint later.
import { latest, type CheckIn, type Patient, type RiskCategory } from "./store";

export type ConditionId =
  | "preeclampsia" | "gdm" | "pph" | "anaemia" | "malaria"
  | "hivsyph" | "sepsis" | "ectopic" | "preterm" | "depression";

export type ConditionGroup = "Hypertensive & metabolic" | "Haemorrhage & blood" | "Infection" | "Pregnancy outcome" | "Mental health";

export type Driver = { label: string; value?: string; points: number };
export type Prompt = { en: string; sw: string };
/** Hypertension type, following the Tanzania STG: chronic (before 20 weeks), gestational (no protein, no organ signs),
 *  suspected (protein not yet tested) or preeclampsia (protein above 2+ or organ signs). */
export type HtnType = "chronic" | "gestational" | "suspected" | "preeclampsia";

export type ConditionResult = {
  id: ConditionId;
  name: string;
  nameSw: string;
  group: ConditionGroup;
  score: number; // 0-100
  level: RiskCategory;
  applicable: boolean; // false when not relevant at this gestation
  drivers: Driver[]; // sorted by contribution, biggest first
  action: string;
  actionSw: string;
  facility: string; // where the patient should be managed
  severe?: boolean; // hypertension card only: severe features present
  htn?: HtnType; // hypertension card only: which type, so the right steps are shown
  variant?: string; // other cards: a sub-case that changes the steps (e.g. anaemia "oral" or "transfuse")
  prompts: Prompt[]; // missing tests that would change the assessment
};

type RunOut = {
  a: Acc; applicable: boolean; action: string; actionSw: string; facility: string;
  severe?: boolean; prompts?: Prompt[];
  htn?: HtnType; name?: string; nameSw?: string; variant?: string;
};

const notDone = (s?: string) => !s || /^not done$/i.test(s);

type Ctx = {
  p: Patient;
  c: CheckIn;
  prev?: CheckIn;
  sys: number;
  dia: number;
  gest: number;
  sx: string; // lower-cased symptoms + notes + danger signs, all visits combined for history-type checks
  sxNow: string; // latest visit only
  hist: string; // complications + history, lower-cased
  anc: NonNullable<CheckIn["anc"]>;
  rch: NonNullable<Patient["rch4"]>;
  bmi?: number;
};

const num = (s?: string) => { const n = parseFloat(s || ""); return Number.isFinite(n) ? n : undefined; };
const pos = (s?: string) => !!s && /positive|reactive/i.test(s) && !/non-?reactive/i.test(s);

function bp(s: string) {
  const [a, b] = (s || "").split("/");
  return { sys: parseInt(a || "0", 10) || 0, dia: parseInt(b || "0", 10) || 0 };
}

function gestNow(p: Patient, c: CheckIn) {
  const fromAnc = num(c.anc?.gestationWeeks);
  if (fromAnc) return fromAnc;
  const start = new Date(p.createdAt).getTime() - p.gestationWeeks * 7 * 86400000;
  return Math.max(0, Math.round((new Date(c.date).getTime() - start) / (7 * 86400000)));
}

/** Tiny helper: collect weighted factors, then clamp the total. */
class Acc {
  drivers: Driver[] = [];
  base: number;
  constructor(base = 3) { this.base = base; }
  add(cond: unknown, label: string, points: number, value?: string) {
    if (cond) this.drivers.push({ label, value, points });
    return this;
  }
  get score() {
    const raw = this.base + this.drivers.reduce((s, d) => s + d.points, 0);
    return Math.max(1, Math.min(98, Math.round(raw)));
  }
  sorted() { return [...this.drivers].sort((a, b) => b.points - a.points); }
}

const level = (s: number): RiskCategory => (s >= 60 ? "High" : s >= 30 ? "Moderate" : "Low");

/* ---------------- individual condition models ---------------- */

function preeclampsia(x: Ctx) {
  const a = new Acc(3);
  const bpTxt = `${x.sys}/${x.dia} mmHg`;
  a.add(x.sys >= 160 || x.dia >= 110, "Severe-range blood pressure", 45, bpTxt);
  a.add((x.sys >= 140 || x.dia >= 90) && !(x.sys >= 160 || x.dia >= 110), "Raised blood pressure", 30, bpTxt);
  a.add(x.sys >= 130 && x.sys < 140 && x.dia < 90, "Borderline blood pressure", 12, bpTxt);
  const pr = x.anc.urineProtein || "";
  a.add(/2\+|3\+|4\+/.test(pr), "Significant proteinuria", 25, pr);
  a.add(/^(trace|1\+)$/i.test(pr), "Mild proteinuria", 10, pr);
  a.add(/blurred|vision|severe headache|headache/.test(x.sxNow), "Headache / visual disturbance", 18);
  a.add(/epigastric|upper abdominal/.test(x.sxNow), "Epigastric pain", 12);
  a.add(/convuls|\bfits\b|seizure/.test(x.sxNow), "Convulsions reported", 30);
  a.add(/swell|oedema|edema/.test(x.sxNow) || /moderate|severe/i.test(x.anc.oedema || ""), "Oedema / facial swelling", 8);
  a.add(/preeclampsia|eclampsia|hypertension/.test(x.hist) || x.rch.priorPreeclampsia === "Yes", "Prior preeclampsia / hypertension", 14);
  if (x.prev) {
    const dSys = x.sys - bp(x.prev.bloodPressure).sys;
    const dWt = x.c.weight - x.prev.weight;
    a.add(dSys >= 10, "BP rising across visits", 12, `+${dSys} mmHg`);
    a.add(dWt >= 2, "Rapid weight gain", 6, `+${dWt.toFixed(1)} kg`);
  }
  a.add(x.p.age >= 35, "Maternal age ≥ 35", 6, `${x.p.age} yrs`);
  a.add(x.p.age <= 17, "Adolescent pregnancy", 8, `${x.p.age} yrs`);
  a.add(/twin|multiple/.test(x.hist), "Multiple pregnancy", 8);
  a.add(x.bmi !== undefined && x.bmi >= 30, "Obesity", 7, x.bmi ? `BMI ${x.bmi}` : undefined);
  a.add(x.gest > 0 && x.gest < 20 && (x.sys >= 140 || x.dia >= 90), "Hypertension before 20w (chronic?)", 6);
  const hyper = x.sys >= 140 || x.dia >= 90;
  const fits = /convuls|\bfits\b|seizure/.test(x.sxNow);
  // End-organ signs (Tanzania STG): severe headache, blurred vision, epigastric pain, plus breathlessness as a proxy for pulmonary oedema.
  const endOrgan = fits || (hyper && /blurred|vision|visual|epigastric|upper abdominal|difficulty breathing|severe headache/.test(x.sxNow));
  // Severe features: severe-range BP (160/110 or more), fits, or raised BP with end-organ signs.
  const severe = x.sys >= 160 || x.dia >= 110 || endOrgan;
  // Severe features always mean High: lift the score to at least 70 and show it as a driver.
  a.add(severe && a.score < 70, "Severe features present (Tanzania STG)", 70 - a.score);
  const lvl = level(a.score);
  const proteinKnown = !notDone(x.anc.urineProtein);
  const proteinDx = /3\+|4\+/.test(pr); // STG: more than 2+ on dipstick (or 300 mg per 24 h)
  const proteinBorderline = /^(1\+|2\+)$/i.test(pr); // below the STG level: confirm before calling it preeclampsia

  let htn: HtnType | undefined;
  if (hyper || fits) {
    if (!fits && x.gest > 0 && x.gest < 20) htn = "chronic";
    else if (proteinDx || endOrgan) htn = "preeclampsia";
    else if (!proteinKnown || proteinBorderline) htn = "suspected";
    else htn = "gestational";
  }
  const NAMES: Record<HtnType, { en: string; sw: string }> = {
    chronic: { en: "Chronic hypertension (before 20 weeks)", sw: "Shinikizo la damu sugu (kabla ya wiki 20)" },
    gestational: { en: "Gestational hypertension", sw: "Shinikizo la damu la mimba" },
    suspected: { en: "Suspected preeclampsia (confirm urine protein)", sw: "Inashukiwa preeclampsia (thibitisha protini ya mkojo)" },
    preeclampsia: { en: "Preeclampsia", sw: "Kifafa cha mimba (Preeclampsia)" },
  };

  const prompts: Prompt[] = [];
  if (hyper && !proteinKnown) {
    prompts.push({
      en: "Urine protein not recorded. Test now: it decides whether this is preeclampsia.",
      sw: "Protini kwenye mkojo haijarekodiwa. Pima sasa: inaamua kama ni preeclampsia.",
    });
  }
  if (htn === "suspected" && proteinBorderline) {
    prompts.push({
      en: "Protein is 2+ or less. The STG level is more than 2+ (or 300 mg in 24 hours): repeat the test or collect a 24-hour urine.",
      sw: "Protini ni 2+ au chini. Kiwango cha STG ni zaidi ya 2+ (au 300 mg kwa saa 24): rudia kipimo au kusanya mkojo wa saa 24.",
    });
  }

  const highSevere = lvl === "High" && severe;
  const highMild = lvl === "High" && !severe;
  let action: string, actionSw: string, facility: string;
  if (htn === "chronic" || htn === "gestational") {
    if (severe) {
      action = "Severe-range BP: admit to hospital and treat per the Tanzania STG. Refer to the next level if there is no improvement.";
      actionSw = "BP ya kiwango kikali: mlaze hospitalini na tibu kwa STG ya Tanzania. Rufaa ngazi ya juu kama hakuna nafuu.";
      facility = "Hospital";
    } else if (htn === "chronic") {
      action = "Chronic hypertension: review treatment per STG and look for an underlying cause if it is new. Test urine protein each visit.";
      actionSw = "Shinikizo la damu sugu: pitia matibabu kwa STG na tafuta chanzo kama ni jipya. Pima protini kila ziara.";
      facility = "Health centre";
    } else {
      action = "Gestational hypertension: visits every 2 weeks until 32 weeks, then weekly. Test urine protein each visit. Plan hospital delivery at 37 completed weeks.";
      actionSw = "Shinikizo la damu la mimba: kliniki kila wiki 2 hadi wiki 32, kisha kila wiki. Pima protini kila ziara. Jifungulie hospitali wiki 37.";
      facility = "Health centre (visits); hospital for delivery";
    }
  } else if (highSevere) {
    action = "Urgent obstetric review. Give magnesium sulphate for severe features, then refer to hospital.";
    actionSw = "Mpeleke hospitali haraka. Toa magnesium sulphate kwa dalili kali, kisha rufaa.";
    facility = "Hospital (CEmONC)";
  } else if (highMild) {
    action = "Refer to hospital: admit for close monitoring if under 37 weeks (from 37 weeks admit and plan delivery). Repeat BP, test urine protein, check for severe features.";
    actionSw = "Rufaa hospitali: lazwa kwa ufuatiliaji kama chini ya wiki 37 (kuanzia wiki 37 lazwa na panga kujifungua). Pima BP tena, protini, na tafuta dalili kali.";
    facility = "Hospital (admission and monitoring)";
  } else if (lvl === "Moderate") {
    action = "Recheck BP and urine protein within 3–7 days; counsel on danger signs; consider low-dose aspirin per guideline.";
    actionSw = "Pima shinikizo la damu na protini kwenye mkojo ndani ya siku 3–7; elimisha dalili za hatari.";
    facility = "Health centre";
  } else {
    action = "Routine ANC. Measure BP and urine protein at every visit.";
    actionSw = "Endelea na kliniki ya kawaida. Pima BP na mkojo kila ziara.";
    facility = "Dispensary / routine ANC";
  }
  return {
    a, applicable: true, severe, prompts, htn,
    name: htn ? NAMES[htn].en : undefined,
    nameSw: htn ? NAMES[htn].sw : undefined,
    action, actionSw, facility,
  };
}

function gdm(x: Ctx) {
  const a = new Acc(3);
  const bs = num(x.anc.bloodSugar);
  const mmol = bs === undefined ? undefined : x.anc.bloodSugarUnit === "mg/dL" ? bs / 18 : bs;
  a.add(mmol !== undefined && mmol >= 11.1, "Very high blood sugar", 45, `${bs} ${x.anc.bloodSugarUnit || "mmol/L"}`);
  a.add(mmol !== undefined && mmol >= 7.8 && mmol < 11.1, "Raised blood sugar", 28, `${bs} ${x.anc.bloodSugarUnit || "mmol/L"}`);
  const ug = x.anc.urineGlucose || "";
  a.add(/2\+|3\+/.test(ug), "Glycosuria 2+ or more", 20, ug);
  a.add(/^(trace|1\+)$/i.test(ug), "Glycosuria", 10, ug);
  a.add(/thirst|polyuria|frequent urination|excessive urination/.test(x.sxNow), "Excessive thirst / urination", 16);
  a.add(/diabetes|gdm/.test(x.hist), "Diabetes history", 20);
  a.add(x.bmi !== undefined && x.bmi >= 30, "Obesity", 12, x.bmi ? `BMI ${x.bmi}` : undefined);
  a.add(x.bmi !== undefined && x.bmi >= 25 && x.bmi < 30, "Overweight", 6, x.bmi ? `BMI ${x.bmi}` : undefined);
  a.add(x.p.age >= 35, "Maternal age ≥ 35", 7, `${x.p.age} yrs`);
  a.add(/macrosomia|family history of diabetes/.test(x.hist), "Family history / prior large baby", 10);
  a.add(x.rch.priorStillbirth === "Yes", "Prior stillbirth", 6);
  a.add(num(x.anc.fundalHeight) !== undefined && x.gest > 0 && (num(x.anc.fundalHeight) as number) > x.gest + 3, "Fundal height larger than dates", 8);
  const lvl = level(a.score);
  return {
    a, applicable: x.gest === 0 || x.gest >= 12,
    action: lvl === "High" ? "Refer for glucose tolerance test and diabetic care; dietary plan; fetal growth scan."
      : lvl === "Moderate" ? "Do OGTT / fasting glucose at 24–28w (earlier if symptomatic); give diet advice."
      : "Routine screening at 24–28 weeks.",
    actionSw: lvl === "High" ? "Rufaa kwa kipimo cha sukari na huduma ya kisukari; lishe; scan ya ukuaji wa mtoto."
      : lvl === "Moderate" ? "Pima sukari wiki 24–28 (mapema kama ana dalili); toa ushauri wa lishe."
      : "Uchunguzi wa kawaida wiki 24–28.",
    facility: lvl === "High" ? "Hospital / diabetes clinic" : lvl === "Moderate" ? "Health centre" : "Dispensary / routine ANC",
  };
}

function pph(x: Ctx) {
  const a = new Acc(4);
  const hb = num(x.anc.hb);
  a.add(x.rch.priorPph === "Yes" || /pph|postpartum hemorrhage|postpartum haemorrhage/.test(x.hist), "Prior postpartum haemorrhage", 28);
  a.add(hb !== undefined && hb < 7, "Severe anaemia", 22, `Hb ${hb} g/dL`);
  a.add(hb !== undefined && hb >= 7 && hb < 11, "Anaemia", 10, `Hb ${hb} g/dL`);
  a.add(/anaemia|anemia/.test(x.hist) && hb === undefined, "Anaemia history", 8);
  a.add(/twin|multiple/.test(x.hist), "Multiple pregnancy (over-distended uterus)", 16);
  a.add((num(x.rch.para) || 0) >= 5, "Grand multiparity (para ≥ 5)", 14, `P${x.rch.para}`);
  a.add(x.rch.priorCsection === "Yes" || /c-section|caesarean|cesarean/.test(x.hist), "Prior caesarean section", 12);
  a.add(/bleed/.test(x.sxNow), "Antepartum bleeding", 25);
  a.add(/preeclampsia|eclampsia/.test(x.hist) || x.sys >= 140, "Hypertensive disorder", 8);
  a.add(x.p.age >= 35, "Maternal age ≥ 35", 6, `${x.p.age} yrs`);
  a.add(x.bmi !== undefined && x.bmi >= 30, "Obesity", 5, x.bmi ? `BMI ${x.bmi}` : undefined);
  a.add(x.rch.deliveryPlace === "Home", "Planned home delivery", 12);
  a.add(x.gest > 0 && x.gest >= 34 && !x.rch.bloodDonor, "No blood donor arranged", 5);
  const lvl = level(a.score);
  return {
    a, applicable: true,
    action: lvl === "High" ? "Plan facility delivery with active management of third stage, IV access, oxytocin and blood available."
      : lvl === "Moderate" ? "Plan delivery at health centre or hospital; correct anaemia; identify a blood donor."
      : "Routine birth preparedness plan.",
    actionSw: lvl === "High" ? "Panga kujifungua hospitalini; usimamizi hai wa hatua ya tatu, oxytocin na damu vipatikane."
      : lvl === "Moderate" ? "Jifungulie kituo cha afya au hospitali; tibu upungufu wa damu; tafuta mtoa damu."
      : "Mpango wa kawaida wa maandalizi ya kujifungua.",
    facility: lvl === "High" ? "Hospital (CEmONC)" : lvl === "Moderate" ? "Health centre with delivery" : "Dispensary / routine ANC",
  };
}

function anaemia(x: Ctx) {
  const a = new Acc(4);
  const hb = num(x.anc.hb);
  const muac = num(x.anc.muac);
  a.add(hb !== undefined && hb < 7, "Severe anaemia (Hb < 7)", 60, `Hb ${hb} g/dL`);
  a.add(hb !== undefined && hb >= 7 && hb < 10, "Moderate anaemia", 42, `Hb ${hb} g/dL`);
  a.add(hb !== undefined && hb >= 10 && hb < 11, "Mild anaemia", 24, `Hb ${hb} g/dL`);
  a.add(/anaemia|anemia/.test(x.hist), "Anaemia history", 18);
  a.add(/fatigue|dizz|pallor|pale|tired|breathless|difficulty breathing/.test(x.sxNow), "Fatigue / pallor / breathlessness", 12);
  a.add(pos(x.anc.malariaTest), "Malaria positive", 14);
  a.add(muac !== undefined && muac < 23, "Low MUAC (undernutrition)", 10, `${muac} cm`);
  a.add(x.p.age <= 17, "Adolescent pregnancy", 7, `${x.p.age} yrs`);
  a.add(/undernutrition|malnutrition/.test(x.hist), "Undernutrition", 8);
  a.add(x.anc.ironFolate === "No" && x.gest >= 12, "Not on iron/folate", 8);
  a.add(/twin|multiple/.test(x.hist), "Multiple pregnancy", 6);
  const lvl = level(a.score);
  const anaemiaSigns = /fatigue|dizz|pallor|pale|tired|breathless/.test(x.sxNow) || /anaemia|anemia/.test(x.hist);
  const prompts: Prompt[] = anaemiaSigns && hb === undefined
    ? [{ en: "Haemoglobin not recorded. Test Hb now.", sw: "Hb haijarekodiwa. Pima Hb sasa." }] : [];
  // Tanzania STG: Hb under 7 in the third trimester (28 weeks or more) or with signs of heart failure -> transfusion.
  // Hb under 7 earlier in pregnancy -> oral iron and folic acid for 4 weeks plus vitamin B.
  const lateTrimester = x.gest >= 28;
  const hfSigns = /breathless|difficulty breathing|palpitation/.test(x.sxNow);
  const variant = hb !== undefined && hb < 7 ? (lateTrimester || hfSigns ? "transfuse" : "oral") : undefined;
  let action: string, actionSw: string, facility: string;
  if (variant === "transfuse") {
    action = "Hb under 7 in the third trimester or with signs of heart failure: refer or admit for blood transfusion (at least 2 units of packed red cells per STG), then continue iron and folic acid.";
    actionSw = "Hb chini ya 7 miezi 3 ya mwisho au dalili za moyo kushindwa: rufaa au lazwa kwa kuongezewa damu (angalau unit 2 za chembe nyekundu kwa STG), kisha endelea na chuma na folic.";
    facility = "Hospital (transfusion capable)";
  } else if (variant === "oral") {
    action = "Hb under 7 before the third trimester: iron and folic acid combined tablet for 4 weeks plus vitamin B per STG, treat malaria and worms, repeat Hb in 4 weeks. Refer if signs of heart failure.";
    actionSw = "Hb chini ya 7 kabla ya miezi 3 ya mwisho: kidonge mchanganyiko cha chuma na folic kwa wiki 4 pamoja na vitamini B kwa STG, tibu malaria na minyoo, pima Hb tena baada ya wiki 4. Rufaa kama kuna dalili za moyo kushindwa.";
    facility = "Health centre (hospital if signs of heart failure)";
  } else if (lvl === "High" || lvl === "Moderate") {
    action = "Iron and folic acid per STG, test and treat malaria and worms, repeat Hb in about 4 weeks.";
    actionSw = "Vidonge vya chuma na folic kwa STG, pima na tibu malaria na minyoo, pima Hb tena baada ya wiki 4 hivi.";
    facility = lvl === "High" ? "Health centre (hospital if Hb falls under 7)" : "Health centre";
  } else {
    action = "Continue routine iron/folate; test Hb at booking and at 28–32 weeks.";
    actionSw = "Endelea na vidonge vya chuma/folic; pima Hb mwanzoni na wiki 28–32.";
    facility = "Dispensary / routine ANC";
  }
  return { a, applicable: true, prompts, variant, action, actionSw, facility };
}

function malaria(x: Ctx) {
  const a = new Acc(4);
  a.add(pos(x.anc.malariaTest), "Positive malaria test", 55, x.anc.malariaTest);
  a.add(/fever|chills|rigors/.test(x.sxNow) || (num(x.anc.temperature) || 0) >= 37.5, "Fever / chills", 22, x.anc.temperature ? `${x.anc.temperature} °C` : undefined);
  a.add(/headache|body ache|joint pain/.test(x.sxNow), "Headache / body aches", 6);
  a.add(x.anc.itnGiven === "No", "No insecticide-treated net", 12);
  a.add((x.anc.iptpDose === "Not given" || !x.anc.iptpDose) && x.gest >= 14 && x.anc.iptpDose !== undefined, "No IPTp-SP dose yet", 12);
  const hb = num(x.anc.hb);
  a.add(hb !== undefined && hb < 11, "Anaemia (malaria-related?)", 8, `Hb ${hb} g/dL`);
  const gravida = num(x.rch.gravida);
  a.add(x.p.age <= 20 || (gravida !== undefined && gravida <= 1), "First pregnancy / young mother", 6);
  a.add(pos(x.anc.hivTest), "HIV co-infection", 8);
  const lvl = level(a.score);
  const feverish = /fever|chills|rigors/.test(x.sxNow) || (num(x.anc.temperature) || 0) >= 37.5;
  const prompts: Prompt[] = feverish && notDone(x.anc.malariaTest)
    ? [{ en: "Fever recorded but no malaria test. Test with RDT now.", sw: "Homa imerekodiwa lakini hakuna kipimo cha malaria. Pima RDT sasa." }] : [];
  return {
    a, applicable: true, prompts,
    action: lvl === "High" ? "Confirm with RDT or smear. Uncomplicated: artemether/lumefantrine in any trimester. Severe or with danger signs: IM or IV artesunate and admit (Tanzania STG)."
      : lvl === "Moderate" ? "Test with RDT now. If positive, treat and do not give IPTp-SP. If negative and due, give IPTp-SP (not with cotrimoxazole or folic acid 5 mg or more daily)."
      : "Give IPTp-SP from 14 weeks: at least 3 doses, 4 weeks apart. Not with cotrimoxazole or folic acid 5 mg or more daily. Confirm net use.",
    actionSw: lvl === "High" ? "Thibitisha kwa RDT au slide. Isiyo kali: artemether/lumefantrine trimesta yoyote. Kali au dalili za hatari: artesunate IM au IV na lazwa (STG ya Tanzania)."
      : lvl === "Moderate" ? "Pima RDT sasa. Ikiwa chanya, tibu na usitoe IPTp-SP. Ikiwa hasi na ni wakati, toa IPTp-SP (si kwa anayetumia cotrimoxazole au folic acid 5 mg au zaidi kila siku)."
      : "Toa IPTp-SP kuanzia wiki 14: dozi angalau 3, kila wiki 4. Si kwa anayetumia cotrimoxazole au folic acid 5 mg au zaidi kila siku. Hakikisha anatumia chandarua.",
    facility: lvl === "High" ? "Hospital" : lvl === "Moderate" ? "Health centre" : "Dispensary / routine ANC",
  };
}

function hivsyph(x: Ctx) {
  const a = new Acc(3);
  const hiv = pos(x.anc.hivTest);
  a.add(hiv, "HIV reactive", 38, x.anc.hivTest);
  a.add(hiv && x.anc.arvGiven !== "Yes", "HIV reactive, ARVs not yet given", 22);
  a.add(pos(x.anc.syphilisTest), "Syphilis reactive", 40, x.anc.syphilisTest);
  a.add(pos(x.rch.partnerHiv), "Partner HIV positive", 20);
  a.add(pos(x.anc.hepatitisB), "Hepatitis B positive", 16, x.anc.hepatitisB);
  a.add(x.anc.hivTest === "Not Done" || x.anc.hivTest === "Unknown", "HIV status unknown", 14);
  a.add(x.anc.syphilisTest === "Not Done", "Syphilis screen not done", 10);
  a.add(x.p.age <= 19, "Adolescent (higher STI exposure)", 5, `${x.p.age} yrs`);
  const lvl = level(a.score);
  return {
    a, applicable: true,
    action: lvl === "High" ? "HIV: start lifelong ART at diagnosis and link to the CTC. Syphilis: treat per STG. Treat the partner and plan infant prophylaxis."
      : lvl === "Moderate" ? "Complete HIV, syphilis and hepatitis B screening today; counsel and test partner."
      : "Screening up to date. Repeat HIV test in third trimester where indicated.",
    actionSw: lvl === "High" ? "VVU: anza ARV za maisha wakati wa utambuzi na muunganishe na CTC. Kaswende: tibu kwa STG. Tibu mwenza na panga kinga ya mtoto."
      : lvl === "Moderate" ? "Kamilisha vipimo vya VVU, kaswende na hepatitis B leo; mshauri na pima mwenza."
      : "Vipimo vimekamilika. Rudia kipimo cha VVU trimesta ya tatu inapohitajika.",
    facility: lvl === "High" ? "CTC / PMTCT-capable facility" : lvl === "Moderate" ? "Health centre" : "Dispensary / routine ANC",
  };
}

function sepsis(x: Ctx) {
  const a = new Acc(2);
  const t = num(x.anc.temperature);
  const pulse = num(x.anc.pulse);
  const rr = num(x.anc.respiratoryRate);
  a.add(t !== undefined && t >= 38, "Fever ≥ 38 °C", 32, `${t} °C`);
  a.add(t !== undefined && t < 36, "Hypothermia < 36 °C", 28, `${t} °C`);
  a.add(t === undefined && /fever/.test(x.sxNow), "Fever reported", 20);
  a.add(pulse !== undefined && pulse >= 100, "Tachycardia ≥ 100 bpm", 18, `${pulse} bpm`);
  a.add(rr !== undefined && rr >= 22, "Fast breathing ≥ 22/min", 18, `${rr}/min`);
  a.add(/painful urination|dysuria|burning urine|\buti\b/.test(x.sxNow), "Painful urination (UTI)", 14);
  a.add(/leaking liquor|waters broke|rupture/.test(x.sxNow), "Leaking liquor (PROM)", 16);
  a.add(/foul|offensive discharge/.test(x.sxNow), "Foul-smelling discharge", 14);
  a.add(/severe abdominal pain/.test(x.sxNow), "Severe abdominal pain", 8);
  a.add(x.sys > 0 && x.sys < 90, "Hypotension (SBP < 90)", 28, `${x.sys} mmHg`);
  a.add(pos(x.anc.malariaTest), "Malaria positive (alternative source)", 6);
  a.add(pos(x.anc.hivTest), "HIV (immunocompromise)", 5);
  const lvl = level(a.score);
  return {
    a, applicable: true,
    action: lvl === "High" ? "Resuscitate (IV line and fluids), start antibiotics per Tanzania STG, take blood for culture if septicaemia is suspected, and refer immediately to hospital."
      : lvl === "Moderate" ? "Find the source (urine, chest, genital tract, ruptured membranes, malaria); treat per STG; review within 24–48 hours."
      : "No sepsis signs. Counsel on hygiene and when to return.",
    actionSw: lvl === "High" ? "Mpe huduma ya kwanza (IV na maji), anza antibiotiki kwa STG, chukua damu kwa utamaduni kama septisemia inashukiwa, na mpeleke hospitali mara moja."
      : lvl === "Moderate" ? "Tafuta chanzo (mkojo, kifua, via vya uzazi, maji yaliyovuja, malaria); tibu kwa STG; rudi ndani ya saa 24–48."
      : "Hakuna dalili za sepsis. Elimisha usafi na lini kurudi.",
    facility: lvl === "High" ? "Hospital" : lvl === "Moderate" ? "Health centre" : "Dispensary / routine ANC",
  };
}

function ectopic(x: Ctx) {
  const early = x.gest > 0 && x.gest <= 12;
  const a = new Acc(1);
  a.add(early && /severe abdominal pain|lower abdominal pain|abdominal pain/.test(x.sxNow), "Abdominal pain in early pregnancy", 32);
  a.add(early && /bleed/.test(x.sxNow), "Vaginal bleeding in early pregnancy", 28);
  a.add(early && /shoulder|faint|dizz|collapse/.test(x.sxNow), "Shoulder-tip pain / dizziness / fainting", 26);
  a.add(early && x.sys > 0 && x.sys < 90, "Hypotension (possible rupture)", 30, `${x.sys} mmHg`);
  a.add(early && (num(x.anc.pulse) || 0) >= 110, "Tachycardia", 12, `${x.anc.pulse} bpm`);
  a.add(early && /ectopic|tubal|pelvic infection|\bpid\b/.test(x.hist), "Prior ectopic / pelvic infection", 16);
  a.add(early && (/syphilis|chlamydia|gonorr/.test(x.hist) || pos(x.anc.syphilisTest)), "STI history", 8);
  const lvl = level(a.score);
  return {
    a, applicable: early,
    action: lvl === "High" ? "Obstetric emergency: resuscitate (IV access, check Hb, IV fluids) and refer at once with a skilled attendant as escort."
      : lvl === "Moderate" ? "Refer to a higher-level facility with ultrasound and surgical expertise. Do not discharge until an intrauterine pregnancy is confirmed."
      : "No ectopic features. Counsel on early pregnancy danger signs.",
    actionSw: lvl === "High" ? "Dharura ya uzazi: mpe huduma ya kwanza (IV, pima Hb, maji ya IV) na mpeleke mara moja na mhudumu stadi."
      : lvl === "Moderate" ? "Rufaa kituo cha ngazi ya juu chenye ultrasound na upasuaji. Usimruhusu hadi mimba ithibitishwe ndani ya mji wa mimba."
      : "Hakuna dalili za mimba nje ya kizazi. Elimisha dalili za hatari.",
    facility: lvl === "High" ? "Hospital (surgical capability)" : lvl === "Moderate" ? "Higher-level facility with ultrasound" : "Dispensary / routine ANC",
  };
}

function preterm(x: Ctx) {
  const a = new Acc(3);
  const pretermWindow = x.gest === 0 || x.gest < 37;
  a.add(pretermWindow && /leaking liquor|waters broke|rupture/.test(x.sxNow), "Leaking liquor (PPROM)", 32);
  a.add(pretermWindow && /contraction|labour pain|labor pain|lower back pain|back pain/.test(x.sxNow), "Contractions / persistent back pain", 18);
  a.add(pretermWindow && /severe abdominal pain/.test(x.sxNow), "Severe abdominal pain", 14);
  a.add(/bleed/.test(x.sxNow), "Vaginal bleeding", 16);
  a.add(/twin|multiple/.test(x.hist), "Multiple pregnancy", 24);
  a.add(/preterm|premature/.test(x.hist), "Prior preterm birth", 24);
  a.add(x.rch.priorStillbirth === "Yes", "Prior stillbirth", 8);
  a.add(x.p.age <= 17, "Adolescent pregnancy", 8, `${x.p.age} yrs`);
  a.add(x.p.age >= 35, "Maternal age ≥ 35", 6, `${x.p.age} yrs`);
  a.add(/painful urination|dysuria|\buti\b/.test(x.sxNow) || pos(x.anc.syphilisTest), "Genitourinary infection", 12);
  a.add((num(x.anc.temperature) || 0) >= 38 || /fever/.test(x.sxNow), "Maternal fever", 10);
  a.add(x.sys >= 140 || x.dia >= 90, "Hypertensive disorder (indicated early delivery)", 10);
  a.add(x.bmi !== undefined && x.bmi < 18.5, "Underweight", 8, x.bmi ? `BMI ${x.bmi}` : undefined);
  a.add(num(x.anc.muac) !== undefined && (num(x.anc.muac) as number) < 23, "Low MUAC", 6);
  const lvl = level(a.score);
  return {
    a, applicable: pretermWindow,
    action: lvl === "High" ? "Refer to hospital with newborn care. If membranes have ruptured: antibiotic prophylaxis per STG, and steroids if under 34 weeks. If fever or foul liquor: treat as chorioamnionitis and plan delivery whatever the gestation."
      : lvl === "Moderate" ? "Close follow-up every 1–2 weeks; treat infections; plan delivery at a facility with newborn care."
      : "Routine ANC. Counsel on signs of preterm labour.",
    actionSw: lvl === "High" ? "Rufaa hospitali yenye huduma ya watoto wachanga. Maji yakivuja: antibiotiki kwa STG, na steroid kama chini ya wiki 34. Homa au maji yenye harufu mbaya: tibu kama chorioamnionitis na panga kujifungua bila kujali wiki."
      : lvl === "Moderate" ? "Fuatilia kila wiki 1–2; tibu maambukizi; jifungulie kituo chenye huduma ya watoto wachanga."
      : "Kliniki ya kawaida. Elimisha dalili za uchungu kabla ya wakati.",
    facility: lvl === "High" ? "Hospital with newborn unit" : lvl === "Moderate" ? "Health centre / hospital" : "Dispensary / routine ANC",
  };
}

function depression(x: Ctx) {
  // Screening prompt only: this engine does not diagnose. The strongest signal is a positive EPDS/PHQ screen entered in notes.
  const a = new Acc(3);
  a.add(/suicid|self-harm|want to die|end my life/.test(x.sx), "Thoughts of self-harm recorded", 70);
  a.add(/epds|phq/.test(x.sx) && /positive|≥ ?1[0-3]|high/.test(x.sx), "Positive depression screen recorded", 40);
  a.add(/hopeless|depress|low mood|\bsad\b|crying|anxious|anxiety|worried|can'?t sleep|insomnia|no appetite|withdrawn/.test(x.sxNow), "Low mood / anxiety / sleep problems", 26);
  a.add(/depress|anxiety|mental/.test(x.hist), "Past mental-health history", 18);
  a.add(/single|separated|widow/i.test(x.rch.maritalStatus || ""), "Limited partner support", 10, x.rch.maritalStatus);
  a.add(x.p.age <= 17, "Adolescent pregnancy", 10, `${x.p.age} yrs`);
  a.add(x.rch.priorStillbirth === "Yes" || (num(x.rch.abortions) || 0) >= 1, "Prior pregnancy loss", 10);
  a.add(pos(x.anc.hivTest), "HIV diagnosis (added stress)", 6);
  a.add(x.sys >= 140 || /complication|twin|diabetes|preeclampsia/.test(x.hist), "High-risk pregnancy (stress load)", 6);
  const lvl = level(a.score);
  return {
    a, applicable: true,
    action: lvl === "High" ? "Do a same-day mental-health assessment, assess safety, and refer to mental-health services; involve a trusted family member."
      : lvl === "Moderate" ? "Screen with EPDS or PHQ-9 at this visit; offer counselling and peer support; re-screen at next visit."
      : "Ask about mood at each visit; re-screen at 28–32 weeks and postnatally.",
    actionSw: lvl === "High" ? "Fanya tathmini ya afya ya akili leo, angalia usalama, na mpe rufaa; mshirikishe ndugu wa karibu."
      : lvl === "Moderate" ? "Fanya uchunguzi wa EPDS au PHQ-9 ziara hii; toa ushauri nasaha; rudia ziara ijayo."
      : "Uliza kuhusu hali ya moyo kila ziara; rudia uchunguzi wiki 28–32 na baada ya kujifungua.",
    facility: lvl === "High" ? "Mental-health service / hospital" : lvl === "Moderate" ? "Health centre (counselling)" : "Dispensary / routine ANC",
  };
}

/* ---------------- public API ---------------- */

const META: Record<ConditionId, { name: string; nameSw: string; group: ConditionGroup; run: (x: Ctx) => RunOut }> = {
  preeclampsia: { name: "Preeclampsia / Eclampsia", nameSw: "Kifafa cha mimba (Preeclampsia)", group: "Hypertensive & metabolic", run: preeclampsia },
  gdm: { name: "Gestational diabetes", nameSw: "Kisukari cha mimba", group: "Hypertensive & metabolic", run: gdm },
  pph: { name: "Postpartum haemorrhage risk", nameSw: "Hatari ya kutokwa damu baada ya kujifungua", group: "Haemorrhage & blood", run: pph },
  anaemia: { name: "Anaemia in pregnancy", nameSw: "Upungufu wa damu", group: "Haemorrhage & blood", run: anaemia },
  malaria: { name: "Malaria in pregnancy", nameSw: "Malaria wakati wa ujauzito", group: "Infection", run: malaria },
  hivsyph: { name: "HIV / Syphilis (PMTCT)", nameSw: "VVU / Kaswende (PMTCT)", group: "Infection", run: hivsyph },
  sepsis: { name: "Maternal sepsis", nameSw: "Sepsis ya mama mjamzito", group: "Infection", run: sepsis },
  ectopic: { name: "Ectopic pregnancy", nameSw: "Mimba nje ya kizazi", group: "Pregnancy outcome", run: ectopic },
  preterm: { name: "Preterm birth", nameSw: "Kujifungua kabla ya wakati", group: "Pregnancy outcome", run: preterm },
  depression: { name: "Perinatal depression (screen)", nameSw: "Msongo wa mawazo wa uzazi (uchunguzi)", group: "Mental health", run: depression },
};

export const CONDITION_IDS = Object.keys(META) as ConditionId[];

/** Score every condition for a patient's latest visit. Returns results sorted by score, highest first. */
export function assessConditions(p: Patient, visit?: CheckIn): ConditionResult[] {
  const c = visit || latest(p);
  if (!c) return [];
  const idx = p.checkIns.findIndex((v) => v.id === c.id);
  const prev = idx > 0 ? p.checkIns[idx - 1] : undefined;
  const { sys, dia } = bp(c.bloodPressure);
  const anc = c.anc || {};
  const rch = p.rch4 || {};
  const h = num(rch.height);
  const bmi = c.weight && h && h > 80 && h < 250 ? Math.round((c.weight / ((h / 100) ** 2)) * 10) / 10 : undefined;
  const sxNow = [c.symptoms, c.notes, ...(anc.dangerSigns || [])].join(" ").toLowerCase();
  const sxAll = p.checkIns.map((v) => [v.symptoms, v.notes, ...(v.anc?.dangerSigns || [])].join(" ")).join(" ").toLowerCase();
  const hist = `${p.complications || ""} ${p.history || ""}`.toLowerCase();
  const ctx: Ctx = { p, c, prev, sys, dia, gest: gestNow(p, c), sx: sxAll, sxNow, hist, anc, rch, bmi };

  return CONDITION_IDS.map((id) => {
    const m = META[id];
    const r = m.run(ctx);
    const score = r.applicable ? r.a.score : Math.min(r.a.score, 5);
    return {
      id, name: r.name ?? m.name, nameSw: r.nameSw ?? m.nameSw, group: m.group,
      score, level: level(score), applicable: r.applicable,
      drivers: r.applicable ? r.a.sorted() : [],
      action: r.action, actionSw: r.actionSw, facility: r.facility,
      severe: r.severe, htn: r.htn, variant: r.variant, prompts: r.applicable ? (r.prompts ?? []) : [],
    } satisfies ConditionResult;
  }).sort((a, b) => b.score - a.score);
}

/** Headline numbers for the dashboard strip. */
export function conditionSummary(results: ConditionResult[]) {
  const live = results.filter((r) => r.applicable);
  return {
    high: live.filter((r) => r.level === "High").length,
    moderate: live.filter((r) => r.level === "Moderate").length,
    low: live.filter((r) => r.level === "Low").length,
    top: live[0],
    needsReferral: live.some((r) => r.level === "High"),
  };
}
