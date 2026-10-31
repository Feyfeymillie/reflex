"""Hub administration from the command line. Run it ON the hub (over SSH), from the project folder, with the
same Python environment and REFLEX_DB as the app:

    python -m app.manage create-admin  USERNAME --name "Full Name"     # the first administrator (one-time setup)
    python -m app.manage create-chw    USERNAME --name "Full Name"     # a CHW, without needing an administrator
    python -m app.manage reset-password USERNAME                       # lost administrator password, or any staff
    python -m app.manage unlock        USERNAME                        # clear a sign-in lockout
    python -m app.manage list                                          # staff accounts (never shows passwords)
    python -m app.manage reset-demo-data                               # DEMO ONLY: erase patient records, keep staff

Passwords are typed at a hidden prompt, or piped in with --password-stdin for scripts. There is deliberately no
web page that can create an administrator: only someone with a shell on the hub can.
"""
import argparse
import getpass
import sys

from . import auth, db

DEMO_PHRASE = "DELETE DEMO DATA"

# Children before the other people (person.mother_person_id points at the mother), and every table before
# the ones it references. Staff tables are not in this list on purpose: they are never touched.
CLINICAL_DELETES = (
    ("review", "DELETE FROM review"),
    ("referral", "DELETE FROM referral"),
    ("observation", "DELETE FROM observation"),
    ("guidance_event", "DELETE FROM guidance_event"),
    ("play_log", "DELETE FROM play_log"),
    ("assessment", "DELETE FROM assessment"),
    ("encounter", "DELETE FROM encounter"),
    ("consent", "DELETE FROM consent"),
    ("pregnancy", "DELETE FROM pregnancy"),
    ("person", "DELETE FROM person WHERE role='child'"),
    ("person", "DELETE FROM person"),
    ("household", "DELETE FROM household"),
)


def _password(args, label="New password"):
    if args.password_stdin:
        return sys.stdin.readline().rstrip("\r\n")
    while True:
        first = getpass.getpass(f"{label}: ")
        if first != getpass.getpass("Type it again: "):
            print("The two entries do not match. Try again.")
            continue
        problems = auth.password_problems(first)
        if problems:
            print(problems[0].split(" / ")[-1])
            continue
        return first


def _fail(e):
    print("Error: " + "; ".join(m.split(" / ")[-1] for m in e.errors), file=sys.stderr)
    return 1


def cmd_create(args, role):
    con = db.connect()
    try:
        if role == "admin" and auth.has_admin() and not args.yes:
            if input("An administrator already exists. Create another one? [y/N] ").strip().lower() != "y":
                print("Nothing changed.")
                return 0
        try:
            row = auth.create_staff(con, args.username, args.name, role, _password(args, "Password"), must_change=False)
        except auth.AuthError as e:
            return _fail(e)
        print(f"Created {role} '{row['username']}' ({row['full_name']}).")
        return 0
    finally:
        con.close()


def cmd_reset_password(args):
    con = db.connect()
    try:
        row = db.one(con, "SELECT * FROM staff_user WHERE username=?", args.username.strip().lower())
        if row is None:
            print("No such account.", file=sys.stderr)
            return 1
        pw = _password(args)
        problems = auth.password_problems(pw, row["username"])
        if problems:
            return _fail(auth.AuthError(422, problems))
        auth._set_password(con, row["staff_id"], pw, must_change=False)
        auth.end_all_sessions(con, row["staff_id"])
        auth.clear_lockout(con, row["username"])
        print(f"Password changed for '{row['username']}'. They were signed out everywhere.")
        return 0
    finally:
        con.close()


def cmd_unlock(args):
    con = db.connect()
    try:
        auth.clear_lockout(con, args.username.strip().lower())
        print("Lockout cleared.")
        return 0
    finally:
        con.close()


def cmd_list(_args):
    for u in auth.list_staff():
        flags = ("active" if u["isActive"] else "DEACTIVATED") + (", locked out" if u["lockedOut"] else "")
        print(f"{u['username']:<20} {u['role']:<6} {u['fullName']:<28} {flags}  last sign-in: {u['lastLoginAt'] or 'never'}")
    return 0


def reset_demo_data(con):
    """Erase every clinical and household row; keep staff accounts, sessions and sign-in history. Returns how
    many rows each table had. One transaction: all or nothing."""
    counts = {t: db.one(con, f"SELECT COUNT(*) n FROM {t}")["n"] for t in dict(CLINICAL_DELETES)}
    con.execute("BEGIN")
    try:
        for _table, sql in CLINICAL_DELETES:
            con.execute(sql)
        con.execute("COMMIT")
    except Exception:
        con.execute("ROLLBACK")
        raise
    return counts


def cmd_reset_demo(args):
    con = db.connect()
    try:
        counts = {t: db.one(con, f"SELECT COUNT(*) n FROM {t}")["n"] for t in dict(CLINICAL_DELETES)}
        print("DEMO DATA ONLY. This permanently erases ALL patient records on this hub:")
        for t, n in counts.items():
            print(f"  {t:<15} {n} rows")
        print("Staff accounts and sessions are kept. Do NOT use this on real patient data: it cannot be undone.")
        typed = args.confirm if args.confirm is not None else input(f'Type "{DEMO_PHRASE}" to continue: ')
        if typed != DEMO_PHRASE:
            print("Confirmation did not match. Nothing was deleted.")
            return 1
        reset_demo_data(con)
        print("Demo data erased. Staff accounts were not touched.")
        return 0
    finally:
        con.close()


def main(argv=None):
    p = argparse.ArgumentParser(prog="python -m app.manage", description="RefleX hub administration")
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("create-admin", "create-chw"):
        s = sub.add_parser(name)
        s.add_argument("username")
        s.add_argument("--name", required=True, help='full name, e.g. "Asha Juma"')
        s.add_argument("--password-stdin", action="store_true", help="read the password from stdin (for scripts)")
        s.add_argument("--yes", action="store_true", help="do not ask before creating another administrator")
    s = sub.add_parser("reset-password")
    s.add_argument("username")
    s.add_argument("--password-stdin", action="store_true")
    s = sub.add_parser("unlock")
    s.add_argument("username")
    sub.add_parser("list")
    s = sub.add_parser("reset-demo-data", help="DEMO ONLY: erase all patient records, keep staff accounts")
    s.add_argument("--confirm", help=f'type exactly "{DEMO_PHRASE}" to skip the prompt (scripts)')
    args = p.parse_args(argv)

    db.init()
    return {"create-admin": lambda: cmd_create(args, "admin"), "create-chw": lambda: cmd_create(args, "chw"),
            "reset-password": lambda: cmd_reset_password(args), "unlock": lambda: cmd_unlock(args),
            "list": lambda: cmd_list(args), "reset-demo-data": lambda: cmd_reset_demo(args)}[args.cmd]()


if __name__ == "__main__":
    sys.exit(main())
