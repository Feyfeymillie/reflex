"""Staff authentication for the RefleX hub: Argon2id passwords, server-side sessions, lockout, and the
request gate that protects every /api/ route by default.

Design in one paragraph: the browser holds one random session token in an HttpOnly cookie. The database
holds only the SHA-256 of that token, so there is no signing secret to leak or rotate. Every request to
/api/ passes through AuthMiddleware, which denies by default: a route is reachable without a session only
if it is listed in PUBLIC below. Roles are enforced there too, on the server, not in the screens:
'admin' may only manage staff accounts, 'chw' may only do clinical work.

Nothing here needs the internet. It is plain SQLite plus argon2-cffi (pip install argon2-cffi).
"""
import hashlib
import math
import os
import re
import secrets
import sqlite3
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import MutableHeaders
from starlette.requests import Request
from starlette.responses import JSONResponse

from . import db

COOKIE_NAME = "reflex_session"
CSRF_HEADER = "x-reflex"
ROLES = ("chw", "admin")


# ---------------------------------------------------------------- configuration

def _hours(name, default):
    try:
        v = float(os.environ.get(name, default))
        return v if v > 0 else default
    except ValueError:
        return default


IDLE = timedelta(hours=_hours("REFLEX_SESSION_IDLE_HOURS", 8))      # signed out after this long without use
MAX_AGE = timedelta(hours=_hours("REFLEX_SESSION_MAX_HOURS", 12))   # and never later than this after sign-in
TOUCH_EVERY = timedelta(seconds=60)                                  # write "last seen" at most this often


def cookie_secure():
    """Secure cookies only work over HTTPS; browsers silently drop them on plain HTTP. Off by default so the
    Pi's http://10.42.0.1:8000 keeps working. Set REFLEX_COOKIE_SECURE=1 once the hub is served over HTTPS."""
    return os.environ.get("REFLEX_COOKIE_SECURE", "").strip().lower() in ("1", "true", "yes", "on")


def _allowed_origins():
    return {o.strip().rstrip("/") for o in os.environ.get("REFLEX_ALLOWED_ORIGINS", "").split(",") if o.strip()}


# ---------------------------------------------------------------- errors

class AuthError(Exception):
    """A problem that should reach the user as {"errors": [...]} with this HTTP status."""

    def __init__(self, status, errors, **extra):
        super().__init__(status)
        self.status = status
        self.errors = errors if isinstance(errors, list) else [errors]
        self.extra = extra


class LoginError(Exception):
    def __init__(self, kind, retry_after=0):
        super().__init__(kind)
        self.kind = kind            # 'invalid' | 'locked' | 'inactive'
        self.retry_after = retry_after


MSG_PERMISSION = "Huna ruhusa ya kufanya hivi. / You do not have permission to do this."
MSG_ADMIN_NO_CLINICAL = ("Akaunti ya msimamizi haiwezi kufikia taarifa za wagonjwa. / "
                         "Administrator accounts cannot access patient records.")
MSG_SIGN_IN = "Tafadhali ingia tena. / Please sign in again."
MSG_CHANGE_PASSWORD = "Badilisha nenosiri lako kwanza. / Please change your password first."
MSG_CSRF = "Ombi limekataliwa. Pakia ukurasa upya. / Request refused. Reload the page."


# ---------------------------------------------------------------- passwords (Argon2id)

# OWASP's minimum Argon2id profile (19 MiB, 2 passes, 1 lane): about 50-100 ms on a Pi 5, and light enough
# that a few phones signing in at once do not squeeze the XGBoost model's memory.
_HASHER = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1, hash_len=32, salt_len=16, type=Type.ID)
_DUMMY = None

MIN_PASSWORD = 8
MAX_PASSWORD = 128
_COMMON = {
    "password", "password1", "password12", "password123", "passw0rd", "12345678", "123456789", "1234567890",
    "11111111", "00000000", "qwerty123", "qwertyui", "qwertyuiop", "abcd1234", "abc12345", "iloveyou",
    "admin123", "administrator", "welcome1", "welcome123", "letmein1", "changeme", "changeme1", "reflex123",
    "reflexreflex", "reflex2026", "tanzania", "tanzania1", "karibu123", "asdfghjk", "zxcvbnm1", "monkey123",
}


def password_problems(password, username=""):
    """Length and an obvious-password check. No composition rules: they push people to write passwords down."""
    if not isinstance(password, str) or len(password) < MIN_PASSWORD:
        return [f"Nenosiri liwe na angalau herufi {MIN_PASSWORD}. / Password must be at least {MIN_PASSWORD} characters."]
    if len(password) > MAX_PASSWORD:
        return [f"Nenosiri refu mno (kikomo herufi {MAX_PASSWORD}). / Password is too long (limit {MAX_PASSWORD} characters)."]
    low = password.lower()
    if low in _COMMON or len(set(password)) == 1 or (username and low == username.lower()):
        return ["Nenosiri hili ni rahisi kubahatisha. Chagua jingine. / That password is too easy to guess. Choose another."]
    return []


def hash_password(password):
    return _HASHER.hash(password)


def verify_password(stored_hash, password):
    try:
        return bool(_HASHER.verify(stored_hash, password))
    except (VerificationError, InvalidHashError):  # VerifyMismatchError is a VerificationError
        return False


def _burn_time():
    """Unknown usernames still cost one hash, so response time does not reveal which usernames exist."""
    global _DUMMY
    if _DUMMY is None:
        _DUMMY = _HASHER.hash("reflex-timing-equaliser")
    verify_password(_DUMMY, "not-the-password")


_TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"  # no 0/o/1/l/i: easy to read out over the phone


def generate_temp_password():
    """e.g. 'k7mq-x2ph-9wdn' (12 random characters, about 59 bits). Shown once, must be changed at first sign-in."""
    return "-".join("".join(secrets.choice(_TEMP_ALPHABET) for _ in range(4)) for _ in range(3))


# ---------------------------------------------------------------- small helpers

def _now():
    return datetime.now(timezone.utc)


def _iso(dt):
    return dt.isoformat(timespec="seconds")


def _parse(s):
    return datetime.fromisoformat(s)


def _hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,31}$")


def normalize_username(raw):
    u = raw.strip().lower() if isinstance(raw, str) else ""
    if not USERNAME_RE.match(u):
        raise AuthError(422, "Jina la mtumiaji: herufi 3 hadi 32 (a-z, 0-9, . _ -), lianze kwa herufi au nambari. / "
                             "Username: 3 to 32 characters (a-z, 0-9, . _ -), starting with a letter or number.")
    return u


def clean_name(raw):
    n = " ".join(raw.split()) if isinstance(raw, str) else ""
    if not 2 <= len(n) <= 80:
        raise AuthError(422, "Andika jina kamili (herufi 2 hadi 80). / Enter the full name (2 to 80 characters).")
    return n


def public_user(row):
    """The only shape of a staff account that ever leaves the server: never the hash."""
    return {"id": row["staff_id"], "username": row["username"], "fullName": row["full_name"], "role": row["role"],
            "isActive": bool(row["is_active"]), "mustChangePassword": bool(row["must_change_password"]),
            "createdAt": row["created_at"], "lastLoginAt": row["last_login_at"]}


def _staff(con, staff_id):
    return db.one(con, "SELECT * FROM staff_user WHERE staff_id=?", staff_id)


def has_admin():
    con = db.connect()
    try:
        return db.one(con, "SELECT 1 FROM staff_user WHERE role='admin' AND is_active=1") is not None
    finally:
        con.close()


# ---------------------------------------------------------------- lockout

USER_MAX_FAILS, USER_WINDOW = 5, timedelta(minutes=15)
LOCK_BASE, LOCK_CAP = 30, 900                      # 30 s after the 5th miss, doubling, at most 15 min
IP_MAX_FAILS, IP_WINDOW, IP_LOCK = 30, timedelta(minutes=10), 60


def lockout_seconds(con, username, ip=None):
    """Seconds until another attempt is allowed (0 = allowed). Misses while locked are not recorded, so a
    stranger hammering an account cannot extend its lock beyond the cap."""
    now = _now()
    since = _iso(now - USER_WINDOW)
    last_ok = db.one(con, "SELECT MAX(attempted_at) m FROM login_attempt WHERE username=? AND success=1", username)["m"]
    if last_ok and last_ok > since:
        since = last_ok
    misses = db.all_(con, "SELECT attempted_at FROM login_attempt WHERE username=? AND success=0 AND attempted_at>? "
                          "ORDER BY attempted_at DESC", username, since)
    remaining = 0.0
    if len(misses) >= USER_MAX_FAILS:
        lock = min(LOCK_BASE * 2 ** (len(misses) - USER_MAX_FAILS), LOCK_CAP)
        remaining = lock - (now - _parse(misses[0]["attempted_at"])).total_seconds()
    if ip:
        from_ip = db.all_(con, "SELECT attempted_at FROM login_attempt WHERE ip=? AND success=0 AND attempted_at>? "
                               "ORDER BY attempted_at DESC", ip, _iso(now - IP_WINDOW))
        if len(from_ip) >= IP_MAX_FAILS:
            remaining = max(remaining, IP_LOCK - (now - _parse(from_ip[0]["attempted_at"])).total_seconds())
    return max(0, math.ceil(remaining))


def _record_attempt(con, username, ip, ok):
    # Microsecond timestamps: a miss and a success in the same second must still sort in the order they happened.
    con.execute("INSERT INTO login_attempt (username, ip, success, attempted_at) VALUES (?,?,?,?)",
                (username, ip, int(ok), _now().isoformat(timespec="microseconds")))


def clear_lockout(con, username):
    con.execute("DELETE FROM login_attempt WHERE username=? AND success=0", (username,))


# ---------------------------------------------------------------- sessions

def _new_session(con, staff_id):
    token = secrets.token_urlsafe(32)  # 256 bits
    now = _now()
    con.execute("INSERT INTO staff_session (session_hash, staff_id, created_at, last_seen_at, expires_at) VALUES (?,?,?,?,?)",
                (_hash_token(token), staff_id, _iso(now), _iso(now), _iso(now + MAX_AGE)))
    return token


def _prune(con):
    now = _now()
    con.execute("DELETE FROM staff_session WHERE expires_at<=? OR last_seen_at<=?", (_iso(now), _iso(now - IDLE)))
    con.execute("DELETE FROM login_attempt WHERE attempted_at<?", (_iso(now - timedelta(days=1)),))


def end_session(token):
    if not token:
        return
    con = db.connect()
    try:
        con.execute("DELETE FROM staff_session WHERE session_hash=?", (_hash_token(token),))
    finally:
        con.close()


def end_all_sessions(con, staff_id, keep_hash=None):
    if keep_hash:
        con.execute("DELETE FROM staff_session WHERE staff_id=? AND session_hash<>?", (staff_id, keep_hash))
    else:
        con.execute("DELETE FROM staff_session WHERE staff_id=?", (staff_id,))


def authenticate(token):
    """The staff account behind a session cookie, or None if the cookie is missing, unknown, idle for
    IDLE, older than MAX_AGE, or its account has been deactivated. Extends the idle window as a side effect."""
    if not token or len(token) > 200:
        return None
    con = db.connect()
    try:
        row = db.one(con, """SELECT s.session_hash, s.last_seen_at, s.expires_at, u.*
                             FROM staff_session s JOIN staff_user u ON u.staff_id = s.staff_id
                             WHERE s.session_hash=?""", _hash_token(token))
        if row is None:
            return None
        now = _now()
        idle_for = now - _parse(row["last_seen_at"])
        if not row["is_active"] or _parse(row["expires_at"]) <= now or idle_for >= IDLE:
            con.execute("DELETE FROM staff_session WHERE session_hash=?", (row["session_hash"],))
            return None
        if idle_for >= TOUCH_EVERY:
            con.execute("UPDATE staff_session SET last_seen_at=? WHERE session_hash=?", (_iso(now), row["session_hash"]))
        return dict(row)
    finally:
        con.close()


def set_session_cookie(response, token):
    response.set_cookie(COOKIE_NAME, token, max_age=int(MAX_AGE.total_seconds()), httponly=True,
                        samesite="lax", secure=cookie_secure(), path="/")


def clear_session_cookie(response):
    response.delete_cookie(COOKIE_NAME, path="/", httponly=True, samesite="lax", secure=cookie_secure())


# ---------------------------------------------------------------- sign in / password change

def login(username_raw, password, ip=None):
    """Blocking (Argon2 is CPU work): call through run_in_threadpool. Returns (session token, staff row)."""
    username = username_raw.strip().lower()[:64] if isinstance(username_raw, str) else ""
    if not username or not isinstance(password, str) or not password or len(password) > 1024:
        raise LoginError("invalid")
    con = db.connect()
    try:
        wait = lockout_seconds(con, username, ip)
        if wait:
            raise LoginError("locked", wait)
        row = db.one(con, "SELECT * FROM staff_user WHERE username=?", username)
        if row is None:
            _burn_time()
            ok = False
        else:
            ok = verify_password(row["password_hash"], password)
        _record_attempt(con, username, ip, ok)
        if not ok:
            raise LoginError("invalid")
        if not row["is_active"]:
            raise LoginError("inactive")   # only said after the right password, so it does not reveal who exists
        ts = db.now()
        if _HASHER.check_needs_rehash(row["password_hash"]):
            con.execute("UPDATE staff_user SET password_hash=?, updated_at=? WHERE staff_id=?",
                        (hash_password(password), ts, row["staff_id"]))
        con.execute("UPDATE staff_user SET last_login_at=? WHERE staff_id=?", (ts, row["staff_id"]))
        token = _new_session(con, row["staff_id"])
        _prune(con)
        return token, _staff(con, row["staff_id"])
    finally:
        con.close()


def _set_password(con, staff_id, password, must_change):
    con.execute("UPDATE staff_user SET password_hash=?, must_change_password=?, updated_at=? WHERE staff_id=?",
                (hash_password(password), int(must_change), db.now(), staff_id))


def change_own_password(staff_id, current, new, keep_session_hash):
    """Blocking. Verifies the current password (counted towards lockout), sets the new one, and signs the
    account out everywhere else."""
    con = db.connect()
    try:
        row = _staff(con, staff_id)
        wait = lockout_seconds(con, row["username"])
        if wait:
            raise AuthError(429, f"Jaribio nyingi mno. Subiri sekunde {wait}. / Too many attempts. Wait {wait} seconds.",
                            retryAfter=wait)
        if not isinstance(current, str) or not verify_password(row["password_hash"], current):
            _record_attempt(con, row["username"], None, False)
            raise AuthError(422, "Nenosiri la sasa si sahihi. / The current password is not correct.")
        problems = password_problems(new, row["username"])
        if problems:
            raise AuthError(422, problems)
        if new == current:
            raise AuthError(422, "Nenosiri jipya liwe tofauti na la zamani. / The new password must be different from the old one.")
        _set_password(con, staff_id, new, must_change=False)
        end_all_sessions(con, staff_id, keep_hash=keep_session_hash)
        _record_attempt(con, row["username"], None, True)
        return _staff(con, staff_id)
    finally:
        con.close()


# ---------------------------------------------------------------- account management

def create_staff(con, username, full_name, role, password, must_change, created_by=None):
    if role not in ROLES:
        raise ValueError(role)
    u, name = normalize_username(username), clean_name(full_name)
    problems = password_problems(password, u)
    if problems:
        raise AuthError(422, problems)
    sid, ts = db.new_id(), db.now()
    try:
        con.execute("""INSERT INTO staff_user (staff_id, username, full_name, role, password_hash, is_active,
                       must_change_password, created_at, updated_at, created_by_staff_id) VALUES (?,?,?,?,?,1,?,?,?,?)""",
                    (sid, u, name, role, hash_password(password), int(must_change), ts, ts, created_by))
    except sqlite3.IntegrityError:
        raise AuthError(409, "Jina hili la mtumiaji limeshatumika. / That username is already taken.")
    return _staff(con, sid)


def _chw_target(con, staff_id):
    row = _staff(con, staff_id)
    if row is None:
        raise AuthError(404, "Akaunti haijapatikana. / Account not found.")
    if row["role"] != "chw":
        raise AuthError(403, "Akaunti za wasimamizi zinasimamiwa kwenye hub kwa amri ya `python -m app.manage`. / "
                             "Administrator accounts are managed on the hub with `python -m app.manage`.")
    return row


def list_staff():
    con = db.connect()
    try:
        out = []
        for r in db.all_(con, "SELECT * FROM staff_user ORDER BY role, full_name COLLATE NOCASE"):
            u = public_user(r)
            u["lockedOut"] = lockout_seconds(con, r["username"]) > 0
            out.append(u)
        return out
    finally:
        con.close()


def admin_create_chw(actor_id, username, full_name, password=None):
    """Returns (user, temporary_password or None). A blank password means 'generate one'."""
    temp = None
    if not password:
        password = temp = generate_temp_password()
    con = db.connect()
    try:
        row = create_staff(con, username, full_name, "chw", password, must_change=True, created_by=actor_id)
        return public_user(row), temp
    finally:
        con.close()


def admin_rename(staff_id, full_name):
    con = db.connect()
    try:
        _chw_target(con, staff_id)
        con.execute("UPDATE staff_user SET full_name=?, updated_at=? WHERE staff_id=?", (clean_name(full_name), db.now(), staff_id))
        return public_user(_staff(con, staff_id))
    finally:
        con.close()


def admin_set_active(staff_id, active):
    """Deactivating signs the person out of every device at once. Nothing is deleted."""
    con = db.connect()
    try:
        _chw_target(con, staff_id)
        con.execute("UPDATE staff_user SET is_active=?, updated_at=? WHERE staff_id=?", (int(active), db.now(), staff_id))
        if not active:
            end_all_sessions(con, staff_id)
        return public_user(_staff(con, staff_id))
    finally:
        con.close()


def admin_reset_password(staff_id):
    """New one-time password, shown to the admin once. Signs the person out everywhere and clears any lockout."""
    con = db.connect()
    try:
        row = _chw_target(con, staff_id)
        temp = generate_temp_password()
        _set_password(con, staff_id, temp, must_change=True)
        end_all_sessions(con, staff_id)
        clear_lockout(con, row["username"])
        return public_user(_staff(con, staff_id)), temp
    finally:
        con.close()


def admin_unlock(staff_id):
    con = db.connect()
    try:
        row = _chw_target(con, staff_id)
        clear_lockout(con, row["username"])
        return public_user(_staff(con, staff_id))
    finally:
        con.close()


# ---------------------------------------------------------------- the gate

_current = ContextVar("reflex_staff", default=None)


def current_staff_id():
    """The signed-in staff member for the request being handled (None outside a request). main.py uses this to
    record who made each clinical entry. It is set by AuthMiddleware from the verified session, never from the body."""
    u = _current.get()
    return u["staff_id"] if u else None


PUBLIC = {("POST", "/api/v1/auth/login"), ("POST", "/api/v1/auth/logout"), ("GET", "/api/v1/auth/setup-status")}
ANY_ROLE = {("GET", "/api/v1/auth/me"), ("POST", "/api/v1/auth/password")}
ALLOWED_WHILE_PASSWORD_PENDING = ANY_ROLE | {("POST", "/api/v1/auth/logout")}


def required_role(method, path):
    """'public' | 'any' | 'admin' | 'chw'. Anything not listed is clinical, so a new route is protected without
    anyone remembering to protect it."""
    key = (method.upper(), path.rstrip("/") or "/")
    if key in PUBLIC:
        return "public"
    if key in ANY_ROLE:
        return "any"
    p = key[1]
    if p == "/api/v1/admin" or p.startswith("/api/v1/admin/"):
        return "admin"
    return "chw"


def csrf_blocked(request):
    """A browser on another site cannot add a custom header without a CORS preflight, and this server answers
    none. The Origin check is a second layer for browsers that do send Origin."""
    if request.headers.get(CSRF_HEADER) != "1":
        return True
    origin = request.headers.get("origin")
    if origin:
        host = request.headers.get("host", "")
        if urlsplit(origin).netloc != host and origin.rstrip("/") not in _allowed_origins():
            return True
    return False


def _respond(status, errors, **extra):
    return JSONResponse({"errors": errors if isinstance(errors, list) else [errors], **extra}, status_code=status)


def _no_store(send):
    async def wrapped(message):
        if message["type"] == "http.response.start":
            MutableHeaders(scope=message)["Cache-Control"] = "no-store"  # patient data must not sit in a shared phone's cache
        await send(message)
    return wrapped


class AuthMiddleware:
    """Pure ASGI middleware. Order of checks: request forgery, then who you are, then what you may do."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope["path"].startswith("/api/"):
            await self.app(scope, receive, send)  # the static React app is public; it contains no patient data
            return
        send = _no_store(send)
        request = Request(scope, receive)
        method, path = scope["method"], scope["path"]

        if method not in ("GET", "HEAD", "OPTIONS") and csrf_blocked(request):
            await _respond(403, MSG_CSRF, csrf=True)(scope, receive, send)
            return

        need = required_role(method, path)
        if need == "public":
            await self.app(scope, receive, send)
            return

        token = request.cookies.get(COOKIE_NAME)
        staff = await run_in_threadpool(authenticate, token)
        if staff is None:
            resp = _respond(401, MSG_SIGN_IN, auth_required=True)
            if token:
                clear_session_cookie(resp)
            await resp(scope, receive, send)
            return

        if need in ("admin", "chw") and staff["role"] != need:
            msg = MSG_ADMIN_NO_CLINICAL if need == "chw" else MSG_PERMISSION
            await _respond(403, msg, forbidden=True)(scope, receive, send)
            return
        if staff["must_change_password"] and (method.upper(), path.rstrip("/")) not in ALLOWED_WHILE_PASSWORD_PENDING:
            await _respond(403, MSG_CHANGE_PASSWORD, password_change_required=True)(scope, receive, send)
            return

        scope.setdefault("state", {})["staff"] = staff
        reset = _current.set(staff)
        try:
            await self.app(scope, receive, send)
        finally:
            _current.reset(reset)
