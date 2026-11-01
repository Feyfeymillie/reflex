"""Module 3a: the birth record of a newborn (Apgar, the golden minute, birth weight). Rule-based, not ML.

Apgar (Virginia Apgar, 1953; AAP/ACOG Committee Opinion 644): five signs, each scored 0, 1 or 2, at 1 and 5
minutes after birth. 5-minute total 7-10 is reassuring, 4-6 moderately abnormal, 0-3 low.
Apgar is NOT a diagnosis: on its own it does not prove birth asphyxia or predict a child's future. A low
5-minute score is a known risk factor for later developmental delay and cerebral palsy, so here it only
marks the child "watch closely", which tightens the milestone rule in child.guidance().

Golden minute (Helping Babies Breathe): a baby who is not breathing well by 60 seconds needs ventilation.
We record what help the baby needed; the mother can answer this even when no Apgar was taken (home birth).

Swahili text is a DRAFT for a native speaker and a clinician to check.
"""

VERSION = "newborn-v1"

# (key, en, sw-draft, [(score, en, sw-draft), ...])
APGAR_SIGNS = [
    ("appearance", "Appearance (skin colour)", "Rangi ya ngozi", [
        (0, "Blue or pale all over", "Bluu au amepauka mwili mzima"),
        (1, "Body pink, hands and feet blue", "Mwili wa waridi, mikono na miguu bluu"),
        (2, "Pink all over", "Waridi mwili mzima")]),
    ("pulse", "Pulse (heart rate)", "Mapigo ya moyo", [
        (0, "No heartbeat", "Hakuna mapigo"),
        (1, "Below 100 per minute", "Chini ya 100 kwa dakika"),
        (2, "100 or more per minute", "100 au zaidi kwa dakika")]),
    ("grimace", "Grimace (reflex when touched)", "Mwitikio akiguswa", [
        (0, "No response", "Hakuna mwitikio"),
        (1, "Grimaces", "Hukunja uso"),
        (2, "Cries, coughs or sneezes", "Hulia, hukohoa au hupiga chafya")]),
    ("activity", "Activity (muscle tone)", "Nguvu ya misuli", [
        (0, "Limp", "Mlegevu"),
        (1, "Some bending of arms and legs", "Hukunja mikono na miguu kidogo"),
        (2, "Moves actively", "Hujongea kwa nguvu")]),
    ("respiration", "Respiration (breathing)", "Kupumua", [
        (0, "Not breathing", "Hapumui"),
        (1, "Slow or irregular, weak cry", "Polepole au bila mpangilio, kilio dhaifu"),
        (2, "Breathing well, strong cry", "Anapumua vizuri, kilio kikubwa")]),
]
SIGN_KEYS = [s[0] for s in APGAR_SIGNS]

BREATHING_HELP = {
    "none": ("Cried or breathed well by himself/herself", "Alilia au kupumua mwenyewe"),
    "stimulation": ("Needed drying and rubbing only", "Alihitaji kukaushwa na kusuguliwa tu"),
    "bag_mask": ("Needed bag-and-mask breathing", "Alihitaji kupumuliwa kwa mfuko na barakoa"),
    "unknown": ("Don't know", "Sijui"),
}
SOURCES = ("clinic_card", "birth_attendant", "mother_report")
LOW_BIRTH_WEIGHT_G = 2500


def questions():
    return {"version": VERSION,
            "signs": [{"key": k, "en": en, "sw": sw, "options": [{"score": s, "en": oen, "sw": osw} for s, oen, osw in opts]}
                      for k, en, sw, opts in APGAR_SIGNS],
            "breathingHelp": [{"value": v, "en": en, "sw": sw} for v, (en, sw) in BREATHING_HELP.items()],
            "sources": list(SOURCES)}


def band(total):
    if total is None:
        return None
    return "reassuring" if total >= 7 else "moderate" if total >= 4 else "low"


def _total(raw, errors, label):
    """raw is a whole number 0-10, or {appearance: 0-2, ...} with all five signs. Returns (total, parts)."""
    if raw is None or raw == "":
        return None, None
    if isinstance(raw, dict):
        parts = {}
        for k in SIGN_KEYS:
            v = raw.get(k)
            if v not in (0, 1, 2, "0", "1", "2"):
                errors.append(f"Apgar {label}: alama zote 5 ziwe 0, 1 au 2. / Apgar {label}: all 5 signs must be 0, 1 or 2.")
                return None, None
            parts[k] = int(v)
        return sum(parts.values()), parts
    try:
        t = int(raw)
    except (TypeError, ValueError):
        t = -1
    if not 0 <= t <= 10 or str(raw).strip() not in (str(t), f"{t}.0"):
        errors.append(f"Apgar {label}: weka namba 0 hadi 10. / Apgar {label}: enter a whole number 0 to 10.")
        return None, None
    return t, None


def validate(b):
    """b: {apgar1, apgar5 (total or parts), breathingHelp, birthWeightGrams, source}. Returns (clean, errors)."""
    errors = []
    a1, p1 = _total(b.get("apgar1"), errors, "1 min")
    a5, p5 = _total(b.get("apgar5"), errors, "5 min")
    help_ = b.get("breathingHelp") or None
    if help_ is not None and help_ not in BREATHING_HELP:
        errors.append("Chagua msaada wa kupumua. / Choose the breathing help.")
    w = b.get("birthWeightGrams")
    weight = None
    if w not in (None, ""):
        try:
            weight = int(float(w))
        except (TypeError, ValueError):
            weight = -1
        if not 400 <= weight <= 6500:
            errors.append("Uzito wa kuzaliwa: gramu 400 hadi 6500. / Birth weight must be 400 to 6500 grams.")
    source = b.get("source") if b.get("source") in SOURCES else None
    return {"apgar1": a1, "apgar1Parts": p1, "apgar5": a5, "apgar5Parts": p5, "breathingHelp": help_,
            "birthWeightGrams": weight, "source": source}, errors


def is_empty(clean):
    return all(clean[k] is None for k in ("apgar1", "apgar5", "breathingHelp", "birthWeightGrams"))


def observations(clean):
    """[(code, value)] to store as observation rows."""
    out = []
    for m in ("1", "5"):
        if clean[f"apgar{m}"] is not None:
            out.append((f"NB_APGAR_{m}", str(clean[f"apgar{m}"])))
        for k, v in (clean[f"apgar{m}Parts"] or {}).items():
            out.append((f"NB_APGAR_{m}_{k.upper()}", str(v)))
    if clean["breathingHelp"]:
        out.append(("NB_BREATHING_HELP", clean["breathingHelp"]))
    if clean["birthWeightGrams"] is not None:
        out.append(("NB_BIRTH_WEIGHT_G", str(clean["birthWeightGrams"])))
    return out


def from_observations(obs):
    """Inverse of observations(): {code: value} -> clean dict."""
    def num(c):
        return int(obs[c]) if obs.get(c) not in (None, "") else None
    parts = lambda m: ({k: num(f"NB_APGAR_{m}_{k.upper()}") for k in SIGN_KEYS}
                       if all(f"NB_APGAR_{m}_{k.upper()}" in obs for k in SIGN_KEYS) else None)
    return {"apgar1": num("NB_APGAR_1"), "apgar1Parts": parts("1"), "apgar5": num("NB_APGAR_5"), "apgar5Parts": parts("5"),
            "breathingHelp": obs.get("NB_BREATHING_HELP"), "birthWeightGrams": num("NB_BIRTH_WEIGHT_G"), "source": None}


def assess(clean, gestation_weeks=None, place=None):
    """Fixed rules. Returns the summary shown on the child page. Never a diagnosis."""
    reasons = []
    if clean["apgar5"] is not None and clean["apgar5"] < 7:
        reasons.append(("APGAR5_LOW", f"Apgar ya dakika 5 ni {clean['apgar5']} (chini ya 7)",
                        f"5-minute Apgar was {clean['apgar5']} (below 7)"))
    if clean["breathingHelp"] == "bag_mask":
        reasons.append(("RESUSCITATED", "Alihitaji kupumuliwa wakati wa kuzaliwa", "Needed help to breathe at birth (bag and mask)"))
    if clean["birthWeightGrams"] is not None and clean["birthWeightGrams"] < LOW_BIRTH_WEIGHT_G:
        reasons.append(("LOW_BIRTH_WEIGHT", f"Uzito mdogo wa kuzaliwa ({clean['birthWeightGrams']} g)",
                        f"Low birth weight ({clean['birthWeightGrams']} g)"))
    if gestation_weeks and gestation_weeks < 37:
        reasons.append(("PRETERM", f"Alizaliwa kabla ya wakati (wiki {gestation_weeks})", f"Born early ({gestation_weeks} weeks)"))
    watch = bool(reasons)
    clinic_check = watch and place != "facility" and any(c in ("APGAR5_LOW", "RESUSCITATED") for c, _, _ in reasons)
    if watch:
        sw = ("Mfuatilie kwa karibu: angalia hatua za ukuaji kila ziara. Hatua yoyote ambayo bado hajafikia, ongea na CHW. "
              "Hii si utambuzi.")
        en = ("Watch closely: check milestones at every visit. Any milestone not yet reached, talk to the CHW. "
              "This is not a diagnosis.")
        if clinic_check:
            sw += " Mpeleke kliniki kwa uchunguzi wa mtoto mchanga."
            en += " Take the baby to the clinic for a newborn check."
    else:
        sw = "Kuzaliwa kulikwenda vizuri kwa taarifa tulizonazo. Endelea na ratiba ya kawaida."
        en = "Birth looks reassuring from what we know. Follow the usual schedule."
    return {"version": VERSION, **{k: clean[k] for k in ("apgar1", "apgar1Parts", "apgar5", "apgar5Parts", "breathingHelp",
                                                         "birthWeightGrams")},
            "apgar1Band": band(clean["apgar1"]), "apgar5Band": band(clean["apgar5"]),
            "watchClosely": watch, "clinicCheck": clinic_check,
            "reasons": [{"code": c, "sw": s, "en": e} for c, s, e in reasons],
            "messageSw": sw, "messageEn": en}
