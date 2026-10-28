"""SQLite access. WAL + synchronous=FULL so a pulled power cable loses nothing already saved."""
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(os.environ.get("REFLEX_DB", Path(__file__).resolve().parent.parent / "data" / "reflex.db"))
HUB_ID = os.environ.get("REFLEX_HUB_ID", "hub-demo-01")


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id():
    return str(uuid.uuid4())


def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH, isolation_level=None)  # autocommit; each write is durable on return
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA synchronous=FULL")
    con.execute("PRAGMA foreign_keys=ON")
    return con


def init():
    con = connect()
    con.executescript((Path(__file__).parent / "schema.sql").read_text())
    con.close()


def one(con, sql, *args):
    return con.execute(sql, args).fetchone()


def all_(con, sql, *args):
    return con.execute(sql, args).fetchall()


# ---------- consent: enforced here, not in the UI ----------

class ConsentMissing(Exception):
    pass


def has_care_consent(con, person_id, module):
    row = one(con, """SELECT status FROM consent
                      WHERE subject_person_id=? AND module=? AND purpose='care'
                      ORDER BY recorded_at DESC, rowid DESC LIMIT 1""", person_id, module)
    return bool(row and row["status"] == "granted")


def require_consent(con, person_id, module):
    if not has_care_consent(con, person_id, module):
        raise ConsentMissing(module)
