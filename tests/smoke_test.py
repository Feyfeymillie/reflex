"""End-to-end API smoke test against a running hub. Standard library only, so it runs on the Pi as is.

    REFLEX_SMOKE_USER=smoke REFLEX_SMOKE_PASS='...' python tests/smoke_test.py http://127.0.0.1:8000

It signs in as a CHW first (create one with `python -m app.manage create-chw smoke --name "Smoke Test"`; an
administrator account cannot reach clinical routes, by design). It creates test mothers: wipe demo data before
a demo with `python -m app.manage reset-demo-data`.
"""
import http.cookiejar
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
OPENER = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))  # keeps the session cookie


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method, headers={"Content-Type": "application/json", "X-Reflex": "1"})
    try:
        with OPENER.open(r) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw.startswith(("{", "[")) else raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        return e.code, json.loads(raw) if raw.startswith("{") else raw


def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        sys.exit(1)


CONSENT = {"care": True, "aggregate_reporting": True}


def register(name, age, rch4, checkin, consent=CONSENT):
    return call("POST", "/api/v1/patients", {"name": name, "age": age, "gestationWeeks": checkin.get("anc", {}).get("gestationWeeks"),
                                             "rch4": rch4, "consent": consent, "checkIn": checkin})


# 0. every clinical route is closed to anonymous visitors, then sign in as a CHW
s, _ = call("GET", "/api/v1/patients")
check(s == 401, "anonymous request to /api/v1/patients is refused (401)")
USER, PASS = os.environ.get("REFLEX_SMOKE_USER"), os.environ.get("REFLEX_SMOKE_PASS")
if not USER or not PASS:
    sys.exit("Set REFLEX_SMOKE_USER and REFLEX_SMOKE_PASS to a CHW account (python -m app.manage create-chw ...).")
s, b = call("POST", "/api/v1/auth/login", {"username": USER, "password": PASS})
check(s == 200 and b["user"]["role"] == "chw" and not b["user"]["mustChangePassword"], "CHW signed in (a CLI-created CHW has no forced password change)")

# 1. SPA is served, unknown API paths are JSON 404s
s, body = call("GET", "/")
check(s == 200 and "<div id=\"root\">" in body, "frontend index.html served")
s, body = call("GET", "/patients")
check(s == 200 and "<div id=\"root\">" in body, "client route falls back to index.html")
s, _ = call("GET", "/api/v1/nope")
check(s == 404, "unknown API path is 404 (once signed in)")

# 2. validation and consent
s, b = register("Mama Mdogo", 7, {}, {"bloodPressure": "120/80"})
check(s == 422 and any("10 na 55" in e for e in b["errors"]), "age 7 rejected with Swahili + English message")
s, b = register("Neema Juma", 27, {}, {"bloodPressure": "400/95"})
check(s == 422 and any("haliwezekani" in e for e in b["errors"]), "BP 400/95 rejected politely")
s, b = register("Neema Juma", 27, {}, {"bloodPressure": "120/80"}, consent={"care": False})
check(s == 403, "no care consent, nothing stored")
s, pts = call("GET", "/api/v1/patients")
check(s == 200 and not any(p["name"] in ("Neema Juma", "Mama Mdogo") for p in pts), "rejected registrations left no rows")

# 3. high-risk profile: rules + model + reasons
rch4 = {"gravida": "3", "para": "2", "priorPreeclampsia": "Yes", "priorStillbirth": "Yes", "village": "Kibaha", "phone": "0712345678"}
ck = {"bloodPressure": "148/95", "weight": 70, "symptoms": "", "notes": "", "anc": {"gestationWeeks": "30", "visitNumber": "1", "dangerSigns": []}}
s, neema = register("Neema Juma", 27, rch4, ck)
check(s == 200 and neema["checkIns"][0]["analysis"]["category"] == "High", "BP 148/95 + prior pre-eclampsia/stillbirth → High")
a = neema["checkIns"][0]["analysis"]
check(any("SHAP" in f["note"] for f in a["findings"]), "model reasons included as findings (DHS model: prior stillbirth)")
check(a["modelVersion"].startswith(("dhs", "synthetic")), "analysis names the model version")

# 4. danger sign forces urgent on an otherwise low profile; free text too
low = {"bloodPressure": "110/70", "weight": 60, "symptoms": "", "notes": "", "anc": {"gestationWeeks": "20", "dangerSigns": ["Vaginal bleeding"]}}
s, rehema = register("Rehema Ally", 24, {"gravida": "1", "para": "0"}, low)
ra = rehema["checkIns"][0]["analysis"]
check(ra["band"] == "urgent" and ra["ruleOverride"], "ticked bleeding → urgent override")
check(rehema["checkIns"][0]["referral"]["status"] == "created", "urgent creates a referral without waiting for a click")
low2 = dict(low, symptoms="kutokwa damu kidogo, shinikizo la damu sawa", anc={"gestationWeeks": "20", "dangerSigns": []})
s, x = register("Asha Musa", 24, {"gravida": "1", "para": "0"}, low2)
check(x["checkIns"][0]["analysis"]["band"] == "urgent", "typed 'damu' in symptoms → urgent (safety net)")
# second pregnancy: in TDHS 2022 a first pregnancy carries ~1.5x the perinatal death rate, so the DHS model puts it in Medium
s, zawadi = register("Zawadi Said", 24, {"gravida": "2", "para": "1", "priorStillbirth": "No", "priorPreeclampsia": "No", "priorCsection": "No", "priorPph": "No"}, dict(low, anc={"gestationWeeks": "20", "dangerSigns": []}))
check(zawadi["checkIns"][0]["analysis"]["category"] == "Low", "same profile without danger sign → Low")

# 5. second visit adds a trend; CHW review
s, n2 = call("POST", f"/api/v1/patients/{neema['id']}/checkins",
             {"bloodPressure": "162/112", "weight": 72, "symptoms": "", "notes": "", "anc": {"gestationWeeks": "32", "dangerSigns": []}})
check(s == 200 and len(n2["checkIns"]) == 2 and "trend" in n2["checkIns"][1]["analysis"], "second visit scored with trend")
aid = n2["checkIns"][0]["assessmentId"]
s, b = call("POST", f"/api/v1/assessments/{aid}/review", {"decision": "override", "finalBand": "low"})
check(s == 422, "override without a reason is refused")
s, b = call("POST", f"/api/v1/assessments/{aid}/review", {"decision": "accept"})
check(s == 200 and b["checkIns"][0]["review"]["decision"] == "accept" and b["checkIns"][0]["referral"], "accept High → referral")

# 6. module 2: consent, birth, EPDS with cross-module context
s, _ = call("POST", f"/api/v1/patients/{neema['id']}/epds", {"answers": {f"EPDS_Q{i}": 0 for i in range(1, 11)}})
check(s == 403, "EPDS blocked before postnatal consent")
call("POST", f"/api/v1/persons/{neema['id']}/consent", {"module": "postnatal_mh", "care": True})
born = (date.today() - timedelta(days=200)).isoformat()
s, b = call("POST", f"/api/v1/patients/{neema['id']}/birth",
            {"outcome": "live_birth", "date": born, "place": "facility", "babyName": "Baraka", "babySex": "male", "gestationAtBirthWeeks": 34})
check(s == 200 and b["pregnancy"]["outcome"] == "live_birth" and len(b["children"]) == 1, "birth recorded, child created")
kid = b["children"][0]["id"]
ans = {f"EPDS_Q{i}": 1 for i in range(1, 10)} | {"EPDS_Q10": 0}
s, b = call("POST", f"/api/v1/patients/{neema['id']}/epds", {"answers": ans})
check(s == 200 and b["score"] == 9 and b["band"] == "low", "EPDS 9 → low")
check(b["context"]["pregnancyBand"] in ("high", "urgent"), "EPDS result reads her pregnancy risk (cross-module)")
s, b = call("POST", f"/api/v1/patients/{neema['id']}/epds", {"answers": {f"EPDS_Q{i}": 0 for i in range(1, 10)} | {"EPDS_Q10": 1}})
check(b["band"] == "urgent" and b["self_harm"] and b["patient"]["postnatal"][-1]["referral"], "Q10 > 0 → urgent + referral, total 1")
s, b = call("POST", f"/api/v1/patients/{neema['id']}/epds", {"answers": {"EPDS_Q1": 7}})
check(s == 422, "incomplete or invalid EPDS rejected")

# 7. a mother can enter at module 2
s, b = call("POST", "/api/v1/postnatal-entry", {"name": "Halima Bakari", "age": 31, "village": "Mlandizi", "consent": {"care": True},
                                                "birth": {"outcome": "stillbirth", "date": (date.today() - timedelta(days=20)).isoformat(), "place": "home"}})
check(s == 200 and b["pregnancy"]["outcome"] == "stillbirth" and b["consent"]["postnatal_mh"], "postnatal entry without ANC history")

# 8. module 3: child guidance, corrected age, fixed rule, no score
s, c = call("GET", f"/api/v1/children/{kid}")
check(s == 200 and c["corrected"] and c["ageMonths"] < 7, f"preterm baby uses corrected age ({c['ageMonths']} months)")
s, _ = call("POST", f"/api/v1/children/{kid}/milestones", {"answers": {}})
check(s == 403, "child guidance needs the mother's consent for the child")
call("POST", f"/api/v1/persons/{kid}/consent", {"module": "child_dev", "care": True})
prev = c["plan"]["previous"]
cur = c["plan"]["current"]
check(c["newborn"]["watchClosely"] and [r["code"] for r in c["newborn"]["reasons"]] == ["PRETERM"],
      "preterm baby (34 weeks) is marked 'watch closely' even with no Apgar recorded")
s, g = call("POST", f"/api/v1/children/{kid}/milestones", {"answers": {m["code"]: "yes" for m in prev} | {cur[0]["code"]: "not_yet"}})
check(s == 200 and g["advise_contact_chw"] and g["watch_closely"], "watch-closely child: a not-yet on the current age → talk to CHW")
s, g = call("POST", f"/api/v1/children/{kid}/milestones", {"answers": {prev[0]["code"]: "not_yet"}} if prev else {"answers": {}, "lostSkill": True})
check(g["advise_contact_chw"] and "score" not in g and "band" not in g, "overdue milestone → talk to CHW, and no score anywhere")

# 9. EPDS item labels and scoring direction (items 1, 2, 4 forward; 3 and 5-10 reversed)
s, q = call("GET", "/api/v1/epds/questions")
qs = q["questions"]
check([x["domain_en"] for x in qs] == ["Anhedonia (ability to laugh)", "Enjoyment", "Unnecessary self-blame", "Anxiety", "Panic",
                                       "Coping difficulty", "Sleep disturbance", "Sadness", "Crying", "Thoughts of self-harm"],
      "EPDS items carry the 10 accepted domain labels in order")
check(all([o["score"] for o in x["options"]] == ([3, 2, 1, 0] if x["reversed"] else [0, 1, 2, 3]) for x in qs)
      and [x["code"] for x in qs if not x["reversed"]] == ["EPDS_Q1", "EPDS_Q2", "EPDS_Q4"],
      "EPDS: first printed answer scores 0 on items 1, 2, 4 and 3 on the reversed items")
top = {x["code"]: x["options"][0]["score"] for x in qs}
s, b = call("POST", f"/api/v1/patients/{neema['id']}/epds", {"answers": top | {"EPDS_Q10": 0}})
check(s == 200 and b["score"] == 18 and b["band"] == "high", f"ticking the first answer everywhere (Q10 'Never') scores 18 → high ({b.get('score')})")

# 10. child play stickers: one per idea per day, consent enforced
act = c["plan"]["activities"][0]["code"]
s, k1 = call("POST", f"/api/v1/children/{kid}/play", {"code": act})
s2, k2 = call("POST", f"/api/v1/children/{kid}/play", {"code": act})
check(s == 200 and k1["play"]["total"] == 1 and k2["play"]["total"] == 1 and act in k2["play"]["today"], "'We did it today' gives one sticker per idea per day")
s, _ = call("POST", f"/api/v1/children/{kid}/play", {"code": "NOPE"})
check(s == 400, "unknown play idea rejected")

# 11. module 3b: M-CHAT-R (official items; 2, 5, 12 risk on YES), age 16-30 months, high → referral
s, q = call("GET", "/api/v1/mchat/questions")
check(s == 200 and len(q["questions"]) == 20 and [x["n"] for x in q["questions"] if x["riskIfYes"]] == [2, 5, 12], "M-CHAT-R: 20 items, 2/5/12 reversed")
typical = {x["code"]: ("no" if x["riskIfYes"] else "yes") for x in q["questions"]}
s, _ = call("POST", f"/api/v1/children/{kid}/mchat", {"answers": typical})
check(s == 422, "M-CHAT-R refused for a 6-month-old")
s, b = call("POST", "/api/v1/postnatal-entry", {"name": "Mariam Hamisi", "age": 28, "village": "Kibaha", "consent": {"care": True},
                                                "birth": {"outcome": "live_birth", "date": (date.today() - timedelta(days=670)).isoformat(),
                                                          "place": "facility", "babyName": "Imani", "babySex": "female", "gestationAtBirthWeeks": 39}})
tod = b["children"][0]["id"]
call("POST", f"/api/v1/persons/{tod}/consent", {"module": "child_dev", "care": True})
s, r = call("POST", f"/api/v1/children/{tod}/mchat", {"answers": typical})
check(s == 200 and r["score"] == 0 and r["band"] == "low" and not r["child"]["mchat"][0]["referral"], "typical answers → 0, low, no referral")
flip = lambda v: "yes" if v == "no" else "no"
s, r = call("POST", f"/api/v1/children/{tod}/mchat", {"answers": typical | {c: flip(typical[c]) for c in ["MCHAT_Q1", "MCHAT_Q2", "MCHAT_Q7"]}})
check(r["score"] == 3 and r["band"] == "medium" and r["riskItems"] == [1, 2, 7], "3 at-risk answers → medium (Follow-Up)")
s, r = call("POST", f"/api/v1/children/{tod}/mchat", {"answers": {c: flip(v) for c, v in typical.items()}})
check(r["score"] == 20 and r["band"] == "high" and r["child"]["mchat"][0]["referral"], "all at-risk → 20, high, referral")
s, _ = call("POST", f"/api/v1/children/{tod}/mchat", {"answers": {"MCHAT_Q1": "yes"}})
check(s == 422, "incomplete M-CHAT-R rejected")

# 11b. term toddler: the ordinary rule (a not-yet on the current age band only gets activities)
s, t = call("GET", f"/api/v1/children/{tod}")
check(not t["newborn"]["watchClosely"] and not t["newborn"]["recorded"], "term baby with no birth record → not watch closely")
s, g = call("POST", f"/api/v1/children/{tod}/milestones", {"answers": {m["code"]: "yes" for m in t["plan"]["previous"]}
                                                          | {t["plan"]["current"][0]["code"]: "not_yet"}})
check(s == 200 and not g["advise_contact_chw"], "not-yet on current age only → activities, no CHW message")

# 11c. module 3a: newborn birth record (Apgar, golden minute, birth weight). Rules, never a diagnosis.
s, q = call("GET", "/api/v1/newborn/questions")
check(s == 200 and [x["key"] for x in q["signs"]] == ["appearance", "pulse", "grimace", "activity", "respiration"]
      and all([o["score"] for o in x["options"]] == [0, 1, 2] for x in q["signs"]), "Apgar: 5 signs, each 0/1/2")
born_nb = (date.today() - timedelta(days=3)).isoformat()
parts5 = {"appearance": 1, "pulse": 2, "grimace": 1, "activity": 1, "respiration": 1}
s, b = call("POST", "/api/v1/postnatal-entry", {"name": "Rehema Juma", "age": 22, "village": "Kibaha", "consent": {"care": True},
                                                "birth": {"outcome": "live_birth", "date": born_nb, "place": "home", "babySex": "male",
                                                          "gestationAtBirthWeeks": 39,
                                                          "newborn": {"apgar1": 3, "apgar5": parts5, "breathingHelp": "bag_mask",
                                                                      "birthWeightGrams": 3100, "source": "birth_attendant"}}})
check(s == 200, "birth recorded with Apgar parts + golden-minute help")
nbk = b["children"][0]["id"]
s, n = call("GET", f"/api/v1/children/{nbk}")
nb = n["newborn"]
check(nb["recorded"] and nb["apgar1"] == 3 and nb["apgar5"] == 6 and nb["apgar5Parts"] == parts5
      and nb["apgar1Band"] == "low" and nb["apgar5Band"] == "moderate", "Apgar totals from parts: 1 min 3 (low), 5 min 6 (moderate)")
check(nb["watchClosely"] and {r["code"] for r in nb["reasons"]} == {"APGAR5_LOW", "RESUSCITATED"} and nb["clinicCheck"],
      "low 5-min Apgar + bag-mask at a home birth → watch closely + clinic check")
check("score" not in nb and "band" not in nb and "diagnos" in nb["messageEn"], "newborn summary: no score/band, says it is not a diagnosis")
s, b = call("POST", f"/api/v1/patients/{b['id']}/birth", {"outcome": "live_birth", "date": born_nb, "newborn": {"apgar5": 11}})
check(s == 422, "Apgar above 10 rejected")
s, b = call("POST", "/api/v1/postnatal-entry", {"name": "Bad Apgar", "age": 22, "consent": {"care": True},
                                                "birth": {"outcome": "live_birth", "date": born_nb,
                                                          "newborn": {"apgar5": {"appearance": 3, "pulse": 2, "grimace": 1, "activity": 1, "respiration": 1}}}})
check(s == 422, "Apgar sign scored 3 rejected (and nothing saved)")
s, _ = call("POST", f"/api/v1/children/{tod}/newborn", {"apgar1": 8, "apgar5": 9, "breathingHelp": "none", "birthWeightGrams": 3300,
                                                         "source": "clinic_card"})
s, t = call("GET", f"/api/v1/children/{tod}")
check(s == 200 and t["newborn"]["apgar5"] == 9 and t["newborn"]["apgar5Band"] == "reassuring" and not t["newborn"]["watchClosely"]
      and t["newborn"]["source"] == "clinic_card", "Apgar added later from the clinic card: 9 → reassuring, no flag")
s, t = call("POST", f"/api/v1/children/{tod}/newborn", {"birthWeightGrams": 2100})
check(s == 200 and [r["code"] for r in t["newborn"]["reasons"]] == ["LOW_BIRTH_WEIGHT"] and not t["newborn"]["clinicCheck"],
      "correction: latest record wins; low birth weight alone → watch closely, no clinic check")
s, _ = call("POST", f"/api/v1/children/{nbk}/newborn", {"apgar5": 8})
check(s == 403, "adding a newborn record later needs child consent")

# 12. module 3c: play tasks are stored for the CHW, never scored or referred
s, k = call("POST", f"/api/v1/children/{tod}/tasks", {"task": "memory", "accuracy": 33, "seconds": 40, "assistance": "Verbal Prompt",
                                                      "caution": True, "note": "Remembered 2/6."})
check(s == 200 and k["tasks"][0]["accuracy"] == 33 and k["tasks"][0]["caution"] and "band" not in k["tasks"][0], "play task saved, no score or flag")
s, _ = call("POST", f"/api/v1/children/{tod}/tasks", {"task": "nope", "accuracy": 50, "seconds": 5, "assistance": "Independent"})
check(s in (400, 422), "unknown play task rejected")

s, info = call("GET", "/api/v1/status")
check(info["appRamMb"] > 0, f"status: app RAM {info['appRamMb']} MB, model load {info['modelLoadMs']} ms")
call("POST", "/api/v1/auth/logout")
s, _ = call("GET", "/api/v1/patients")
check(s == 401, "after sign-out the session no longer works")
print("ALL PASSED")
