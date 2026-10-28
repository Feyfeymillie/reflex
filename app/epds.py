"""Module 2: postpartum depression screening with the Edinburgh Postnatal Depression Scale (EPDS).

Rule-scored, not ML: there are no Tanzanian training labels for PPD prediction.
English items: Cox, Holden & Sagovsky (1987), Br J Psychiatry 150:782-6; free to use with this citation.
The Swahili text below is a DRAFT. Replace it with a validated Swahili EPDS before any real use.
Each option carries its own score because items 3 and 5-10 are reverse-scored.
"""

MODEL_VERSION = "epds-rule-v1"

# What each item measures (Daniel's accepted list, 6 Oct). Items 1, 2, 4 score 0->3 top to bottom; 3 and 5-10 are reversed.
DOMAINS = {
    "EPDS_Q1": ("Kufurahia / kucheka", "Anhedonia (ability to laugh)"),
    "EPDS_Q2": ("Kutazamia mambo", "Enjoyment"),
    "EPDS_Q3": ("Kujilaumu bila sababu", "Unnecessary self-blame"),
    "EPDS_Q4": ("Wasiwasi", "Anxiety"),
    "EPDS_Q5": ("Hofu / kushtuka", "Panic"),
    "EPDS_Q6": ("Kushindwa kumudu", "Coping difficulty"),
    "EPDS_Q7": ("Shida ya usingizi", "Sleep disturbance"),
    "EPDS_Q8": ("Huzuni", "Sadness"),
    "EPDS_Q9": ("Kulia", "Crying"),
    "EPDS_Q10": ("Mawazo ya kujidhuru", "Thoughts of self-harm"),
}
REVERSED = {"EPDS_Q3", "EPDS_Q5", "EPDS_Q6", "EPDS_Q7", "EPDS_Q8", "EPDS_Q9", "EPDS_Q10"}

# (code, sw, en, [(score, sw, en), ...])  options in the order they are printed on the form
ITEMS = [
    ("EPDS_Q1", "Nimeweza kucheka na kuona upande wa kuchekesha wa mambo",
     "I have been able to laugh and see the funny side of things",
     [(0, "Kama kawaida yangu", "As much as I always could"), (1, "Si sana sasa", "Not quite so much now"),
      (2, "Hakika si sana sasa", "Definitely not so much now"), (3, "Hapana kabisa", "Not at all")]),
    ("EPDS_Q2", "Nimetazamia mambo kwa furaha", "I have looked forward with enjoyment to things",
     [(0, "Kama kawaida yangu", "As much as I ever did"), (1, "Kidogo kuliko zamani", "Rather less than I used to"),
      (2, "Hakika kidogo kuliko zamani", "Definitely less than I used to"), (3, "Karibu hapana kabisa", "Hardly at all")]),
    ("EPDS_Q3", "Nimejilaumu bila sababu mambo yalipoharibika", "I have blamed myself unnecessarily when things went wrong",
     [(3, "Ndiyo, mara nyingi", "Yes, most of the time"), (2, "Ndiyo, wakati mwingine", "Yes, some of the time"),
      (1, "Si mara nyingi", "Not very often"), (0, "Hapana, kamwe", "No, never")]),
    ("EPDS_Q4", "Nimekuwa na wasiwasi bila sababu nzuri", "I have been anxious or worried for no good reason",
     [(0, "Hapana, kabisa", "No, not at all"), (1, "Mara chache sana", "Hardly ever"),
      (2, "Ndiyo, wakati mwingine", "Yes, sometimes"), (3, "Ndiyo, mara nyingi sana", "Yes, very often")]),
    ("EPDS_Q5", "Nimeogopa au kushtuka bila sababu nzuri", "I have felt scared or panicky for no very good reason",
     [(3, "Ndiyo, mara nyingi", "Yes, quite a lot"), (2, "Ndiyo, wakati mwingine", "Yes, sometimes"),
      (1, "Hapana, si sana", "No, not much"), (0, "Hapana, kabisa", "No, not at all")]),
    ("EPDS_Q6", "Mambo yamenizidi", "Things have been getting on top of me",
     [(3, "Ndiyo, mara nyingi sijaweza kumudu kabisa", "Yes, most of the time I haven't been able to cope at all"),
      (2, "Ndiyo, wakati mwingine sijamudu kama kawaida", "Yes, sometimes I haven't been coping as well as usual"),
      (1, "Hapana, mara nyingi nimemudu vizuri", "No, most of the time I have coped quite well"),
      (0, "Hapana, nimemudu kama kawaida", "No, I have been coping as well as ever")]),
    ("EPDS_Q7", "Nimekuwa na huzuni kiasi cha kukosa usingizi", "I have been so unhappy that I have had difficulty sleeping",
     [(3, "Ndiyo, mara nyingi", "Yes, most of the time"), (2, "Ndiyo, wakati mwingine", "Yes, sometimes"),
      (1, "Si mara nyingi", "Not very often"), (0, "Hapana, kabisa", "No, not at all")]),
    ("EPDS_Q8", "Nimejisikia huzuni au mnyonge", "I have felt sad or miserable",
     [(3, "Ndiyo, mara nyingi", "Yes, most of the time"), (2, "Ndiyo, mara kwa mara", "Yes, quite often"),
      (1, "Si mara nyingi", "Not very often"), (0, "Hapana, kabisa", "No, not at all")]),
    ("EPDS_Q9", "Nimekuwa na huzuni kiasi cha kulia", "I have been so unhappy that I have been crying",
     [(3, "Ndiyo, mara nyingi", "Yes, most of the time"), (2, "Ndiyo, mara kwa mara", "Yes, quite often"),
      (1, "Mara moja moja tu", "Only occasionally"), (0, "Hapana, kamwe", "No, never")]),
    ("EPDS_Q10", "Wazo la kujidhuru limenijia", "The thought of harming myself has occurred to me",
     [(3, "Ndiyo, mara nyingi", "Yes, quite often"), (2, "Wakati mwingine", "Sometimes"),
      (1, "Mara chache sana", "Hardly ever"), (0, "Kamwe", "Never")]),
]
CODES = [i[0] for i in ITEMS]
# Guard: printed option order must match the standard scoring direction.
for _c, _, _, _opts in ITEMS:
    _scores = [o[0] for o in _opts]
    assert _scores == ([3, 2, 1, 0] if _c in REVERSED else [0, 1, 2, 3]), _c

# Cut-offs need a clinician's sign-off for Tanzania. Common choices: >=10 possible, >=13 probable.
POSSIBLE, PROBABLE = 10, 13

ACTIONS = {
    "low": ("Ujumbe wa kujitunza (usingizi, msaada wa familia). Mpime tena baada ya wiki 4.",
            "Self-care messages (sleep, family support). Re-screen in 4 weeks."),
    "medium": ("Ziara ya CHW nyumbani na elimu ya afya ya akili. Mpime tena baada ya wiki 2.",
               "CHW home visit and psychoeducation. Re-screen in 2 weeks."),
    "high": ("Mpe rufaa kwenda kituo cha afya. CHW afuatilie mpaka amefika.",
             "Refer to the health facility. CHW follows up until she has attended."),
    "urgent": ("Wasiliana na CHW / kituo cha afya LEO. Usimwache peke yake.",
               "Contact the CHW / facility TODAY. Do not leave her alone."),
}


def questions():
    return [{"code": c, "domain_sw": DOMAINS[c][0], "domain_en": DOMAINS[c][1], "reversed": c in REVERSED,
             "sw": sw, "en": en, "options": [{"score": s, "sw": osw, "en": oen} for s, osw, oen in opts]}
            for c, sw, en, opts in ITEMS]


def validate(answers):
    """answers: {code: score}. Returns (clean, errors)."""
    clean, errors = {}, {}
    for c, _, en, opts in ITEMS:
        v = answers.get(c)
        valid = {s for s, _, _ in opts}
        try:
            v = int(v)
        except (TypeError, ValueError):
            errors[c] = "Jibu swali hili. / Answer this question."
            continue
        if v not in valid:
            errors[c] = "Jibu si sahihi. / Invalid answer."
            continue
        clean[c] = v
    return clean, errors


def score(clean):
    total = sum(clean.values())
    self_harm = clean["EPDS_Q10"] > 0
    band = "low" if total < POSSIBLE else "medium" if total < PROBABLE else "high"
    if self_harm:
        band = "urgent"
    return {"score": total, "band": band, "self_harm": self_harm,
            "action_sw": ACTIONS[band][0], "action_en": ACTIONS[band][1], "model_version": MODEL_VERSION}
