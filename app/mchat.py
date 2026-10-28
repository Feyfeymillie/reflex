"""Module 3b: M-CHAT-R autism screening for toddlers aged 16-30 months. Rule-scored, not ML.

Items, order and scoring follow the official M-CHAT-R/F (Robins, Fein & Barton, rev. March 2025,
mchatscreen.com): items 2, 5 and 12 are risk when answered YES, every other item is risk when NO.
0-2 low, 3-7 moderate (give the Follow-Up interview; refer if it scores 2+), 8-20 high (refer).
The authors forbid changing items, and electronic distribution needs their permission: get it before
any deployment beyond this demo. The Follow-Up interview is not built yet.
The Swahili below is a DRAFT. Replace it with the authors' official Swahili translation if one exists,
or a forward/back translation they approve.
"""

MODEL_VERSION = "mchat-r-v1"
AGE_MIN, AGE_MAX = 16, 30
RISK_IF_YES = {2, 5, 12}

# (number, en, sw-draft)
ITEMS = [
    (1, "If you point at something across the room, does your child look at it?",
     "Ukionyesha kwa kidole kitu kilicho upande wa pili wa chumba, je, mtoto wako hukitazama?"),
    (2, "Have you ever wondered if your child might be deaf?",
     "Je, umewahi kujiuliza kama mtoto wako huenda ni kiziwi?"),
    (3, "Does your child play pretend or make-believe?",
     "Je, mtoto wako hucheza michezo ya kuigiza au kujifanya?"),
    (4, "Does your child like climbing on things?",
     "Je, mtoto wako hupenda kupanda vitu?"),
    (5, "Does your child make unusual finger movements near his or her eyes?",
     "Je, mtoto wako hufanya miondoko isiyo ya kawaida ya vidole karibu na macho yake?"),
    (6, "Does your child point with one finger to ask for something or to get help?",
     "Je, mtoto wako huonyesha kwa kidole kimoja ili kuomba kitu au kupata msaada?"),
    (7, "Does your child point with one finger to show you something interesting?",
     "Je, mtoto wako huonyesha kwa kidole kimoja ili kukuonyesha kitu cha kuvutia?"),
    (8, "Is your child interested in other children?",
     "Je, mtoto wako huvutiwa na watoto wengine?"),
    (9, "Does your child show you things by bringing them to you or holding them up for you to see, not to get help, but just to share?",
     "Je, mtoto wako hukuonyesha vitu kwa kukuletea au kuviinua uvione, si kwa kuomba msaada, bali kushiriki nawe tu?"),
    (10, "Does your child respond when you call his or her name?",
     "Je, mtoto wako huitika ukimwita kwa jina lake?"),
    (11, "When you smile at your child, does he or she smile back at you?",
     "Ukimtabasamia mtoto wako, je, naye hukutabasamia?"),
    (12, "Does your child get upset by everyday noises?",
     "Je, mtoto wako hukasirika au kusumbuka kwa sauti za kawaida za kila siku?"),
    (13, "Does your child walk?",
     "Je, mtoto wako anatembea?"),
    (14, "Does your child look you in the eye when you are talking to him or her, playing with him or her, or dressing him or her?",
     "Je, mtoto wako hukutazama machoni unapozungumza naye, kucheza naye au kumvalisha?"),
    (15, "Does your child try to copy what you do?",
     "Je, mtoto wako hujaribu kuiga unachofanya?"),
    (16, "If you turn your head to look at something, does your child look around to see what you are looking at?",
     "Ukigeuza kichwa kutazama kitu, je, mtoto wako hugeuka kuona unachotazama?"),
    (17, "Does your child try to get you to watch him or her?",
     "Je, mtoto wako hujaribu kukufanya umtazame?"),
    (18, "Does your child understand when you tell him or her to do something?",
     "Je, mtoto wako huelewa unapomwambia afanye jambo fulani?"),
    (19, "If something new happens, does your child look at your face to see how you feel about it?",
     "Jambo jipya likitokea, je, mtoto wako hutazama uso wako kuona unavyolichukulia?"),
    (20, "Does your child like movement activities?",
     "Je, mtoto wako hupenda michezo ya kubembea au kurushwa-rushwa?"),
]
CODES = [f"MCHAT_Q{n}" for n, _, _ in ITEMS]

ACTIONS = {
    "low": ("Hakuna hatua zaidi sasa. Endelea kucheza na kuongea na mtoto; mpime tena kliniki ijayo kama ana chini ya miezi 24.",
            "No further action now. Keep playing and talking together; rescreen at the next clinic visit if under 24 months."),
    "medium": ("Maswali ya ufuatiliaji (M-CHAT-R/F Follow-Up) yanahitajika na mhudumu aliyefunzwa. Mpe rufaa kama alama ya ufuatiliaji ni 2 au zaidi.",
               "Follow-Up interview needed by a trained worker. Refer if the Follow-Up score is 2 or more."),
    "high": ("Mpe rufaa kwa tathmini ya kina ya ukuaji na huduma za mapema. Hii si utambuzi.",
             "Refer for a full developmental evaluation and early intervention. This is not a diagnosis."),
}


def questions():
    return [{"code": f"MCHAT_Q{n}", "n": n, "en": en, "sw": sw, "riskIfYes": n in RISK_IF_YES} for n, en, sw in ITEMS]


def validate(answers):
    """answers: {code: 'yes'|'no'}. All 20 are required: the authors do not allow subsets."""
    clean, missing = {}, []
    for code in CODES:
        v = answers.get(code)
        if v in ("yes", "no"):
            clean[code] = v
        else:
            missing.append(code)
    return clean, missing


def score(clean):
    risk = []
    for n, _, _ in ITEMS:
        a = clean[f"MCHAT_Q{n}"]
        if (a == "yes") == (n in RISK_IF_YES):
            risk.append(n)
    total = len(risk)
    band = "low" if total <= 2 else "medium" if total <= 7 else "high"
    return {"score": total, "band": band, "riskItems": risk,
            "action_sw": ACTIONS[band][0], "action_en": ACTIONS[band][1], "model_version": MODEL_VERSION}
