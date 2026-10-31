"""The existing clinical workflows, exercised through a signed-in CHW, plus staff attribution, the consent-ordering
regression from the audit, and the database migration. Same scenarios as tests/smoke_test.py, but self-contained."""
import sqlite3
from datetime import date, timedelta

from app import db
from conftest import sql

CONSENT = {"care": True, "aggregate_reporting": True}
LOW = {"bloodPressure": "110/70", "weight": 60, "symptoms": "", "notes": "",
       "anc": {"gestationWeeks": "20", "dangerSigns": []}}


def register(c, name, age, rch4, checkin, consent=CONSENT):
    return c.post("/api/v1/patients", json={"name": name, "age": age, "rch4": rch4, "consent": consent, "checkIn": checkin,
                                            "gestationWeeks": (checkin.get("anc") or {}).get("gestationWeeks")})


def high_risk_patient(c):
    rch4 = {"gravida": "3", "para": "2", "priorPreeclampsia": "Yes", "priorStillbirth": "Yes", "village": "Kibaha", "phone": "0712345678"}
    ck = {"bloodPressure": "148/95", "weight": 70, "symptoms": "", "notes": "",
          "anc": {"gestationWeeks": "30", "visitNumber": "1", "dangerSigns": []}}
    r = register(c, "Neema Juma", 27, rch4, ck)
    assert r.status_code == 200, r.text
    return r.json()


def birth(c, pid, days_ago=200, weeks=34):
    r = c.post(f"/api/v1/patients/{pid}/birth", json={"outcome": "live_birth", "date": (date.today() - timedelta(days=days_ago)).isoformat(),
                                                    "place": "facility", "babyName": "Baraka", "babySex": "male", "gestationAtBirthWeeks": weeks})
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------- patients and consent

def test_register_and_retrieve_patient(chw):
    c, _ = chw
    p = high_risk_patient(c)
    assert c.get(f"/api/v1/patients/{p['id']}").json()["name"] == "Neema Juma"
    assert p["id"] in [x["id"] for x in c.get("/api/v1/patients").json()]
    assert p["consent"]["pregnancy"] is True


def test_registration_validation_and_no_consent_means_nothing_stored(chw):
    c, _ = chw
    assert register(c, "Mama Mdogo", 7, {}, {"bloodPressure": "120/80"}).status_code == 422
    assert register(c, "Neema Juma", 27, {}, {"bloodPressure": "400/95"}).status_code == 422
    assert register(c, "Neema Juma", 27, {}, {"bloodPressure": "120/80"}, consent={"care": False}).status_code == 403
    assert c.get("/api/v1/patients").json() == []


def test_epds_and_child_modules_still_need_their_own_consent(chw):
    c, _ = chw
    p = high_risk_patient(c)
    assert c.post(f"/api/v1/patients/{p['id']}/epds", json={"answers": {f"EPDS_Q{i}": 0 for i in range(1, 11)}}).status_code == 403
    kid = birth(c, p["id"])["children"][0]["id"]
    assert c.post(f"/api/v1/children/{kid}/milestones", json={"answers": {}}).status_code == 403
    assert c.post(f"/api/v1/children/{kid}/play", json={"code": "x"}).status_code in (400, 403)


# ---------------------------------------------------------------- pregnancy

def test_high_risk_profile_is_scored_with_reasons(chw):
    c, _ = chw
    a = high_risk_patient(c)["checkIns"][0]["analysis"]
    assert a["category"] == "High" and a["modelVersion"].startswith(("dhs", "synthetic"))


def test_danger_sign_forces_urgent_and_creates_referral(chw):
    c, _ = chw
    low = dict(LOW, anc={"gestationWeeks": "20", "dangerSigns": ["Vaginal bleeding"]})
    p = register(c, "Rehema Ally", 24, {"gravida": "1", "para": "0"}, low).json()
    ck = p["checkIns"][0]
    assert ck["analysis"]["band"] == "urgent" and ck["analysis"]["ruleOverride"] and ck["referral"]["status"] == "created"


def test_review_and_referral_status(chw):
    c, sid = chw
    p = high_risk_patient(c)
    p = c.post(f"/api/v1/patients/{p['id']}/checkins", json={"bloodPressure": "162/112", "weight": 72, "symptoms": "", "notes": "",
                                                            "anc": {"gestationWeeks": "32", "dangerSigns": []}}).json()
    assert len(p["checkIns"]) == 2 and "trend" in p["checkIns"][1]["analysis"]
    aid = p["checkIns"][0]["assessmentId"]
    assert c.post(f"/api/v1/assessments/{aid}/review", json={"decision": "override", "finalBand": "low"}).status_code == 422
    r = c.post(f"/api/v1/assessments/{aid}/review", json={"decision": "accept"})
    assert r.status_code == 200 and r.json()["checkIns"][0]["referral"]
    assert c.post(f"/api/v1/referrals/{aid}/status", json={"status": "sent"}).status_code == 200
    assert c.post(f"/api/v1/referrals/{aid}/status", json={"status": "bogus"}).status_code == 422
    assert sql("SELECT reviewed_by_staff_id FROM review")[0][0] == sid
    assert sql("SELECT status_updated_by_staff_id FROM referral WHERE assessment_id=?", aid)[0][0] == sid


# ---------------------------------------------------------------- postpartum / EPDS

def test_postnatal_flow_birth_epds_and_self_harm_referral(chw):
    c, _ = chw
    p = high_risk_patient(c)
    assert c.post(f"/api/v1/persons/{p['id']}/consent", json={"module": "postnatal_mh", "care": True}).status_code == 200
    assert len(birth(c, p["id"])["children"]) == 1
    nine = {f"EPDS_Q{i}": 1 for i in range(1, 10)} | {"EPDS_Q10": 0}
    r = c.post(f"/api/v1/patients/{p['id']}/epds", json={"answers": nine}).json()
    assert r["score"] == 9 and r["band"] == "low" and r["context"]["pregnancyBand"] in ("high", "urgent")
    q10 = {f"EPDS_Q{i}": 0 for i in range(1, 10)} | {"EPDS_Q10": 1}
    r = c.post(f"/api/v1/patients/{p['id']}/epds", json={"answers": q10}).json()
    assert r["band"] == "urgent" and r["self_harm"] and r["patient"]["postnatal"][-1]["referral"]
    assert c.post(f"/api/v1/patients/{p['id']}/epds", json={"answers": {"EPDS_Q1": 7}}).status_code == 422


def test_postnatal_entry_without_anc_history(chw):
    c, _ = chw
    r = c.post("/api/v1/postnatal-entry", json={"name": "Halima Bakari", "age": 31, "village": "Mlandizi", "consent": {"care": True},
                                                "birth": {"outcome": "stillbirth", "date": (date.today() - timedelta(days=20)).isoformat(), "place": "home"}})
    assert r.status_code == 200 and r.json()["pregnancy"]["outcome"] == "stillbirth" and r.json()["consent"]["postnatal_mh"]


# ---------------------------------------------------------------- child development

def test_child_milestones_play_and_mchat(chw):
    c, _ = chw
    r = c.post("/api/v1/postnatal-entry", json={"name": "Mariam Hamisi", "age": 28, "village": "Kibaha", "consent": {"care": True},
                                                "birth": {"outcome": "live_birth", "date": (date.today() - timedelta(days=670)).isoformat(),
                                                          "place": "facility", "babyName": "Imani", "babySex": "female", "gestationAtBirthWeeks": 39}})
    kid = r.json()["children"][0]["id"]
    assert c.post(f"/api/v1/persons/{kid}/consent", json={"module": "child_dev", "care": True}).status_code == 200
    child = c.get(f"/api/v1/children/{kid}").json()
    g = c.post(f"/api/v1/children/{kid}/milestones", json={"answers": {}, "lostSkill": True}).json()
    assert g["advise_contact_chw"] and "score" not in g
    act = child["plan"]["activities"][0]["code"]
    once = c.post(f"/api/v1/children/{kid}/play", json={"code": act}).json()
    twice = c.post(f"/api/v1/children/{kid}/play", json={"code": act}).json()
    assert once["play"]["total"] == twice["play"]["total"] == 1
    assert c.post(f"/api/v1/children/{kid}/play", json={"code": "NOPE"}).status_code == 400
    qs = c.get("/api/v1/mchat/questions").json()["questions"]
    typical = {x["code"]: ("no" if x["riskIfYes"] else "yes") for x in qs}
    m = c.post(f"/api/v1/children/{kid}/mchat", json={"answers": typical}).json()
    assert m["score"] == 0 and m["band"] == "low"
    flipped = {k: ("yes" if v == "no" else "no") for k, v in typical.items()}
    m = c.post(f"/api/v1/children/{kid}/mchat", json={"answers": flipped}).json()
    assert m["score"] == 20 and m["band"] == "high" and m["child"]["mchat"][0]["referral"]
    t = c.post(f"/api/v1/children/{kid}/tasks", json={"task": "memory", "accuracy": 33, "seconds": 40, "assistance": "Verbal Prompt",
                                                      "caution": True, "note": "Remembered 2/6."})
    assert t.status_code == 200 and t.json()["tasks"][0]["accuracy"] == 33


def test_status_endpoint_for_chw(chw):
    c, _ = chw
    assert c.get("/api/v1/status").json()["appRamMb"] > 0


# ---------------------------------------------------------------- staff attribution (additive columns)

def test_clinical_rows_record_who_did_it_and_consent_keeps_who_gave_it(chw):
    c, sid = chw
    p = high_risk_patient(c)
    pid = p["id"]
    assert sql("SELECT created_by_staff_id FROM person WHERE person_id=?", pid)[0][0] == sid
    row = sql("SELECT given_by_person_id, subject_person_id, recorded_by_staff_id FROM consent WHERE subject_person_id=?", pid)[0]
    assert row["given_by_person_id"] == pid and row["recorded_by_staff_id"] == sid        # patient gave it, CHW recorded it
    assert row["given_by_person_id"] != sid
    assert sql("SELECT staff_id FROM encounter WHERE person_id=?", pid)[0][0] == sid
    c.post(f"/api/v1/persons/{pid}/consent", json={"module": "postnatal_mh", "care": True})
    birth(c, pid)
    kid = sql("SELECT person_id FROM person WHERE role='child'")[0][0]
    assert sql("SELECT created_by_staff_id FROM person WHERE person_id=?", kid)[0][0] == sid
    c.post(f"/api/v1/patients/{pid}/epds", json={"answers": {f"EPDS_Q{i}": 0 for i in range(1, 11)}})
    assert {r[0] for r in sql("SELECT DISTINCT staff_id FROM encounter")} == {sid}


def test_attribution_comes_from_the_session_not_the_request_body(chw):
    c, sid = chw
    forged = dict(LOW)
    forged["staff_id"] = "someone-else"
    p = register(c, "Zawadi Said", 24, {"gravida": "2", "para": "1"}, forged)
    assert p.status_code == 200
    assert {r[0] for r in sql("SELECT DISTINCT staff_id FROM encounter")} == {sid}


# ---------------------------------------------------------------- regression: audit item (consent ordering) and migration

def test_latest_consent_decision_wins():
    """The audit looked for a stray 'AND' before ORDER BY in has_care_consent. It is not in this code; this pins the behaviour."""
    con = db.connect()
    con.execute("INSERT INTO household (household_id, hub_id, created_at) VALUES ('h','hub','2026-01-01')")
    con.execute("INSERT INTO person (person_id, household_id, role, full_name, created_at) VALUES ('m','h','mother','M','2026-01-01')")

    def put(cid, status, at):
        con.execute("""INSERT INTO consent (consent_id, subject_person_id, given_by_person_id, module, purpose, status, method,
                       consent_text_version, recorded_at) VALUES (?,?,?,?,?,?,?,?,?)""", (cid, "m", "m", "pregnancy", "care", status, "verbal", "v", at))
    put("c1", "granted", "2026-01-01T10:00:00+00:00")
    assert db.has_care_consent(con, "m", "pregnancy") is True
    put("c2", "withdrawn", "2026-01-02T10:00:00+00:00")
    assert db.has_care_consent(con, "m", "pregnancy") is False
    put("c3", "granted", "2026-01-03T10:00:00+00:00")
    assert db.has_care_consent(con, "m", "pregnancy") is True
    assert db.has_care_consent(con, "m", "child_dev") is False
    try:
        db.require_consent(con, "m", "child_dev")
        raise AssertionError("require_consent should refuse")
    except db.ConsentMissing:
        pass
    con.close()


def test_migration_keeps_existing_records(tmp_path, monkeypatch):
    original_schema = (db.Path(db.__file__).parent / "schema.sql").read_text().split("-- =====")[0]   # everything before staff auth
    path = tmp_path / "old.db"
    con = sqlite3.connect(path)
    con.executescript(original_schema)
    con.execute("INSERT INTO household VALUES ('h','v','w',NULL,'hub','2026-01-01')")
    con.execute("INSERT INTO person (person_id,household_id,role,full_name,created_at) VALUES ('m','h','mother','Old Mama','2026-01-01')")
    con.execute("INSERT INTO consent VALUES ('c','m','m','pregnancy','care','granted','verbal','v','2026-01-01')")
    con.commit()
    con.close()
    monkeypatch.setattr(db, "DB_PATH", path)
    db.init()
    db.init()                                                          # running it twice is harmless
    con = db.connect()
    cols = {t: {r["name"] for r in con.execute(f"PRAGMA table_info({t})")} for t in ("person", "consent", "encounter", "review", "referral")}
    assert "created_by_staff_id" in cols["person"] and "recorded_by_staff_id" in cols["consent"] and "staff_id" in cols["encounter"]
    assert "reviewed_by_staff_id" in cols["review"] and "status_updated_by_staff_id" in cols["referral"]
    assert db.one(con, "SELECT full_name FROM person WHERE person_id='m'")["full_name"] == "Old Mama"
    assert db.one(con, "SELECT recorded_by_staff_id r FROM consent")["r"] is None          # old rows: "before staff accounts"
    assert db.has_care_consent(con, "m", "pregnancy") is True
    assert db.one(con, "SELECT COUNT(*) n FROM staff_user")["n"] == 0
    con.close()
