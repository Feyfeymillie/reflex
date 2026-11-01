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


# Additive migrations: columns added after the first release. SQLite has no "ADD COLUMN IF NOT EXISTS",
# so each one is checked with PRAGMA table_info first. Nothing is dropped, rewritten or backfilled.
# Rows written before authentication existed keep NULL here, which means "recorded before staff accounts".
ADDED_COLUMNS = (
    ("person", "created_by_staff_id", "TEXT REFERENCES staff_user(staff_id)"),
    ("consent", "recorded_by_staff_id", "TEXT REFERENCES staff_user(staff_id)"),
    ("encounter", "staff_id", "TEXT REFERENCES staff_user(staff_id)"),
    ("review", "reviewed_by_staff_id", "TEXT REFERENCES staff_user(staff_id)"),
    ("referral", "status_updated_by_staff_id", "TEXT REFERENCES staff_user(staff_id)"),
)


def _migrate(con):
    for table, column, ddl in ADDED_COLUMNS:
        have = {r["name"] for r in con.execute(f"PRAGMA table_info({table})")}
        if column not in have:
            try:
                con.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
            except sqlite3.OperationalError as e:  # another process added it between the check and the ALTER
                if "duplicate column" not in str(e).lower():
                    raise


def init():
    con = connect()
    con.executescript((Path(__file__).parent / "schema.sql").read_text())
    _migrate(con)
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
