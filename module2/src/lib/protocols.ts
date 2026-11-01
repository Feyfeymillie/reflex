// Module 2: care protocols. What should happen AFTER a condition is flagged.
// IMPORTANT: no drug doses here on purpose. Doses and regimens must come from the
// Tanzania Standard Treatment Guidelines / national protocol. Have a clinician review
// every action before real use. Preeclampsia follows WHO recommendations (2011 to 2021 updates).
import type { ConditionId, HtnType } from "./conditions";

export type Phase = "prevent" | "stabilise" | "refer" | "followup";
export type Level = "Moderate" | "High";

export type ProtocolAction = {
  id: string;
  phase: Phase;
  levels: Level[]; // levels at which this action is shown
  text: string;
  when?: "severe" | "nonsevere"; // hypertension card only: shown only with or without severe features
  subtypes?: HtnType[]; // hypertension card only: shown only for these types (unset = all)
  variants?: string[]; // other cards: shown only for these sub-cases (unset = all), e.g. anaemia "oral" / "transfuse"
};

/** How far the steps were checked against the Tanzania Standard Treatment Guidelines. */
export type Verified = "stg" | "partial" | "general";
export type Protocol = {
  id: ConditionId; source: string; verified: Verified;
  refs?: { label: string; url: string }[]; actions: ProtocolAction[];
};

const OBS = "https://prescribingcompanion.com/tanzania/other-common-clinical-conditions/obstetrics-gynecology-and-contraception/";
const INF = "https://prescribingcompanion.com/tanzania/infections-and-infectious-diseases-prescribing/";
const PROM_REF = { label: "Tanzania STG: Prelabour rupture of membranes", url: INF + "obstetrics-gynecology-and-contraception/prelabour-rupture-of-membranes-prom/" };

export const PHASE_LABEL: Record<Phase, { en: string; sw: string }> = {
  prevent: { en: "Prevent", sw: "Kuzuia" },
  stabilise: { en: "Act now", sw: "Hatua ya haraka" },
  refer: { en: "Refer", sw: "Rufaa" },
  followup: { en: "Follow up", sw: "Ufuatiliaji" },
};

const MH: Level[] = ["Moderate", "High"];
const H: Level[] = ["High"];

export const PROTOCOLS: Protocol[] = [
  {
    id: "preeclampsia",
    verified: "stg",
    source: "Tanzania Standard Treatment Guidelines (hypertensive disorders, eclampsia) and WHO recommendations for pre-eclampsia and eclampsia",
    refs: [
      { label: "Tanzania STG: Hypertensive disorders in pregnancy", url: "https://prescribingcompanion.com/tanzania/other-common-clinical-conditions/obstetrics-gynecology-and-contraception/hypertensive-disorders-in-pregnancy/" },
      { label: "Tanzania STG: Eclampsia", url: "https://prescribingcompanion.com/tanzania/other-common-clinical-conditions/obstetrics-gynecology-and-contraception/eclampsia/" },
    ],
    actions: [
      { id: "pe-aspirin", phase: "prevent", levels: MH, text: "Offer low-dose aspirin to women at high risk (dose per Tanzania STG)." },
      { id: "pe-calcium", phase: "prevent", levels: MH, text: "Give calcium supplementation to women at high risk (dose per Tanzania STG)." },
      { id: "pe-recheck", phase: "stabilise", levels: MH, text: "Repeat BP after rest. Confirm raised BP on two readings at least 4 hours apart (not needed if severe-range). Test urine protein." },
      { id: "pe-signs", phase: "stabilise", levels: H, when: "nonsevere", subtypes: ["preeclampsia", "suspected"], text: "Check for severe features: severe headache, blurred vision, upper belly pain, vomiting with these, breathlessness, fits. Any one of them means severe preeclampsia." },
      { id: "pe-refer-ns", phase: "refer", levels: H, when: "nonsevere", subtypes: ["preeclampsia", "suspected"], text: "Refer to hospital: admit for close monitoring if under 37 weeks; from 37 weeks admit and plan delivery. Send the referral note (BP trend, urine protein, symptoms)." },
      { id: "pe-iv", phase: "stabilise", levels: H, when: "severe", subtypes: ["preeclampsia", "suspected"], text: "Secure IV access. Monitor BP, reflexes, breathing and urine output." },
      { id: "pe-mgso4", phase: "stabilise", levels: H, when: "severe", subtypes: ["preeclampsia", "suspected"], text: "Magnesium sulphate for severe features: full regimen if the facility can give it, otherwise loading dose, then transfer at once (regimen per Tanzania STG)." },
      { id: "pe-antihtn", phase: "stabilise", levels: H, when: "severe", subtypes: ["preeclampsia", "suspected"], text: "Give antihypertensives for severe features, per the Tanzania STG regimen." },
      { id: "pe-steroid", phase: "stabilise", levels: H, when: "severe", subtypes: ["preeclampsia", "suspected"], text: "If the pregnancy is preterm, give antenatal corticosteroids per Tanzania STG." },
      { id: "pe-call", phase: "refer", levels: H, when: "severe", subtypes: ["preeclampsia", "suspected"], text: "Call the receiving hospital and arrange transport with a trained escort." },
      { id: "pe-note", phase: "refer", levels: H, when: "severe", subtypes: ["preeclampsia", "suspected"], text: "Send the referral note: BP trend, urine protein and treatment already given." },
      { id: "htn-severe", phase: "stabilise", levels: H, when: "severe", subtypes: ["gestational", "chronic"], text: "Severe-range BP: admit to hospital and treat per the Tanzania STG." },
      { id: "htn-severe-refer", phase: "refer", levels: H, when: "severe", subtypes: ["gestational", "chronic"], text: "Call the hospital, arrange transport, and send the referral note. Refer to the next level if there is no improvement." },
      { id: "gh-protein", phase: "stabilise", levels: MH, subtypes: ["gestational"], text: "Test urine protein at every visit. New protein turns this into preeclampsia." },
      { id: "gh-visits", phase: "followup", levels: MH, subtypes: ["gestational"], text: "Antenatal visits every 2 weeks until 32 weeks, then every week. Plan hospital delivery at 37 completed weeks." },
      { id: "ch-review", phase: "stabilise", levels: MH, subtypes: ["chronic"], text: "Review antihypertensive treatment per Tanzania STG and look for an underlying cause if the hypertension is new." },
      { id: "pe-recheck-plan", phase: "followup", levels: MH, text: "Book a BP and urine protein recheck (sooner at higher risk). Interval per guideline." },
      { id: "pe-counsel", phase: "followup", levels: MH, text: "Counsel patient and family on danger signs: severe headache, vision changes, fits, upper belly pain, reduced baby movement." },
      { id: "pe-postpartum", phase: "followup", levels: H, text: "Continue BP monitoring and treatment after delivery (preeclampsia can start postpartum)." },
    ],
  },
  {
    id: "gdm",
    verified: "general",
    source: "General clinical practice. No Tanzania STG page for gestational diabetes was found, so these steps are not checked.",
    actions: [
      { id: "gdm-diet", phase: "prevent", levels: MH, text: "Give dietary and activity advice." },
      { id: "gdm-test", phase: "stabilise", levels: MH, text: "Confirm with a fasting or glucose tolerance test per guideline." },
      { id: "gdm-scan", phase: "stabilise", levels: H, text: "Arrange a fetal growth scan." },
      { id: "gdm-refer", phase: "refer", levels: H, text: "Refer for diabetes care at hospital level." },
      { id: "gdm-follow", phase: "followup", levels: MH, text: "Book glucose recheck and plan delivery with the hospital team." },
    ],
  },
  {
    id: "pph",
    verified: "stg",
    source: "Tanzania STG (postpartum haemorrhage). The antenatal risk-planning steps are good practice and are not in the STG.",
    refs: [{ label: "Tanzania STG: Postpartum haemorrhage (PPH)", url: OBS + "postpartum-hemorrhage-pph/" }],
    actions: [
      { id: "pph-plan", phase: "prevent", levels: MH, text: "Plan delivery at a facility that can manage haemorrhage, not at home (good practice)." },
      { id: "pph-hb", phase: "prevent", levels: MH, text: "Correct anaemia before delivery." },
      { id: "pph-donor", phase: "prevent", levels: MH, text: "Identify a blood donor and record the contact." },
      { id: "pph-amtsl", phase: "prevent", levels: MH, text: "At delivery: active management of the third stage (oxytocin IM or misoprostol, with controlled cord traction), per Tanzania STG." },
      { id: "pph-ready", phase: "stabilise", levels: H, text: "Make sure the delivery facility can place two large IV lines, give IV fluids and oxytocin, and has blood available." },
      { id: "pph-transport", phase: "stabilise", levels: H, text: "Confirm transport and a skilled escort for labour." },
      { id: "pph-alert", phase: "refer", levels: H, text: "Alert the delivery facility about the PPH risk factors." },
      { id: "pph-refer", phase: "refer", levels: H, text: "If bleeding continues after delivery: refer immediately with a skilled escort and keep the IV infusion running during transfer." },
      { id: "pph-follow", phase: "followup", levels: MH, text: "Review the birth plan at the next visit." },
    ],
  },
  {
    id: "anaemia",
    verified: "stg",
    source: "Tanzania STG (anaemia in pregnancy; malaria in pregnancy for the SP and folic acid interaction)",
    refs: [
      { label: "Tanzania STG: Anaemia in pregnancy", url: OBS + "anaemia-in-pregnancy/" },
      { label: "Tanzania STG: Malaria in pregnancy", url: INF + "malaria/management-of-malaria-in-special-groups/" },
    ],
    actions: [
      { id: "an-hb", phase: "stabilise", levels: MH, text: "Check Hb (full blood count), a blood smear for malaria, stool and urine tests, and an HIV test." },
      { id: "an-cause", phase: "stabilise", levels: MH, text: "Prevent and treat malaria early; investigate and treat worm infestation." },
      { id: "an-iron", phase: "prevent", levels: MH, text: "Iron and folic acid per Tanzania STG. Take iron on a full stomach, not with tea or coffee." },
      { id: "an-sp", phase: "prevent", levels: MH, text: "If IPTp-SP is due: SP does not work with folic acid at 5 mg or more a day, but can be given with iron and folic acid 0.25 mg. The anaemia prophylaxis lists folic acid 5 mg, so check this before giving both." },
      { id: "an-oral", phase: "stabilise", levels: MH, variants: ["oral"], text: "Hb under 7 before the third trimester: iron and folic acid combined tablet for 4 weeks plus vitamin B, per STG." },
      { id: "an-transfuse", phase: "stabilise", levels: H, variants: ["transfuse"], text: "Hb under 7 in the third trimester or with signs of heart failure: refer or admit for blood transfusion (at least 2 units of packed red cells per STG), then continue iron and folic acid." },
      { id: "an-refer", phase: "refer", levels: H, variants: ["transfuse"], text: "Refer or admit to a transfusion-capable hospital." },
      { id: "an-recheck", phase: "followup", levels: MH, text: "Repeat Hb in about 4 weeks." },
    ],
  },
  {
    id: "malaria",
    verified: "stg",
    source: "Tanzania STG (malaria in pregnancy)",
    refs: [{ label: "Tanzania STG: Malaria in pregnancy", url: INF + "malaria/management-of-malaria-in-special-groups/" }],
    actions: [
      { id: "ma-test", phase: "stabilise", levels: MH, text: "Confirm with RDT or blood slide." },
      { id: "ma-treat", phase: "stabilise", levels: MH, text: "Uncomplicated malaria: artemether/lumefantrine in any trimester, per STG. If malaria is diagnosed, do not give IPTp-SP; give full treatment instead." },
      { id: "ma-severe", phase: "stabilise", levels: H, text: "Severe malaria (high fever, cerebral signs, low blood sugar, severe anaemia, breathlessness): IM or IV artesunate in any trimester, per STG." },
      { id: "ma-admit", phase: "refer", levels: H, text: "Refer or admit if severe or with danger signs." },
      { id: "ma-prevent", phase: "prevent", levels: MH, text: "IPTp-SP: at least 3 doses, first from 14 weeks, at least 4 weeks apart, last up to delivery (dose per STG)." },
      { id: "ma-sp-check", phase: "prevent", levels: MH, text: "Do not give SP to women on cotrimoxazole or taking folic acid 5 mg or more a day. SP can be given with iron and folic acid 0.25 mg." },
      { id: "ma-net", phase: "prevent", levels: MH, text: "Confirm insecticide-treated net use." },
      { id: "ma-follow", phase: "followup", levels: MH, text: "Recheck and test Hb at the next visit." },
    ],
  },
  {
    id: "hivsyph",
    verified: "partial",
    source: "Tanzania STG (HIV treatment and PMTCT). The syphilis treatment is in an STI flow chart image that was not checked.",
    refs: [{ label: "Tanzania STG: HIV treatment and PMTCT", url: INF + "hiv-and-aids/treatment-of-hiv-and-aids-in-adults-and-adolescents/" }],
    actions: [
      { id: "hs-start", phase: "stabilise", levels: MH, text: "HIV: start lifelong ART at diagnosis, whatever the CD4 count (TDF + 3TC + DTG is the STG first-line regimen)." },
      { id: "hs-syph", phase: "stabilise", levels: MH, text: "Syphilis: treat the mother and the partner per the Tanzania STG STI flow chart." },
      { id: "hs-screen", phase: "stabilise", levels: MH, text: "Complete HIV, syphilis and hepatitis B screening." },
      { id: "hs-partner", phase: "stabilise", levels: MH, text: "Counsel and test the partner." },
      { id: "hs-link", phase: "refer", levels: H, text: "Link to the Care and Treatment Clinic (CTC) from the moment she tests positive. ART can start at RCH where available." },
      { id: "hs-ctx", phase: "followup", levels: MH, text: "If cotrimoxazole prophylaxis is started, do not give IPTp-SP." },
      { id: "hs-infant", phase: "followup", levels: MH, text: "Plan infant nevirapine syrup from birth for 6 weeks, ideally within 6 to 12 hours (add AZT for high-risk infants), per STG." },
    ],
  },
  {
    id: "sepsis",
    verified: "stg",
    source: "Tanzania STG (puerperal sepsis; prelabour rupture of membranes). The STG covers infection after birth and with ruptured membranes. Other antenatal sepsis follows the same principles.",
    refs: [
      { label: "Tanzania STG: Puerperal sepsis", url: INF + "obstetrics-gynecology-and-contraception/puerperal-sepsis/" },
      PROM_REF,
    ],
    actions: [
      { id: "se-source", phase: "stabilise", levels: MH, text: "Look for the source: urine, chest, genital tract (including ruptured membranes or retained products), malaria." },
      { id: "se-fluids", phase: "stabilise", levels: H, text: "Establish an IV line and give IV fluids per STG." },
      { id: "se-abx", phase: "stabilise", levels: H, text: "Start antibiotics per Tanzania STG without delay. Take blood for culture if septicaemia is suspected." },
      { id: "se-chorio", phase: "stabilise", levels: H, text: "If the membranes have ruptured with fever or foul-smelling liquor (chorioamnionitis): treat per STG and plan delivery whatever the gestation." },
      { id: "se-vitals", phase: "stabilise", levels: H, text: "Monitor temperature, pulse, breathing and BP closely." },
      { id: "se-refer", phase: "refer", levels: H, text: "Resuscitate and refer immediately to a hospital." },
      { id: "se-follow", phase: "followup", levels: MH, text: "Review within 24 to 48 hours." },
    ],
  },
  {
    id: "ectopic",
    verified: "stg",
    source: "Tanzania STG (ectopic pregnancy)",
    refs: [{ label: "Tanzania STG: Ectopic pregnancy", url: OBS + "ectopic-pregnancy/" }],
    actions: [
      { id: "ec-resus", phase: "stabilise", levels: H, text: "Ruptured ectopic (acute pain, low BP, fast weak pulse): ABCD resuscitation, secure IV access, check Hb and start IV fluids per STG." },
      { id: "ec-no-discharge", phase: "stabilise", levels: MH, text: "Do not discharge until an intrauterine pregnancy is confirmed (good practice, not in the STG)." },
      { id: "ec-scan", phase: "refer", levels: MH, text: "Spotting with one-sided pain (unruptured): refer to a higher-level facility with equipment and expertise." },
      { id: "ec-refer", phase: "refer", levels: H, text: "Obstetric emergency: resuscitate and refer immediately, with a skilled attendant as escort." },
    ],
  },
  {
    id: "preterm",
    verified: "partial",
    source: "Tanzania STG (prelabour rupture of membranes). Steps for preterm labour with intact membranes are good practice and were not checked.",
    refs: [PROM_REF],
    actions: [
      { id: "pt-infect", phase: "prevent", levels: MH, text: "Treat infections (urine, genital tract) per guideline." },
      { id: "pt-abx", phase: "stabilise", levels: H, text: "If the membranes have ruptured (leaking liquor): give antibiotic prophylaxis per Tanzania STG and refer to hospital." },
      { id: "pt-steroid", phase: "stabilise", levels: H, text: "If the pregnancy is under 34 weeks, give antenatal corticosteroids per Tanzania STG." },
      { id: "pt-chorio", phase: "stabilise", levels: H, text: "If fever or foul-smelling liquor appears, treat as chorioamnionitis and plan delivery whatever the gestation." },
      { id: "pt-speculum", phase: "refer", levels: H, text: "At hospital: confirm leaking liquor with a sterile speculum examination, ultrasound and urinalysis." },
      { id: "pt-refer", phase: "refer", levels: H, text: "Refer to a facility with a newborn care unit." },
      { id: "pt-follow", phase: "followup", levels: MH, text: "Follow up every 1 to 2 weeks and counsel on labour signs." },
    ],
  },
  {
    id: "depression",
    verified: "general",
    source: "General clinical practice. No matching Tanzania STG page for perinatal depression was found, so these steps are not checked.",
    actions: [
      { id: "de-screen", phase: "stabilise", levels: MH, text: "Screen with EPDS or PHQ-9 and record the score." },
      { id: "de-safety", phase: "stabilise", levels: H, text: "Ask directly about safety and thoughts of self-harm. Do not leave her alone." },
      { id: "de-refer", phase: "refer", levels: H, text: "Same-day referral to mental-health services; involve a trusted family member." },
      { id: "de-counsel", phase: "followup", levels: MH, text: "Offer counselling and peer support." },
      { id: "de-rescreen", phase: "followup", levels: MH, text: "Re-screen at the next visit and after birth." },
    ],
  },
];

export const POSTPARTUM_ACTIONS: { id: string; text: string }[] = [
  { id: "pp-bp-discharge", text: "BP checked before discharge." },
  { id: "pp-bp-contact", text: "BP checked at each postnatal contact." },
  { id: "pp-treat", text: "Treatment continued after delivery per guideline." },
  { id: "pp-signs", text: "Danger signs explained to the mother and family." },
];

export const protocolFor = (id: ConditionId) => PROTOCOLS.find((p) => p.id === id);

/** Actions to show for a condition at its current level (and, where relevant, its type, severity or sub-case). */
export function visibleActions(proto: Protocol | undefined, level: Level, severe?: boolean, htn?: HtnType, variant?: string): ProtocolAction[] {
  return (proto?.actions || []).filter(
    (x) =>
      x.levels.includes(level) &&
      (x.when === undefined || (x.when === "severe") === !!severe) &&
      (x.subtypes === undefined || (htn !== undefined && x.subtypes.includes(htn))) &&
      (x.variants === undefined || (variant !== undefined && x.variants.includes(variant))),
  );
}
