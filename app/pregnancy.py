"""Module 1: pregnancy risk. Question set, validation, XGBoost scoring, danger-sign override.

Order of authority: danger-sign rules > blood-pressure floor > model. The model can never
lower a band that a rule has raised.
"""
import json
import math
import time
from pathlib import Path

import numpy as np
import xgboost as xgb

MODEL_DIR = Path(__file__).resolve().parent.parent / "model"

YN = "yn"
INT = "int"
NUM = "num"

# code, model feature, type, min, max, required, sw label, en label
QUESTIONS = [
    ("PREG_GA_WEEKS",   "gestation_weeks",    INT, 4, 44, True,  "Mimba ina wiki ngapi?", "How many weeks pregnant?"),
    ("PREG_GRAVIDA",    "gravida",            INT, 1, 20, True,  "Hii ni mimba ya ngapi (pamoja na hii)?", "Which pregnancy is this (including this one)?"),
    ("PREG_PARITY",     "parity",             INT, 0, 19, True,  "Amejifungua mara ngapi kabla?", "How many times has she given birth before?"),
    ("PREG_ANC_VISITS", "anc_visits",         INT, 0, 15, True,  "Amehudhuria kliniki (ANC) mara ngapi kwa mimba hii?", "ANC visits for this pregnancy so far?"),
    ("PREG_PRIOR_PE",   "prior_preeclampsia", YN,  None, None, False, "Aliwahi kupata presha ya mimba au kifafa cha mimba?", "Pre-eclampsia or eclampsia in a past pregnancy?"),
    ("PREG_PRIOR_SB",   "prior_stillbirth",   YN,  None, None, False, "Aliwahi kuzaa mtoto mfu?", "Previous stillbirth?"),
    ("PREG_PRIOR_CS",   "prior_csection",     YN,  None, None, False, "Aliwahi kufanyiwa upasuaji wa kujifungua?", "Previous caesarean section?"),
    ("PREG_PRIOR_PPH",  "prior_pph",          YN,  None, None, False, "Aliwahi kutokwa damu nyingi baada ya kujifungua?", "Previous heavy bleeding after birth?"),
    ("PREG_BP_SYS",     "bp_sys",             INT, 60, 250, False, "Shinikizo la damu: namba ya juu", "Blood pressure: top number"),
    ("PREG_BP_DIA",     "bp_dia",             INT, 30, 150, False, "Shinikizo la damu: namba ya chini", "Blood pressure: bottom number"),
    ("PREG_MUAC",       "muac",               NUM, 10, 45, False, "Mzingo wa mkono (MUAC), sm", "Mid-upper arm circumference (cm)"),
]
Q = {q[0]: q for q in QUESTIONS}

# Danger signs from the RCH4 card ("dalili za hatari"). override=True forces URGENT regardless of the model.
DANGER_SIGNS = [
    ("DS_BLEEDING",     True,  "Kutokwa damu ukeni", "Vaginal bleeding"),
    ("DS_CONVULSIONS",  True,  "Degedege / kupoteza fahamu", "Convulsions / fits"),
    ("DS_HEADACHE",     True,  "Kuumwa kichwa sana", "Severe headache"),
    ("DS_VISION",       True,  "Kuona giza / kutoona vizuri", "Blurred vision"),
    ("DS_ABDO_PAIN",    True,  "Maumivu makali ya tumbo", "Severe abdominal pain"),
    ("DS_REDUCED_FM",   True,  "Mtoto amepunguza kucheza tumboni", "Baby moving less"),
    ("DS_LEAKING",      True,  "Kutokwa maji ukeni", "Leaking fluid"),
    ("DS_BREATHING",    True,  "Kupumua kwa shida", "Difficulty breathing"),
    ("DS_FEVER",        True,  "Homa kali", "High fever"),
    ("DS_SWELLING",     False, "Kuvimba uso au mikono", "Swelling of face or hands"),
    ("DS_VOMITING",     False, "Kutapika sana", "Severe vomiting"),
    ("DS_URINATION",    False, "Maumivu wakati wa kukojoa", "Painful urination"),
]
DS = {d[0]: d for d in DANGER_SIGNS}

BAND_ORDER = ["low", "medium", "high", "urgent"]


def _raise(band, floor):
    return band if BAND_ORDER.index(band) >= BAND_ORDER.index(floor) else floor


# ---------------- validation ----------------

def validate(answers, lang="sw"):
    """answers: {code: str}. Returns (clean: {code: value|None}, errors: {code: message})."""
    clean, errors = {}, {}
    for code, feat, typ, lo, hi, req, sw, en in QUESTIONS:
        raw = (answers.get(code) or "").strip()
        if raw == "":
            if req:
                errors[code] = "Swali hili linahitajika." if lang == "sw" else "This question is required."
            clean[code] = None
            continue
        if typ == YN:
            if raw not in ("1", "0"):
                errors[code] = "Chagua Ndiyo au Hapana." if lang == "sw" else "Choose Yes or No."
            clean[code] = 1 if raw == "1" else 0
            continue
        try:
            val = float(raw.replace(",", "."))
            if typ == INT and val != int(val):
                raise ValueError
        except ValueError:
            errors[code] = "Andika namba tu." if lang == "sw" else "Numbers only."
            clean[code] = None
            continue
        if not (lo <= val <= hi):
            errors[code] = (f"Namba hii haiwezekani. Weka kati ya {lo} na {hi}." if lang == "sw"
                            else f"That value isn't possible. Enter between {lo} and {hi}.")
            clean[code] = None
            continue
        clean[code] = int(val) if typ == INT else val

    g, p = clean.get("PREG_GRAVIDA"), clean.get("PREG_PARITY")
    if g is not None and p is not None and p >= g:
        errors["PREG_PARITY"] = ("Waliozaliwa kabla lazima wawe chini ya idadi ya mimba." if lang == "sw"
                                 else "Previous births must be fewer than pregnancies.")
    s, d = clean.get("PREG_BP_SYS"), clean.get("PREG_BP_DIA")
    if (s is None) != (d is None) and "PREG_BP_SYS" not in errors and "PREG_BP_DIA" not in errors:
        errors["PREG_BP_DIA" if d is None else "PREG_BP_SYS"] = (
            "Andika namba zote mbili za shinikizo la damu." if lang == "sw" else "Enter both blood pressure numbers.")
    if s is not None and d is not None and d >= s:
        errors["PREG_BP_DIA"] = ("Namba ya chini lazima iwe ndogo kuliko ya juu." if lang == "sw"
                                 else "Bottom number must be lower than the top number.")
    if g == 1:  # first pregnancy: past-pregnancy history does not apply
        for c in ("PREG_PRIOR_PE", "PREG_PRIOR_SB", "PREG_PRIOR_CS", "PREG_PRIOR_PPH"):
            clean[c] = 0
            errors.pop(c, None)

    clean["danger_signs"] = [c for c in DS if answers.get(c) == "1"]
    return clean, errors


# ---------------- model ----------------

class Model:
    def __init__(self):
        t = time.perf_counter()
        self.features = json.loads((MODEL_DIR / "features.json").read_text())["features"]
        self.names = [f["name"] for f in self.features]
        self.meta = json.loads((MODEL_DIR / "model_meta.json").read_text())
        self.booster = xgb.Booster()
        self.booster.load_model(MODEL_DIR / "model.json")
        booster_names = self.booster.feature_names
        if booster_names and list(booster_names) != self.names:
            raise RuntimeError(f"model.json features {booster_names} != features.json {self.names}")
        self.load_ms = (time.perf_counter() - t) * 1000
        self.version = self.meta.get("model_version", "unknown")
        self.bands = self.meta.get("bands", {"medium": 0.15, "high": 0.35})

    def vector(self, clean, age_years):
        fq = {q[1]: q[0] for q in QUESTIONS}
        row = []
        for name in self.names:
            if name == "age_years":
                v = age_years
            elif name == "danger_sign_count":
                v = len(clean["danger_signs"])
            else:
                v = clean.get(fq[name])
            row.append(np.nan if v is None else float(v))
        return np.array([row], dtype=float)

    def score(self, clean, age_years):
        x = self.vector(clean, age_years)
        t = time.perf_counter()
        dm = xgb.DMatrix(x, feature_names=self.names, missing=np.nan)
        p = float(self.booster.predict(dm)[0])
        contribs = self.booster.predict(dm, pred_contribs=True)[0][:-1]
        ms = (time.perf_counter() - t) * 1000
        factors = []
        for i in np.argsort(-contribs):
            if contribs[i] <= 0.05 or len(factors) == 3:
                break
            f = self.features[i]
            val = x[0][i]
            if math.isnan(val):  # a missing measurement is not a reason to show the mother
                continue
            if f["name"].startswith("prior_") and val == 0:  # "no previous X" is not a reason either
                continue
            factors.append({"feature": f["name"], "sw": f["sw"], "en": f["en"], "unit": f["unit"],
                            "yesno": f["name"].startswith("prior_"),
                            "value": int(val) if val == int(val) else round(val, 1),
                            "contribution": round(float(contribs[i]), 3)})
        return p, factors, ms


def band_from_prob(p, bands):
    return "high" if p >= bands["high"] else "medium" if p >= bands["medium"] else "low"


def assess(model, clean, age_years):
    """Returns the full assessment dict. Rules run first and are never overridden by the model."""
    p, factors, ms = model.score(clean, age_years)
    band = band_from_prob(p, model.bands)
    override_reasons = [c for c in clean["danger_signs"] if DS[c][1]]
    s, d = clean.get("PREG_BP_SYS"), clean.get("PREG_BP_DIA")
    if s is not None and d is not None:
        if s >= 160 or d >= 110:
            override_reasons.append("BP_SEVERE")
        elif s >= 140 or d >= 90:
            band = _raise(band, "high")
    rule_override = bool(override_reasons)
    if rule_override:
        band = "urgent"
    if age_years is not None and age_years < 18:
        band = _raise(band, "medium")
    return {"score": round(p, 4), "band": band, "top_factors": factors,
            "rule_override": rule_override, "override_reasons": override_reasons,
            "model_version": model.version, "compute_ms": round(ms, 2)}


# ---------------- adapter for the team's React frontend (RCH4 card shape) ----------------

# English danger-sign labels used by the frontend (src/components/anc-fields.tsx) -> codes above
FRONTEND_DS = {
    "Vaginal bleeding": "DS_BLEEDING", "Convulsions / fits": "DS_CONVULSIONS", "Severe headache": "DS_HEADACHE",
    "Blurred vision": "DS_VISION", "Severe abdominal pain": "DS_ABDO_PAIN", "Reduced fetal movement": "DS_REDUCED_FM",
    "Leaking liquor": "DS_LEAKING", "Difficulty breathing": "DS_BREATHING", "Fever": "DS_FEVER",
    "Swelling of face or hands": "DS_SWELLING", "Severe vomiting": "DS_VOMITING", "Painful urination": "DS_URINATION",
}
# Free-text symptoms that must still trigger the override if typed instead of ticked (safety net).
SYMPTOM_PATTERNS = [
    ("DS_BLEEDING", ("bleed", "kutokwa damu", "kutoka damu")), ("DS_CONVULSIONS", ("convuls", "seizure", "fits", "degedege")),
    ("DS_VISION", ("blurred", "vision changes", "kuona giza")), ("DS_REDUCED_FM", ("no movement", "reduced movement", "not moving")),
]
# Finding labels reuse the frontend's own wording so possibleComplications() keeps working.
DS_FINDING = {
    "DS_BLEEDING": ("Vaginal bleeding", "Any antepartum bleeding requires immediate referral."),
    "DS_CONVULSIONS": ("Neurological warning signs: convulsions", "Fits in pregnancy may be eclampsia."),
    "DS_HEADACHE": ("Neurological warning signs: severe headache", "Severe headache may indicate preeclampsia."),
    "DS_VISION": ("Neurological warning signs: blurred vision", "Visual changes may indicate preeclampsia."),
    "DS_ABDO_PAIN": ("Severe abdominal pain", "Possible abruption or other emergency."),
    "DS_REDUCED_FM": ("Reduced fetal movement", "Recommend immediate fetal assessment."),
    "DS_LEAKING": ("Leaking liquor", "Possible rupture of membranes."),
    "DS_BREATHING": ("Difficulty breathing", "Needs same-day assessment."),
    "DS_FEVER": ("Fever", "Possible infection."),
}
DS_NOTE_SW = {  # draft Swahili for DS_FINDING notes
    "DS_BLEEDING": "Kutokwa damu wakati wa ujauzito kunahitaji rufaa mara moja.",
    "DS_CONVULSIONS": "Degedege wakati wa ujauzito inaweza kuwa kifafa cha mimba.",
    "DS_HEADACHE": "Kuumwa kichwa sana kunaweza kuashiria kifafa cha mimba (preeclampsia).",
    "DS_VISION": "Mabadiliko ya kuona yanaweza kuashiria kifafa cha mimba (preeclampsia).",
    "DS_ABDO_PAIN": "Inaweza kuwa kondo kuachia au dharura nyingine.",
    "DS_REDUCED_FM": "Mtoto achunguzwe mara moja.",
    "DS_LEAKING": "Huenda chupa imepasuka.",
    "DS_BREATHING": "Achunguzwe leo hii.",
    "DS_FEVER": "Huenda ni maambukizi.",
}
FEATURE_EN_FINDING = {  # model feature -> finding label wording understood by possibleComplications()
    "bp_sys": "Hypertension risk, blood pressure (top)", "bp_dia": "Hypertension risk, blood pressure (bottom)",
    "prior_preeclampsia": "Prior preeclampsia", "age_years": "Maternal age",
}
RECOMMENDATION = {
    "low": ("Endelea na kliniki ya kawaida (ANC). Mkumbushe dalili za hatari.", "Continue routine ANC. Remind her of the danger signs."),
    "medium": ("Mtembelee tena ndani ya wiki 2. Hakikisha anahudhuria kliniki ijayo.", "Visit again within 2 weeks. Make sure she attends her next ANC visit."),
    "high": ("Mpe rufaa kwenda kituo cha afya wiki hii. Fuatilia kama amefika.", "Refer to the health facility this week. Follow up that she attended."),
    "urgent": ("Mpeleke kituo cha afya SASA HIVI. Usisubiri.", "Take her to the health facility NOW. Do not wait."),
}
CATEGORY = {"low": "Low", "medium": "Moderate", "high": "High", "urgent": "High"}


def _num(v):
    try:
        f = float(str(v).replace(",", "."))
        return f
    except (TypeError, ValueError):
        return None


def _yes(v):
    return None if not v else (1 if str(v).lower().startswith("y") else 0)


def from_frontend(age, gestation_at_reg, rch4, checkin, visit_count):
    """Build the validated feature dict from a frontend check-in. Returns (clean, errors[list of str])."""
    errors = []
    if age is None or not 10 <= age <= 55:
        errors.append("Umri lazima uwe kati ya miaka 10 na 55. / Age must be between 10 and 55.")
    bp = str(checkin.get("bloodPressure") or "").replace(" ", "")
    s = d = None
    if bp:
        parts = bp.split("/")
        s, d = (_num(parts[0]), _num(parts[1])) if len(parts) == 2 else (None, None)
        if s is None or d is None:
            errors.append("Andika shinikizo la damu kama 120/80. / Write blood pressure like 120/80.")
        elif not (60 <= s <= 250 and 30 <= d <= 150) or d >= s:
            errors.append(f"Shinikizo la damu {bp} haliwezekani. / Blood pressure {bp} isn't possible.")
            s = d = None
    anc = checkin.get("anc") or {}
    ga = _num(anc.get("gestationWeeks")) or gestation_at_reg
    if ga is not None and not 4 <= ga <= 44:
        errors.append("Umri wa mimba lazima uwe wiki 4 hadi 44. / Gestation must be 4 to 44 weeks.")
    w = checkin.get("weight")
    if w not in (None, "", 0) and not 25 <= (_num(w) or 0) <= 200:
        errors.append("Uzito lazima uwe kati ya kilo 25 na 200. / Weight must be 25 to 200 kg.")
    muac = _num(anc.get("muac"))
    if muac is not None and not 10 <= muac <= 45:
        errors.append("MUAC lazima iwe sm 10 hadi 45. / MUAC must be 10 to 45 cm.")
    g, p = _num(rch4.get("gravida")), _num(rch4.get("para"))
    if g is not None and not 1 <= g <= 20:
        errors.append("Idadi ya mimba (gravida) lazima iwe 1 hadi 20. / Gravida must be 1 to 20.")
    if g is not None and p is not None and p >= g:
        errors.append("Para lazima iwe chini ya gravida. / Para must be less than gravida.")
    if errors:
        return None, errors

    ds = {FRONTEND_DS[x] for x in (anc.get("dangerSigns") or []) if x in FRONTEND_DS}
    text = (checkin.get("symptoms") or "").lower()
    for code, pats in SYMPTOM_PATTERNS:
        if any(pt in text for pt in pats):
            ds.add(code)
    first = g == 1
    clean = {
        "PREG_GA_WEEKS": ga, "PREG_GRAVIDA": g, "PREG_PARITY": p,
        "PREG_ANC_VISITS": _num(anc.get("visitNumber")) or visit_count,
        "PREG_PRIOR_PE": 0 if first else _yes(rch4.get("priorPreeclampsia")),
        "PREG_PRIOR_SB": 0 if first else _yes(rch4.get("priorStillbirth")),
        "PREG_PRIOR_CS": 0 if first else _yes(rch4.get("priorCsection")),
        "PREG_PRIOR_PPH": 0 if first else _yes(rch4.get("priorPph")),
        "PREG_BP_SYS": s, "PREG_BP_DIA": d, "PREG_MUAC": muac,
        "danger_signs": sorted(ds, key=list(DS).index),
    }
    return clean, []


def frontend_analysis(result, clean, prev_score=None):
    """Turn assess() output into the frontend's Analysis object (src/lib/store.ts)."""
    band = result["band"]
    findings = []
    for code in result["override_reasons"]:
        if code == "BP_SEVERE":
            findings.append({"label": "Severe hypertension", "labelSw": "Shinikizo la damu juu sana", "severity": "High",
                             "note": "BP ≥ 160/110 mmHg: urgent obstetric review needed. (Danger rule, overrides the model.)",
                             "noteSw": "Shinikizo ≥ 160/110 mmHg: achunguzwe na daktari haraka. (Kanuni ya hatari, inazidi modeli.)"})
        else:
            lab, note = DS_FINDING[code]
            findings.append({"label": lab, "labelSw": DS[code][2], "severity": "High", "note": note + " (Danger sign, overrides the model.)",
                             "noteSw": DS_NOTE_SW[code] + " (Dalili ya hatari, inazidi modeli.)"})
    s, d = clean.get("PREG_BP_SYS"), clean.get("PREG_BP_DIA")
    if s is not None and d is not None and (140 <= s < 160 or 90 <= d < 110):
        findings.append({"label": "Preeclampsia risk", "labelSw": "Hatari ya kifafa cha mimba", "severity": "High",
                         "note": "BP ≥ 140/90 mmHg: at least High risk by rule.",
                         "noteSw": "Shinikizo ≥ 140/90 mmHg: angalau hatari ya juu kwa kanuni."})
    for c in clean["danger_signs"]:
        if not DS[c][1]:
            findings.append({"label": DS[c][3], "labelSw": DS[c][2], "severity": "Moderate", "note": "Danger sign noted; counted by the model.",
                             "noteSw": "Dalili ya hatari imeandikwa; modeli imeihesabu."})
    for f in result["top_factors"]:
        val = ("Yes" if f["value"] else "No") if f.get("yesno") else f"{f['value']} {f['unit']}".strip()
        label = FEATURE_EN_FINDING.get(f["feature"], f["en"])
        if f["feature"] == "age_years":
            label = "Adolescent pregnancy, age" if f["value"] < 18 else "Advanced maternal age" if f["value"] >= 35 else "Maternal age"
        findings.append({"label": f"{label}: {val}",
                         "labelSw": f"{f['sw']}: {('Ndiyo' if f['value'] else 'Hapana') if f.get('yesno') else val}",
                         "severity": "High" if band in ("high", "urgent") else "Moderate",
                         "note": f"One of the top reasons the model raised her risk (SHAP +{f['contribution']:.2f}).",
                         "noteSw": f"Moja ya sababu kuu za modeli kuongeza hatari yake (SHAP +{f['contribution']:.2f})."})
    risk = max(1, min(99, round(result["score"] * 100)))
    out = {
        "riskScore": risk, "category": CATEGORY[band], "band": band, "urgent": band == "urgent",
        "findings": findings,
        "recommendation": RECOMMENDATION[band][1], "recommendationSw": RECOMMENDATION[band][0],
        "modelVersion": result["model_version"], "ruleOverride": result["rule_override"],
        "computeMs": result["compute_ms"],
    }
    if prev_score is not None:
        delta = risk - prev_score
        out["delta"] = delta
        out["trend"] = "worsening" if delta > 4 else "improving" if delta < -4 else "stable"
    return out
