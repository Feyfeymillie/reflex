"""RefleX hub: JSON API + the team's React frontend (pre-built static files), served by the Raspberry Pi
over its own Wi-Fi. No internet and no Node on the Pi.

Run:  uvicorn app.main:app --host 0.0.0.0 --port 8000
"""
import json
import os
import time
from datetime import date
from pathlib import Path

import psutil
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse

from . import child, db, epds, mchat, pregnancy as preg

HERE = Path(__file__).resolve().parent
WEB = Path(os.environ.get("REFLEX_WEB", HERE / "web"))
STARTED = time.time()
CONSENT_TEXT_VERSION = "sw-care-v0.1"
MODULES = ("pregnancy", "postnatal_mh", "child_dev")

app = FastAPI(title="RefleX hub", docs_url=None, redoc_url=None)
db.init()
MODEL = preg.Model()


class ApiError(Exception):
    def __init__(self, status, errors):
        self.status, self.errors = status, errors if isinstance(errors, list) else [errors]


@app.exception_handler(ApiError)
async def api_error(request, exc):
    return JSONResponse({"errors": exc.errors}, status_code=exc.status)


@app.exception_handler(db.ConsentMissing)
async def consent_missing(request, exc):
    return JSONResponse({"errors": [f"Hakuna ridhaa kwa moduli hii. / No consent recorded for {exc}."],
                         "consent_required": str(exc)}, status_code=403)


# ---------------- helpers ----------------

def age_years(dob):
    if not dob:
        return None
    b, t = date.fromisoformat(dob), date.today()
    return t.year - b.year - ((t.month, t.day) < (b.month, b.day))


def _int(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _iso(d):
    """Accept '2026-10-05' or a full ISO timestamp from the browser; reject the future."""
    if not d:
        return db.now()
    try:
        day = date.fromisoformat(str(d)[:10])
    except ValueError:
        raise ApiError(422, "Tarehe si sahihi. / Invalid date.")
    if day > date.today():
        raise ApiError(422, "Tarehe haiwezi kuwa ya baadaye. / Date can't be in the future.")
    return str(d) if len(str(d)) > 10 else day.isoformat() + "T12:00:00+00:00"


def _person(con, pid, role=None):
    p = db.one(con, "SELECT p.*, h.village, h.ward_code FROM person p JOIN household h USING(household_id) WHERE person_id=?", pid)
    if p is None or (role and p["role"] != role):
        raise HTTPException(404)
    return p


def _record_consent(con, subject, given_by, module, purposes):
    ts = db.now()
    for purpose in purposes:
        con.execute("INSERT INTO consent VALUES (?,?,?,?,?,?,?,?,?)",
                    (db.new_id(), subject, given_by, module, purpose, "granted",
                     "verbal_chw_witnessed", CONSENT_TEXT_VERSION, ts))


def _consent_purposes(c):
    c = c or {}
    if not c.get("care"):
        return None
    return ["care"] + [p for p in ("aggregate_reporting", "research") if c.get(p)]


def _new_mother(con, name, age, village, ward, phone, phone_owner, dob=None):
    name = (name or "").strip()
    errors = []
    if len(name) < 2:
        errors.append("Andika jina la mama. / Enter the mother's name.")
    if age is None or not 10 <= age <= 55:
        errors.append("Umri lazima uwe kati ya miaka 10 na 55. / Age must be between 10 and 55.")
    if errors:
        raise ApiError(422, errors)
    estimated = 1
    if dob:
        try:
            date.fromisoformat(dob)
            estimated = 0
        except ValueError:
            dob = None
    if not dob:
        dob = date(date.today().year - age, 7, 1).isoformat()
    hh, pid, ts = db.new_id(), db.new_id(), db.now()
    con.execute("INSERT INTO household (household_id, village, ward_code, hub_id, created_at) VALUES (?,?,?,?,?)",
                (hh, (village or "").strip() or None, (ward or "").strip() or None, db.HUB_ID, ts))
    con.execute("""INSERT INTO person (person_id, household_id, role, full_name, phone_msisdn, phone_owner,
                   date_of_birth, dob_estimated, sex, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (pid, hh, "mother", name, (phone or "").strip() or None, phone_owner if phone_owner in
                 ("self", "husband", "relative", "neighbour", "none") else None, dob, estimated, "female", ts))
    return pid


def _current_pregnancy(con, pid):
    return db.one(con, "SELECT * FROM pregnancy WHERE mother_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1", pid)


def _add_checkin(con, pid, checkin):
    """Score one ANC check-in and write encounter + observations + assessment. Caller holds the transaction."""
    db.require_consent(con, pid, "pregnancy")
    p = _person(con, pid)
    pr = _current_pregnancy(con, pid)
    if pr is None or pr["outcome"] != "ongoing":
        raise ApiError(409, "Hakuna mimba inayoendelea. / No ongoing pregnancy for this mother.")
    rch4 = json.loads(pr["rch4_json"] or "{}")
    n_prev = db.one(con, "SELECT COUNT(*) n FROM encounter WHERE pregnancy_id=? AND module='pregnancy'", pr["pregnancy_id"])["n"]
    clean, errors = preg.from_frontend(age_years(p["date_of_birth"]), pr["gestation_weeks_at_reg"], rch4, checkin, n_prev + 1)
    if errors:
        raise ApiError(422, errors)
    result = preg.assess(MODEL, clean, age_years(p["date_of_birth"]))
    prev = db.one(con, """SELECT score FROM assessment WHERE pregnancy_id=? AND module='pregnancy'
                          ORDER BY created_at DESC, rowid DESC LIMIT 1""", pr["pregnancy_id"])
    analysis = preg.frontend_analysis(result, clean, None if prev is None else max(1, min(99, round(prev["score"] * 100))))

    when = _iso(checkin.get("date"))
    enc, aid, ts = db.new_id(), db.new_id(), db.now()
    con.execute("""INSERT INTO encounter (encounter_id, person_id, pregnancy_id, module, started_at, ended_at, completed)
                   VALUES (?,?,?,?,?,?,1)""", (enc, pid, pr["pregnancy_id"], "pregnancy", when, ts))
    obs = [(c, clean[c]) for c in preg.Q if clean.get(c) is not None] + [(c, 1) for c in clean["danger_signs"]]
    if len(checkin.get("ultrasound") or "") > 3_000_000:
        raise ApiError(413, "Picha ni kubwa mno (zaidi ya 2 MB). / Image too large (over 2 MB).")
    payload = {k: checkin.get(k) for k in ("date", "bloodPressure", "weight", "symptoms", "notes", "anc", "ultrasound")}
    payload["date"] = when
    obs.append(("ANC_CHECKIN_JSON", json.dumps(payload, ensure_ascii=False)))
    for code, val in obs:
        con.execute("INSERT INTO observation VALUES (?,?,?,?,?,?)", (db.new_id(), enc, code, str(val), "chw_measured", ts))
    con.execute("""INSERT INTO assessment (assessment_id, person_id, pregnancy_id, encounter_id, module, model_version,
                   score, band, top_factors, rule_override, override_reasons, computed_on, compute_ms, analysis_json, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (aid, pid, pr["pregnancy_id"], enc, "pregnancy", result["model_version"], result["score"], result["band"],
                 json.dumps(result["top_factors"], ensure_ascii=False), int(result["rule_override"]),
                 json.dumps(result["override_reasons"]), "server", result["compute_ms"],
                 json.dumps(analysis, ensure_ascii=False), ts))
    con.execute("UPDATE pregnancy SET anc_visits_count=?, version=version+1 WHERE pregnancy_id=?",
                (clean["PREG_ANC_VISITS"], pr["pregnancy_id"]))
    if result["band"] == "urgent":  # danger sign: the referral exists before anyone has to click
        _ensure_referral(con, aid, "urgent", ts)
    return aid


def _ensure_referral(con, aid, urgency, ts):
    if not db.one(con, "SELECT 1 FROM referral WHERE assessment_id=?", aid):
        con.execute("INSERT INTO referral (referral_id, assessment_id, urgency, status, status_updated_at) VALUES (?,?,?,?,?)",
                    (db.new_id(), aid, urgency, "created", ts))


def _review_of(con, aid):
    r = db.one(con, "SELECT * FROM review WHERE assessment_id=? ORDER BY reviewed_at DESC, rowid DESC LIMIT 1", aid)
    ref = db.one(con, "SELECT status, urgency FROM referral WHERE assessment_id=?", aid)
    return ({"decision": r["decision"], "finalBand": r["final_band"], "reason": r["reason"], "at": r["reviewed_at"]} if r else None,
            dict(ref) if ref else None)


def _patient_json(con, pid):
    p = _person(con, pid, "mother")
    pr = _current_pregnancy(con, pid)
    checkins = []
    for a in db.all_(con, """SELECT a.*, e.started_at FROM assessment a JOIN encounter e USING(encounter_id)
                             WHERE a.person_id=? AND a.module='pregnancy' ORDER BY e.started_at, a.rowid""", pid):
        raw = db.one(con, "SELECT value FROM observation WHERE encounter_id=? AND code='ANC_CHECKIN_JSON'", a["encounter_id"])
        c = json.loads(raw["value"]) if raw else {}
        review, ref = _review_of(con, a["assessment_id"])
        checkins.append({"id": a["encounter_id"], "assessmentId": a["assessment_id"], "date": a["started_at"],
                         "bloodPressure": c.get("bloodPressure") or "", "weight": c.get("weight") or 0,
                         "symptoms": c.get("symptoms") or "", "notes": c.get("notes") or "", "anc": c.get("anc"),
                         "ultrasound": c.get("ultrasound") or None,
                         "analysis": json.loads(a["analysis_json"]), "review": review, "referral": ref})
    postnatal = []
    for a in db.all_(con, "SELECT * FROM assessment WHERE person_id=? AND module='postnatal_mh' ORDER BY created_at, rowid", pid):
        review, ref = _review_of(con, a["assessment_id"])
        postnatal.append({"assessmentId": a["assessment_id"], "date": a["created_at"], "score": a["score"],
                          "band": a["band"], "selfHarm": bool(a["rule_override"]), "review": review, "referral": ref,
                          **json.loads(a["analysis_json"] or "{}")})
    kids = [{"id": k["person_id"], "name": k["full_name"], "sex": k["sex"], "dob": k["date_of_birth"],
             "gestationAtBirthWeeks": k["gestation_at_birth_weeks"]}
            for k in db.all_(con, "SELECT * FROM person WHERE mother_person_id=? ORDER BY date_of_birth", pid)]
    consent = {m: db.has_care_consent(con, pid, m) for m in MODULES}
    return {
        "id": pid, "name": p["full_name"], "age": age_years(p["date_of_birth"]),
        "gestationWeeks": (pr["gestation_weeks_at_reg"] if pr else None) or 0,
        "complications": (pr["complications_text"] if pr else "") or "",
        "history": (pr["history_text"] if pr else "") or "",
        "rch4": json.loads(pr["rch4_json"] or "{}") if pr else {},
        "createdAt": checkins[0]["date"] if checkins else p["created_at"],
        "village": p["village"], "phoneOwner": p["phone_owner"],
        "ultrasound": next((c["ultrasound"] for c in reversed(checkins) if c["ultrasound"]), None),
        "checkIns": checkins, "consent": consent,
        "pregnancy": {"id": pr["pregnancy_id"], "outcome": pr["outcome"], "deliveryDate": pr["delivery_date"],
                      "deliveryPlace": pr["delivery_place"]} if pr else None,
        "children": kids, "postnatal": postnatal,
    }


# ---------------- pregnancy ----------------

@app.get("/api/v1/patients")
def list_patients():
    con = db.connect()
    ids = [r["person_id"] for r in db.all_(con, "SELECT person_id FROM person WHERE role='mother' ORDER BY created_at DESC, rowid DESC")]
    out = [_patient_json(con, i) for i in ids]
    con.close()
    return out


@app.get("/api/v1/patients/{pid}")
def get_patient(pid: str):
    con = db.connect()
    try:
        return _patient_json(con, pid)
    finally:
        con.close()


@app.post("/api/v1/patients")
async def register(request: Request):
    """Body: {name, age, gestationWeeks, complications, history, rch4, consent:{care,aggregate_reporting,research}, checkIn}"""
    b = await request.json()
    purposes = _consent_purposes(b.get("consent"))
    if not purposes:
        raise ApiError(403, "Bila ridhaa ya huduma hatuhifadhi taarifa. / Without care consent nothing is stored.")
    rch4 = b.get("rch4") or {}
    ga = _int(b.get("gestationWeeks"))
    con = db.connect()
    try:
        con.execute("BEGIN")
        pid = _new_mother(con, b.get("name"), _int(b.get("age")), rch4.get("village"), rch4.get("ward"),
                          rch4.get("phone"), b.get("phoneOwner"), rch4.get("dateOfBirth") or None)
        _record_consent(con, pid, pid, "pregnancy", purposes)
        con.execute("""INSERT INTO pregnancy (pregnancy_id, mother_id, lmp_date, edd, gravida, parity, gestation_weeks_at_reg,
                       rch4_json, complications_text, history_text, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                    (db.new_id(), pid, rch4.get("lmp") or None, rch4.get("edd") or None, _int(rch4.get("gravida")),
                     _int(rch4.get("para")), ga, json.dumps(rch4, ensure_ascii=False), b.get("complications") or "",
                     b.get("history") or "", db.now()))
        if b.get("checkIn"):
            _add_checkin(con, pid, b["checkIn"])
        con.execute("COMMIT")
        return _patient_json(con, pid)
    except Exception:
        con.execute("ROLLBACK")
        raise
    finally:
        con.close()


@app.post("/api/v1/patients/{pid}/checkins")
async def add_checkin(pid: str, request: Request):
    b = await request.json()
    con = db.connect()
    try:
        con.execute("BEGIN")
        _add_checkin(con, pid, b)
        con.execute("COMMIT")
        return _patient_json(con, pid)
    except Exception:
        con.execute("ROLLBACK")
        raise
    finally:
        con.close()


@app.post("/api/v1/assessments/{aid}/review")
async def review(aid: str, request: Request):
    """Human in control: the CHW accepts the flag or overrides it with a reason."""
    b = await request.json()
    con = db.connect()
    try:
        a = db.one(con, "SELECT * FROM assessment WHERE assessment_id=?", aid)
        if a is None:
            raise HTTPException(404)
        decision = "override" if b.get("decision") == "override" else "accept"
        final = a["band"]
        reason = (b.get("reason") or "").strip()[:500] or None
        if decision == "override":
            if b.get("finalBand") not in preg.BAND_ORDER:
                raise ApiError(422, "Chagua kiwango sahihi. / Choose the correct level.")
            if not reason:
                raise ApiError(422, "Andika sababu ya kubadilisha. / Write a reason for the override.")
            final = b["finalBand"]
        ts = db.now()
        con.execute("BEGIN")
        con.execute("INSERT INTO review VALUES (?,?,?,?,?,?)", (db.new_id(), aid, decision, final, reason, ts))
        if final in ("high", "urgent"):
            _ensure_referral(con, aid, final, ts)
        con.execute("COMMIT")
        return _patient_json(con, a["person_id"])
    finally:
        con.close()


@app.post("/api/v1/referrals/{aid}/status")
async def referral_status(aid: str, request: Request):
    b = await request.json()
    if b.get("status") not in ("created", "sent", "acknowledged", "attended", "lost"):
        raise ApiError(422, "Hali si sahihi. / Invalid status.")
    con = db.connect()
    con.execute("UPDATE referral SET status=?, status_updated_at=? WHERE assessment_id=?", (b["status"], db.now(), aid))
    con.close()
    return {"ok": True}


# ---------------- consent (per module) ----------------

@app.post("/api/v1/persons/{pid}/consent")
async def consent(pid: str, request: Request):
    """Body: {module, care, aggregate_reporting, research}. For a child, the mother gives consent."""
    b = await request.json()
    if b.get("module") not in MODULES:
        raise ApiError(422, "Moduli si sahihi. / Unknown module.")
    purposes = _consent_purposes(b)
    if not purposes:
        raise ApiError(403, "Bila ridhaa ya huduma hatuhifadhi taarifa. / Without care consent nothing is stored.")
    con = db.connect()
    p = _person(con, pid)
    given_by = p["mother_person_id"] or pid
    con.execute("BEGIN")
    _record_consent(con, pid, given_by, b["module"], purposes)
    con.execute("COMMIT")
    con.close()
    return {"ok": True}


# ---------------- module 2: birth + postpartum (EPDS) ----------------

def _record_birth(con, pid, b):
    pr = _current_pregnancy(con, pid)
    outcome = b.get("outcome")
    if outcome not in ("live_birth", "stillbirth", "miscarriage"):
        raise ApiError(422, "Chagua matokeo ya mimba. / Choose the pregnancy outcome.")
    when = _iso(b.get("date"))[:10]
    ga = _int(b.get("gestationAtBirthWeeks"))
    if ga is not None and not 20 <= ga <= 44:
        raise ApiError(422, "Wiki za mimba wakati wa kujifungua: 20 hadi 44. / Weeks at birth must be 20 to 44.")
    place = b.get("place") if b.get("place") in ("facility", "home", "en_route") else None
    ts = db.now()
    if pr is None or pr["outcome"] != "ongoing":  # mother entering at module 2: retrospective pregnancy row
        preg_id = db.new_id()
        con.execute("INSERT INTO pregnancy (pregnancy_id, mother_id, outcome, created_at) VALUES (?,?,?,?)",
                    (preg_id, pid, "ongoing", ts))
    else:
        preg_id = pr["pregnancy_id"]
    con.execute("UPDATE pregnancy SET outcome=?, delivery_date=?, delivery_place=?, version=version+1 WHERE pregnancy_id=?",
                (outcome, when, place, preg_id))
    kid = None
    if outcome == "live_birth":
        m = _person(con, pid)
        kid = db.new_id()
        name = (b.get("babyName") or "").strip() or f"Mtoto wa {m['full_name']}"
        con.execute("""INSERT INTO person (person_id, household_id, role, full_name, date_of_birth, dob_estimated, sex,
                       mother_person_id, gestation_at_birth_weeks, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)""",
                    (kid, m["household_id"], "child", name, when, 0,
                     b.get("babySex") if b.get("babySex") in ("female", "male") else None, pid, ga, ts))
    return kid


@app.post("/api/v1/patients/{pid}/birth")
async def birth(pid: str, request: Request):
    b = await request.json()
    con = db.connect()
    try:
        _person(con, pid, "mother")
        con.execute("BEGIN")
        _record_birth(con, pid, b)
        con.execute("COMMIT")
        return _patient_json(con, pid)
    except Exception:
        con.execute("ROLLBACK")
        raise
    finally:
        con.close()


@app.post("/api/v1/postnatal-entry")
async def postnatal_entry(request: Request):
    """A mother first met after delivery: register, consent for postnatal care, record the birth, in one step."""
    b = await request.json()
    purposes = _consent_purposes(b.get("consent"))
    if not purposes:
        raise ApiError(403, "Bila ridhaa ya huduma hatuhifadhi taarifa. / Without care consent nothing is stored.")
    con = db.connect()
    try:
        con.execute("BEGIN")
        pid = _new_mother(con, b.get("name"), _int(b.get("age")), b.get("village"), None, b.get("phone"), b.get("phoneOwner"))
        _record_consent(con, pid, pid, "postnatal_mh", purposes)
        _record_birth(con, pid, b.get("birth") or {})
        con.execute("COMMIT")
        return _patient_json(con, pid)
    except Exception:
        con.execute("ROLLBACK")
        raise
    finally:
        con.close()


@app.get("/api/v1/epds/questions")
def epds_questions():
    return {"questions": epds.questions(), "possible": epds.POSSIBLE, "probable": epds.PROBABLE}


@app.post("/api/v1/patients/{pid}/epds")
async def epds_screen(pid: str, request: Request):
    b = await request.json()
    clean, errors = epds.validate(b.get("answers") or {})
    if errors:
        raise ApiError(422, sorted(set(errors.values())))
    con = db.connect()
    try:
        db.require_consent(con, pid, "postnatal_mh")
        pr = _current_pregnancy(con, pid)
        r = epds.score(clean)
        # cross-module read: what the pregnancy module knew about her
        last_preg = db.one(con, """SELECT COALESCE(rv.final_band, a.band) band FROM assessment a
                                   LEFT JOIN review rv ON rv.assessment_id=a.assessment_id
                                   WHERE a.person_id=? AND a.module='pregnancy' ORDER BY a.created_at DESC, a.rowid DESC LIMIT 1""", pid)
        context = {"pregnancyBand": last_preg["band"] if last_preg else None,
                   "outcome": pr["outcome"] if pr else None, "deliveryPlace": pr["delivery_place"] if pr else None}
        analysis = {"actionSw": r["action_sw"], "actionEn": r["action_en"], "context": context,
                    "possibleCutoff": epds.POSSIBLE, "probableCutoff": epds.PROBABLE}
        enc, aid, ts = db.new_id(), db.new_id(), db.now()
        con.execute("BEGIN")
        con.execute("""INSERT INTO encounter (encounter_id, person_id, pregnancy_id, module, started_at, ended_at, completed)
                       VALUES (?,?,?,?,?,?,1)""", (enc, pid, pr["pregnancy_id"] if pr else None, "postnatal_mh", ts, ts))
        for code, v in clean.items():
            con.execute("INSERT INTO observation VALUES (?,?,?,?,?,?)", (db.new_id(), enc, code, str(v), "self_report", ts))
        con.execute("""INSERT INTO assessment (assessment_id, person_id, pregnancy_id, encounter_id, module, model_version, score,
                       band, top_factors, rule_override, override_reasons, computed_on, analysis_json, created_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (aid, pid, pr["pregnancy_id"] if pr else None, enc, "postnatal_mh", r["model_version"], r["score"],
                     r["band"], "[]", int(r["self_harm"]), json.dumps(["EPDS_Q10"] if r["self_harm"] else []),
                     "server", json.dumps(analysis, ensure_ascii=False), ts))
        if r["self_harm"]:
            _ensure_referral(con, aid, "urgent", ts)  # same-day CHW alert regardless of total
        con.execute("COMMIT")
        return {"assessmentId": aid, **r, "context": context, "patient": _patient_json(con, pid)}
    finally:
        con.close()


# ---------------- module 3: child guidance (no scores) ----------------

def _child_json(con, cid):
    k = _person(con, cid, "child")
    months, corrected = child.age_months(k["date_of_birth"], k["gestation_at_birth_weeks"])
    last = {}
    for r in db.all_(con, """SELECT o.code, o.value FROM observation o JOIN encounter e USING(encounter_id)
                             WHERE e.person_id=? AND e.module='child_dev' ORDER BY o.rowid""", cid):
        last[r["code"]] = r["value"]
    events = db.all_(con, "SELECT * FROM guidance_event WHERE child_person_id=? ORDER BY shown_at DESC, rowid DESC LIMIT 20", cid)
    mother = _person(con, k["mother_person_id"]) if k["mother_person_id"] else None
    return {"id": cid, "name": k["full_name"], "sex": k["sex"], "dob": k["date_of_birth"],
            "gestationAtBirthWeeks": k["gestation_at_birth_weeks"], "ageMonths": months, "corrected": corrected,
            "mother": {"id": mother["person_id"], "name": mother["full_name"]} if mother else None,
            "consent": db.has_care_consent(con, cid, "child_dev"),
            "plan": child.plan(months), "lastAnswers": last, "play": _play_json(con, cid),
            "mchat": _mchat_list(con, cid), "tasks": _task_list(con, cid),
            "mchatAge": {"min": mchat.AGE_MIN, "max": mchat.AGE_MAX},
            "history": [{"code": e["content_code"], "trigger": e["trigger"], "adviseChw": bool(e["advised_contact_chw"]),
                         "at": e["shown_at"]} for e in events]}


def _mchat_list(con, cid):
    out = []
    for a in db.all_(con, """SELECT * FROM assessment WHERE person_id=? AND module='child_mchat'
                             ORDER BY created_at DESC, rowid DESC""", cid):
        review, referral = _review_of(con, a["assessment_id"])
        an = json.loads(a["analysis_json"] or "{}")
        out.append({"assessmentId": a["assessment_id"], "date": a["created_at"], "score": int(a["score"]), "band": a["band"],
                    "ageMonths": an.get("ageMonths"), "riskItems": an.get("riskItems", []),
                    "actionSw": an.get("actionSw"), "actionEn": an.get("actionEn"), "review": review, "referral": referral})
    return out


def _task_list(con, cid):
    out = []
    for e in db.all_(con, """SELECT encounter_id, started_at FROM encounter WHERE person_id=? AND module='child_play'
                             ORDER BY started_at DESC, rowid DESC LIMIT 20""", cid):
        obs = {r["code"]: r["value"] for r in db.all_(con, "SELECT code, value FROM observation WHERE encounter_id=? ORDER BY rowid", e["encounter_id"])}
        out.append({"date": e["started_at"], "task": obs.get("PLAY_TASK"), "accuracy": _int(obs.get("PLAY_ACCURACY")),
                    "seconds": _int(obs.get("PLAY_SECONDS")), "assistance": obs.get("PLAY_ASSISTANCE"),
                    "caution": obs.get("PLAY_CAUTION") == "1", "note": obs.get("PLAY_NOTE")})
    return out


def _play_json(con, cid):
    today = _local_today()
    rows = db.all_(con, "SELECT content_code, done_on FROM play_log WHERE child_person_id=?", cid)
    by_code = {}
    for r in rows:
        by_code[r["content_code"]] = by_code.get(r["content_code"], 0) + 1
    week = {r["done_on"] for r in rows if r["done_on"] >= _days_ago(6)}
    return {"total": len(rows), "byCode": by_code, "today": sorted(r["content_code"] for r in rows if r["done_on"] == today),
            "daysThisWeek": len(week)}


def _local_today():
    # The hub's local date (set the Pi to Africa/Dar_es_Salaam), so "today" flips at local midnight, not UTC.
    import datetime as _dt
    return _dt.date.today().isoformat()


def _days_ago(n):
    import datetime as _dt
    return (_dt.date.today() - _dt.timedelta(days=n)).isoformat()


@app.post("/api/v1/children/{cid}/play")
async def play_done(cid: str, request: Request):
    """Body: {code}. Parent marks a play idea as done today. Feeds the sticker chart; never scored."""
    b = await request.json()
    code = b.get("code")
    if code not in child.ACTIVITY_CODES:
        raise ApiError(400, ["Mchezo haujulikani. / Unknown activity."])
    con = db.connect()
    try:
        db.require_consent(con, cid, "child_dev")
        _person(con, cid, "child")
        ts = db.now()
        con.execute("INSERT OR IGNORE INTO play_log VALUES (?,?,?,?,?)", (db.new_id(), cid, code, _local_today(), ts))
        return _child_json(con, cid)
    finally:
        con.close()


@app.get("/api/v1/children/{cid}")
def get_child(cid: str):
    con = db.connect()
    try:
        return _child_json(con, cid)
    finally:
        con.close()


@app.post("/api/v1/children/{cid}/milestones")
async def milestones(cid: str, request: Request):
    """Body: {answers: {code: 'yes'|'not_yet'}, lostSkill: bool}. Writes observations + guidance events, never an assessment."""
    b = await request.json()
    answers = {c: v for c, v in (b.get("answers") or {}).items() if c in child.ALL_CODES and v in ("yes", "not_yet")}
    con = db.connect()
    try:
        db.require_consent(con, cid, "child_dev")
        k = _person(con, cid, "child")
        months, _ = child.age_months(k["date_of_birth"], k["gestation_at_birth_weeks"])
        g = child.guidance(months, answers, bool(b.get("lostSkill")))
        enc, ts = db.new_id(), db.now()
        con.execute("BEGIN")
        con.execute("""INSERT INTO encounter (encounter_id, person_id, module, started_at, ended_at, completed)
                       VALUES (?,?,?,?,?,1)""", (enc, cid, "child_dev", ts, ts))
        for code, v in answers.items():
            con.execute("INSERT INTO observation VALUES (?,?,?,?,?,?)", (db.new_id(), enc, code, v, "parent_report", ts))
        if b.get("lostSkill"):
            con.execute("INSERT INTO observation VALUES (?,?,?,?,?,?)", (db.new_id(), enc, "DEV_LOST_SKILL", "1", "parent_report", ts))
        trigger = "milestone_not_yet" if (g["overdue"] or g["practising"]) else "age_schedule"
        for act in child.plan(months)["activities"]:
            con.execute("INSERT INTO guidance_event VALUES (?,?,?,?,?,?,?)",
                        (db.new_id(), cid, enc, act["code"], trigger, int(g["advise_contact_chw"]), ts))
        if g["advise_contact_chw"]:
            con.execute("INSERT INTO guidance_event VALUES (?,?,?,?,?,?,?)",
                        (db.new_id(), cid, enc, "MSG_TALK_TO_CHW", "milestone_not_yet", 1, ts))
        con.execute("COMMIT")
        return {**g, "child": _child_json(con, cid)}
    finally:
        con.close()


@app.get("/api/v1/mchat/questions")
def mchat_questions():
    return {"questions": mchat.questions(), "ageMin": mchat.AGE_MIN, "ageMax": mchat.AGE_MAX}


@app.post("/api/v1/children/{cid}/mchat")
async def mchat_screen(cid: str, request: Request):
    """Body: {answers: {MCHAT_Qn: 'yes'|'no'}}. All 20 required. High band creates a referral; the CHW can review it."""
    b = await request.json()
    clean, missing = mchat.validate(b.get("answers") or {})
    if missing:
        raise ApiError(422, ["Jibu maswali yote 20. / Answer all 20 questions."])
    con = db.connect()
    try:
        db.require_consent(con, cid, "child_dev")
        k = _person(con, cid, "child")
        months, _ = child.age_months(k["date_of_birth"], k["gestation_at_birth_weeks"])
        if months is None or not mchat.AGE_MIN <= months <= mchat.AGE_MAX:
            raise ApiError(422, [f"M-CHAT-R ni kwa watoto wa miezi {mchat.AGE_MIN}-{mchat.AGE_MAX}. / "
                                 f"M-CHAT-R is for children aged {mchat.AGE_MIN}-{mchat.AGE_MAX} months."])
        r = mchat.score(clean)
        analysis = {"ageMonths": months, "riskItems": r["riskItems"], "actionSw": r["action_sw"], "actionEn": r["action_en"]}
        enc, aid, ts = db.new_id(), db.new_id(), db.now()
        con.execute("BEGIN")
        con.execute("""INSERT INTO encounter (encounter_id, person_id, module, started_at, ended_at, completed)
                       VALUES (?,?,?,?,?,1)""", (enc, cid, "child_mchat", ts, ts))
        for code, v in clean.items():
            con.execute("INSERT INTO observation VALUES (?,?,?,?,?,?)", (db.new_id(), enc, code, v, "parent_report", ts))
        con.execute("""INSERT INTO assessment (assessment_id, person_id, encounter_id, module, model_version, score, band,
                       top_factors, rule_override, override_reasons, computed_on, analysis_json, created_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (aid, cid, enc, "child_mchat", r["model_version"], r["score"], r["band"], json.dumps(r["riskItems"]),
                     0, "[]", "server", json.dumps(analysis, ensure_ascii=False), ts))
        if r["band"] == "high":
            _ensure_referral(con, aid, "high", ts)
        con.execute("COMMIT")
        return {"assessmentId": aid, **r, "child": _child_json(con, cid)}
    except Exception:
        if con.in_transaction:
            con.execute("ROLLBACK")
        raise
    finally:
        con.close()


PLAY_TASKS = ("feature-match", "memory", "joint-attention", "target-pop", "play-observation")
ASSISTANCE = ("Independent", "Verbal Prompt", "Hand-over-Hand")


@app.post("/api/v1/children/{cid}/tasks")
async def play_task(cid: str, request: Request):
    """Body: {task, accuracy, seconds, assistance, caution, note}. Stored as observations for the CHW. Never scored or flagged."""
    b = await request.json()
    if b.get("task") not in PLAY_TASKS or b.get("assistance") not in ASSISTANCE:
        raise ApiError(422, ["Taarifa za mchezo si sahihi. / Invalid activity record."])
    acc, secs = _int(b.get("accuracy")), _int(b.get("seconds"))
    if acc is None or not 0 <= acc <= 100 or secs is None or not 0 <= secs <= 3600:
        raise ApiError(422, ["Taarifa za mchezo si sahihi. / Invalid activity record."])
    con = db.connect()
    try:
        db.require_consent(con, cid, "child_dev")
        _person(con, cid, "child")
        enc, ts = db.new_id(), db.now()
        con.execute("BEGIN")
        con.execute("""INSERT INTO encounter (encounter_id, person_id, module, started_at, ended_at, completed)
                       VALUES (?,?,?,?,?,1)""", (enc, cid, "child_play", ts, ts))
        for code, v in (("PLAY_TASK", b["task"]), ("PLAY_ACCURACY", acc), ("PLAY_SECONDS", secs),
                        ("PLAY_ASSISTANCE", b["assistance"]), ("PLAY_CAUTION", "1" if b.get("caution") else "0"),
                        ("PLAY_NOTE", (b.get("note") or "")[:300])):
            con.execute("INSERT INTO observation VALUES (?,?,?,?,?,?)", (db.new_id(), enc, code, str(v), "chw_measured", ts))
        con.execute("COMMIT")
        return _child_json(con, cid)
    finally:
        con.close()


# ---------------- device status (rubric 2b) ----------------

@app.get("/api/v1/status")
def status():
    proc, vm = psutil.Process(os.getpid()), psutil.virtual_memory()
    temp = None
    try:
        temp = int(Path("/sys/class/thermal/thermal_zone0/temp").read_text()) / 1000
    except OSError:
        pass
    con = db.connect()
    counts = {t: db.one(con, f"SELECT COUNT(*) n FROM {t}")["n"]
              for t in ("person", "encounter", "observation", "assessment", "referral", "guidance_event")}
    con.close()
    return {"appRamMb": round(proc.memory_info().rss / 1e6), "totalRamMb": round(vm.total / 1e6),
            "usedRamMb": round((vm.total - vm.available) / 1e6), "cpuTempC": temp,
            "uptimeMin": round((time.time() - STARTED) / 60, 1), "model": MODEL.meta,
            "modelLoadMs": round(MODEL.load_ms, 1), "counts": counts}


@app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "DELETE"])
def api_404(rest: str):
    raise HTTPException(404)


# ---------------- the React app (built on a laptop, served as static files) ----------------

@app.get("/{path:path}")
def spa(path: str):
    f = (WEB / path).resolve()
    if path and f.is_file() and WEB.resolve() in f.parents:
        headers = {"Cache-Control": "public, max-age=31536000, immutable"} if path.startswith("assets/") else None
        return FileResponse(f, headers=headers)
    index = WEB / "index.html"
    if not index.exists():
        return JSONResponse({"error": "frontend not built: run `npm run build` in frontend/"}, status_code=503)
    return FileResponse(index, headers={"Cache-Control": "no-cache"})
