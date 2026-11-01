"""Authentication and authorization: sign-in, sessions, lockout, roles, CSRF, account management, CLI."""
import io
from datetime import datetime, timedelta, timezone

import pytest

from app import auth, db, manage
from conftest import ADMIN_PW, CHW_PW, make_staff, new_client, sign_in, sql

PUBLIC = auth.PUBLIC


def iso(d):
    return d.isoformat(timespec="seconds")


def now():
    return datetime.now(timezone.utc)


def set_session_column(column, value):
    con = db.connect()
    con.execute(f"UPDATE staff_session SET {column}=?", (iso(value),))
    con.close()


# ---------------------------------------------------------------- first administrator

def test_setup_status_and_first_admin_via_cli(monkeypatch):
    c = new_client()
    assert c.get("/api/v1/auth/setup-status").json() == {"adminExists": False}
    monkeypatch.setattr("sys.stdin", io.StringIO(ADMIN_PW + "\n"))
    assert manage.main(["create-admin", "boss", "--name", "Hub Admin", "--password-stdin"]) == 0
    assert c.get("/api/v1/auth/setup-status").json() == {"adminExists": True}
    assert sql("SELECT role FROM staff_user WHERE username='boss'")[0][0] == "admin"


def test_no_web_route_creates_an_admin(admin_client, chw):
    r = admin_client.post("/api/v1/admin/staff", json={"username": "newboss", "fullName": "New Boss", "role": "admin"})
    assert r.status_code == 201 and r.json()["user"]["role"] == "chw"      # role in the body is ignored
    anon = new_client()
    assert anon.post("/api/v1/admin/staff", json={"username": "x1x", "fullName": "Xx", "role": "admin"}).status_code == 401


def test_cli_refuses_weak_password(monkeypatch):
    monkeypatch.setattr("sys.stdin", io.StringIO("password\n"))
    assert manage.main(["create-admin", "boss", "--name", "Hub Admin", "--password-stdin"]) == 1
    assert sql("SELECT COUNT(*) FROM staff_user")[0][0] == 0


# ---------------------------------------------------------------- passwords

def test_passwords_are_argon2id_and_never_plaintext(chw):
    stored = sql("SELECT password_hash FROM staff_user WHERE username='asha'")[0][0]
    assert stored.startswith("$argon2id$") and CHW_PW not in stored


@pytest.mark.parametrize("pw", ["short", "password", "aaaaaaaaaaaa", "x" * 200])
def test_password_policy_rejects(pw):
    assert auth.password_problems(pw)


def test_password_policy_accepts_a_passphrase():
    assert auth.password_problems("sunrise over kibaha") == []


# ---------------------------------------------------------------- sign in

def test_valid_login_sets_a_safe_cookie_and_hides_the_hash():
    make_staff("asha")
    r = new_client().post("/api/v1/auth/login", json={"username": " Asha ", "password": CHW_PW})
    assert r.status_code == 200
    body = r.json()["user"]
    assert body["username"] == "asha" and body["role"] == "chw" and "password" not in str(body).lower().replace("mustchangepassword", "")
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie and "max-age=43200" in cookie and "secure" not in cookie.replace("samesite", "")
    assert r.headers["cache-control"] == "no-store"


def test_secure_cookie_flag_is_opt_in(monkeypatch):
    make_staff("asha")
    monkeypatch.setenv("REFLEX_COOKIE_SECURE", "1")
    r = new_client().post("/api/v1/auth/login", json={"username": "asha", "password": CHW_PW})
    assert "secure" in r.headers["set-cookie"].lower().replace("samesite", "")


def test_invalid_username_and_password_look_the_same():
    make_staff("asha")
    a = new_client().post("/api/v1/auth/login", json={"username": "nobody", "password": "whatever123"})
    b = new_client().post("/api/v1/auth/login", json={"username": "asha", "password": "wrong-password"})
    assert a.status_code == b.status_code == 401 and a.json() == b.json()


@pytest.mark.parametrize("body", [{}, {"username": "", "password": ""}, "text", None])
def test_malformed_login_is_401_not_500(body):
    assert new_client().post("/api/v1/auth/login", json=body).status_code == 401


def test_inactive_account_gets_a_clear_message_only_with_the_right_password(admin_client):
    sid = make_staff("asha")
    assert admin_client.post(f"/api/v1/admin/staff/{sid}/deactivate").status_code == 200
    ok = new_client().post("/api/v1/auth/login", json={"username": "asha", "password": CHW_PW})
    assert ok.status_code == 403 and ok.json().get("deactivated")
    bad = new_client().post("/api/v1/auth/login", json={"username": "asha", "password": "wrong-wrong-wrong"})
    assert bad.status_code == 401


def test_me_requires_a_session(chw):
    c, _ = chw
    assert new_client().get("/api/v1/auth/me").status_code == 401
    assert c.get("/api/v1/auth/me").json()["user"]["username"] == "asha"


# ---------------------------------------------------------------- logout and expiry

def test_logout_ends_the_session_on_the_server(chw):
    c, _ = chw
    token = c.cookies.get(auth.COOKIE_NAME)
    assert c.post("/api/v1/auth/logout").status_code == 200
    assert sql("SELECT COUNT(*) FROM staff_session")[0][0] == 0
    replay = new_client()
    replay.cookies.set(auth.COOKIE_NAME, token)
    assert replay.get("/api/v1/auth/me").status_code == 401


def test_logout_without_a_session_is_harmless():
    assert new_client().post("/api/v1/auth/logout").status_code == 200


def test_raw_token_is_never_stored(chw):
    c, _ = chw
    token = c.cookies.get(auth.COOKIE_NAME)
    assert sql("SELECT COUNT(*) FROM staff_session WHERE session_hash=?", token)[0][0] == 0


def test_idle_expiry_after_8_hours(chw):
    c, _ = chw
    set_session_column("last_seen_at", now() - timedelta(hours=7, minutes=50))
    assert c.get("/api/v1/auth/me").status_code == 200
    set_session_column("last_seen_at", now() - timedelta(hours=8, minutes=1))
    r = c.get("/api/v1/auth/me")
    assert r.status_code == 401 and r.json()["auth_required"]
    assert sql("SELECT COUNT(*) FROM staff_session")[0][0] == 0


def test_absolute_expiry_after_12_hours_even_when_active(chw):
    c, _ = chw
    set_session_column("expires_at", now() - timedelta(seconds=5))
    assert c.get("/api/v1/auth/me").status_code == 401


def test_activity_extends_the_idle_window(chw):
    c, _ = chw
    set_session_column("last_seen_at", now() - timedelta(hours=2))
    assert c.get("/api/v1/auth/me").status_code == 200
    assert datetime.fromisoformat(sql("SELECT last_seen_at FROM staff_session")[0][0]) > now() - timedelta(minutes=1)


# ---------------------------------------------------------------- lockout

def test_lockout_after_five_misses_and_admin_unlock(admin_client):
    sid = make_staff("asha")
    c = new_client()
    for i in range(5):
        assert c.post("/api/v1/auth/login", json={"username": "asha", "password": f"bad-guess-{i}"}).status_code == 401
    r = c.post("/api/v1/auth/login", json={"username": "asha", "password": CHW_PW})
    assert r.status_code == 429 and r.json()["retryAfter"] > 0 and "retry-after" in r.headers
    listing = admin_client.get("/api/v1/admin/staff").json()["staff"]
    assert [u for u in listing if u["username"] == "asha"][0]["lockedOut"]
    assert admin_client.post(f"/api/v1/admin/staff/{sid}/unlock").status_code == 200
    assert c.post("/api/v1/auth/login", json={"username": "asha", "password": CHW_PW}).status_code == 200


# ---------------------------------------------------------------- CSRF

def test_state_changing_requests_need_the_custom_header(chw):
    make_staff("other")
    r = new_client(csrf=False).post("/api/v1/auth/login", json={"username": "other", "password": CHW_PW})
    assert r.status_code == 403 and r.json()["csrf"]


def test_foreign_origin_is_refused_same_origin_allowed():
    make_staff("asha")
    c = new_client()
    evil = c.post("/api/v1/auth/login", json={"username": "asha", "password": CHW_PW}, headers={"Origin": "http://evil.example"})
    assert evil.status_code == 403
    good = c.post("/api/v1/auth/login", json={"username": "asha", "password": CHW_PW}, headers={"Origin": "http://testserver"})
    assert good.status_code == 200


# ---------------------------------------------------------------- authorization

def sweep_routes():
    """(method, concrete path) for every /api/ route the app registers."""
    import re
    from app import main
    out = []
    for r in main.app.routes:
        path = getattr(r, "path", "")
        if path.startswith("/api/"):
            for m in getattr(r, "methods", None) or ():
                if m not in ("HEAD", "OPTIONS"):
                    out.append((m, re.sub(r"\{[^}]+\}", "x", path)))
    return out


def test_every_api_route_rejects_anonymous_requests():
    routes = sweep_routes()
    assert len(routes) > 20, "route discovery found too few routes"
    c = new_client()
    for method, path in routes:
        if (method, path) in PUBLIC:
            continue
        r = c.request(method, path, json={} if method != "GET" else None)
        assert r.status_code == 401, f"{method} {path} answered {r.status_code} to an anonymous request"


def test_admin_cannot_reach_any_clinical_route(admin_client):
    for method, path in sweep_routes():
        if (method, path) in PUBLIC or path.startswith("/api/v1/admin") or (method, path) in auth.ANY_ROLE:
            continue
        r = admin_client.request(method, path, json={} if method != "GET" else None)
        assert r.status_code == 403 and r.json().get("forbidden"), f"admin reached {method} {path} ({r.status_code})"


def test_chw_cannot_reach_any_admin_route(chw):
    c, _ = chw
    for method, path in sweep_routes():
        if path.startswith("/api/v1/admin"):
            r = c.request(method, path, json={} if method != "GET" else None)
            assert r.status_code == 403, f"CHW reached {method} {path}"


def test_chw_cannot_create_or_change_accounts(chw):
    c, sid = chw
    assert c.post("/api/v1/admin/staff", json={"username": "evil", "fullName": "Evil Admin"}).status_code == 403
    assert c.post(f"/api/v1/admin/staff/{sid}/reset-password").status_code == 403
    assert c.put(f"/api/v1/admin/staff/{sid}", json={"fullName": "Me"}).status_code == 403
    assert sql("SELECT COUNT(*) FROM staff_user")[0][0] == 1


def test_admin_cannot_manage_admin_accounts_from_the_web(admin_client):
    boss = sql("SELECT staff_id FROM staff_user WHERE username='boss'")[0][0]
    assert admin_client.post(f"/api/v1/admin/staff/{boss}/deactivate").status_code == 403
    assert admin_client.post("/api/v1/admin/staff/nope/reset-password").status_code == 404


# ---------------------------------------------------------------- account management

def test_admin_creates_chw_with_one_time_password_and_forced_change(admin_client):
    r = admin_client.post("/api/v1/admin/staff", json={"username": "Neema", "fullName": "Neema Said"})
    assert r.status_code == 201
    temp = r.json()["temporaryPassword"]
    assert r.json()["user"]["mustChangePassword"] and "password_hash" not in r.text
    c = sign_in("neema", temp)
    blocked = c.get("/api/v1/patients")
    assert blocked.status_code == 403 and blocked.json()["password_change_required"]
    assert c.get("/api/v1/auth/me").status_code == 200
    assert c.post("/api/v1/auth/password", json={"currentPassword": temp, "newPassword": "short"}).status_code == 422
    assert c.post("/api/v1/auth/password", json={"currentPassword": "nope-nope-nope", "newPassword": "a good long passphrase"}).status_code == 422
    assert c.post("/api/v1/auth/password", json={"currentPassword": temp, "newPassword": "a good long passphrase"}).status_code == 200
    assert c.get("/api/v1/patients").status_code == 200


def test_duplicate_and_invalid_usernames(admin_client):
    make_staff("asha")
    assert admin_client.post("/api/v1/admin/staff", json={"username": "ASHA", "fullName": "Dup Asha"}).status_code == 409
    assert admin_client.post("/api/v1/admin/staff", json={"username": "x", "fullName": "A"}).status_code == 422


def test_password_change_signs_out_other_devices_only(chw):
    c, _ = chw
    other = sign_in("asha", CHW_PW)
    assert c.post("/api/v1/auth/password", json={"currentPassword": CHW_PW, "newPassword": "moonlight over zanzibar"}).status_code == 200
    assert other.get("/api/v1/auth/me").status_code == 401
    assert c.get("/api/v1/auth/me").status_code == 200


def test_deactivation_ends_live_sessions_and_blocks_sign_in(admin_client, chw):
    c, sid = chw
    assert c.get("/api/v1/patients").status_code == 200
    assert admin_client.post(f"/api/v1/admin/staff/{sid}/deactivate").status_code == 200
    assert c.get("/api/v1/patients").status_code == 401
    assert new_client().post("/api/v1/auth/login", json={"username": "asha", "password": CHW_PW}).status_code == 403
    assert sql("SELECT COUNT(*) FROM staff_user WHERE staff_id=?", sid)[0][0] == 1      # never deleted
    assert admin_client.post(f"/api/v1/admin/staff/{sid}/activate").status_code == 200
    assert new_client().post("/api/v1/auth/login", json={"username": "asha", "password": CHW_PW}).status_code == 200


def test_admin_password_reset(admin_client, chw):
    c, sid = chw
    r = admin_client.post(f"/api/v1/admin/staff/{sid}/reset-password")
    temp = r.json()["temporaryPassword"]
    assert r.status_code == 200 and r.json()["user"]["mustChangePassword"]
    assert c.get("/api/v1/patients").status_code == 401                                  # signed out everywhere
    assert new_client().post("/api/v1/auth/login", json={"username": "asha", "password": CHW_PW}).status_code == 401
    again = sign_in("asha", temp)
    assert again.get("/api/v1/patients").status_code == 403                               # must change it first


def test_cli_reset_password_unlocks_and_signs_out(chw, monkeypatch):
    c, _ = chw
    monkeypatch.setattr("sys.stdin", io.StringIO("a brand new passphrase\n"))
    assert manage.main(["reset-password", "asha", "--password-stdin"]) == 0
    assert c.get("/api/v1/auth/me").status_code == 401
    assert sign_in("asha", "a brand new passphrase").get("/api/v1/patients").status_code == 200


# ---------------------------------------------------------------- the public app and demo reset

def test_static_app_stays_public():
    assert new_client().get("/patients").status_code in (200, 503)   # 503 only if the frontend has not been built


def test_demo_reset_requires_confirmation_and_keeps_staff(chw):
    con = db.connect()
    con.execute("INSERT INTO household (household_id, hub_id, created_at) VALUES ('h1','hub','2026-01-01')")
    con.execute("INSERT INTO person (person_id, household_id, role, full_name, created_at) VALUES ('m1','h1','mother','Demo','2026-01-01')")
    con.close()
    assert manage.main(["reset-demo-data", "--confirm", "yes please"]) == 1
    assert sql("SELECT COUNT(*) FROM person")[0][0] == 1
    assert manage.main(["reset-demo-data", "--confirm", manage.DEMO_PHRASE]) == 0
    assert sql("SELECT COUNT(*) FROM person")[0][0] == 0
    assert sql("SELECT COUNT(*) FROM staff_user")[0][0] == 1 and sql("SELECT COUNT(*) FROM staff_session")[0][0] == 1
