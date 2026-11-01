"""Shared test setup. The tests use a throw-away database in a temp folder: REFLEX_DB is set BEFORE the app is
imported (app.main opens the database at import), so the real data/reflex.db is never touched. The model files
in model/ are only read, never written.

Run from the project folder:   pip install -r requirements-dev.txt   then   python -m pytest tests -v
"""
import os
import sys
import tempfile
from pathlib import Path

import pytest

collect_ignore = ["smoke_test.py"]   # a script for a RUNNING hub, not a pytest module

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ["REFLEX_DB"] = str(Path(tempfile.mkdtemp(prefix="reflex-test-")) / "test.db")
for _name in ("REFLEX_COOKIE_SECURE", "REFLEX_SESSION_IDLE_HOURS", "REFLEX_SESSION_MAX_HOURS", "REFLEX_ALLOWED_ORIGINS"):
    os.environ.pop(_name, None)

from fastapi.testclient import TestClient  # noqa: E402

from app import auth, db, main, manage  # noqa: E402

ADMIN_PW = "correct horse battery"
CHW_PW = "sunrise over kibaha"


@pytest.fixture(autouse=True)
def clean_db():
    """Every test starts with no patients and no staff."""
    con = db.connect()
    manage.reset_demo_data(con)
    con.execute("DELETE FROM staff_session")
    con.execute("DELETE FROM login_attempt")
    con.execute("UPDATE staff_user SET created_by_staff_id=NULL")
    con.execute("DELETE FROM staff_user")
    con.close()
    yield


def new_client(csrf=True):
    """A browser-like client: keeps cookies between calls. csrf=False omits the X-Reflex header a real page sends."""
    c = TestClient(main.app)
    if csrf:
        c.headers.update({"X-Reflex": "1"})
    return c


def make_staff(username, role="chw", password=None, name=None, must_change=False):
    con = db.connect()
    try:
        row = auth.create_staff(con, username, name or username.title() + " Test", role,
                                password or (ADMIN_PW if role == "admin" else CHW_PW), must_change=must_change)
        return row["staff_id"]
    finally:
        con.close()


def sign_in(username, password):
    c = new_client()
    r = c.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return c


@pytest.fixture
def admin_client():
    make_staff("boss", "admin")
    return sign_in("boss", ADMIN_PW)


@pytest.fixture
def chw():
    """(signed-in CHW client, that CHW's staff id)"""
    sid = make_staff("asha", "chw")
    return sign_in("asha", CHW_PW), sid


def sql(query, *args):
    con = db.connect()
    try:
        return con.execute(query, args).fetchall()
    finally:
        con.close()
