# Staff sign-in and accounts

RefleX now requires every health worker to sign in. Patients never have accounts.

## Who can do what

| | Community health worker (`chw`) | Administrator (`admin`) |
|---|---|---|
| Patient records, ANC visits, postpartum, EPDS, child development, referrals, review, consent | Yes | **No.** The hub refuses every clinical route. |
| Create / edit / deactivate / reactivate CHW accounts, reset CHW passwords, unlock accounts | No | Yes |
| Change their own password | Yes | Yes |
| Create another administrator | No | **No** (command line on the hub only) |

These rules are enforced on the server, in `app/auth.py` (`AuthMiddleware`), on every request. The screens also hide what a role cannot use, but that is only a convenience.

Every `/api/` route is closed by default. Only three are open without signing in: `POST /api/v1/auth/login`, `POST /api/v1/auth/logout` and `GET /api/v1/auth/setup-status`. A new route added later is protected automatically. The static React app is public (it contains no patient data).

## First-time setup (once per hub)

Run on the hub (Raspberry Pi, over SSH), inside the project folder with the virtual environment active:

```bash
pip install -r requirements.txt            # adds argon2-cffi
python -m app.manage create-admin admin --name "Your Name"      # asks for a password, hidden
sudo systemctl restart reflex-hub          # only if the service was already running
```

Then open the app, sign in as that administrator, and use **Staff accounts → Add health worker**. The screen shows a one-time temporary password. Give it to the worker; they must choose their own at first sign-in.

There is no default password and no web page that can create an administrator. If the only administrator forgets their password:

```bash
python -m app.manage reset-password admin
```

Other commands: `create-chw`, `unlock USERNAME`, `list`, `reset-demo-data` (below). Add `--password-stdin` to read a password from standard input in scripts.

## Day-to-day behaviour

- Sign in once. You stay signed in while you use the app, and are signed out after **8 hours without use**, and never later than **12 hours** after signing in. Adjust with `REFLEX_SESSION_IDLE_HOURS` and `REFLEX_SESSION_MAX_HOURS`.
- Handing the phone to a child for the picture game or sticker chart does not interrupt anything: the session is the CHW's and is not shortened by that.
- **If a session ends** (idle too long, account deactivated, password reset), unsent answers stay on the phone. After signing in again they are restored, as after a power cut.
- **Signing out on purpose** also removes unsent drafts from that phone. If a different person signs in on a phone that still holds someone else's drafts, those drafts are removed too.
- Five wrong passwords lock that username for 30 seconds, doubling with each further miss up to 15 minutes. An administrator can unlock it (Staff accounts → Unlock) or run `python -m app.manage unlock USERNAME`.
- Deactivating an account, or resetting its password, signs that person out of every device immediately. Accounts are never deleted, so the record of who did what stays valid.

## Who recorded what

New clinical rows carry the staff member who made them, in nullable columns added without touching existing data:

| Table | Column | Meaning |
|---|---|---|
| `consent` | `recorded_by_staff_id` | the CHW who recorded it. `given_by_person_id` still says who gave consent (the mother, or the mother for her child) |
| `encounter` | `staff_id` | who ran the visit, check-in, EPDS, milestone, M-CHAT or play task |
| `review` | `reviewed_by_staff_id` | who accepted or overrode a flag |
| `referral` | `status_updated_by_staff_id` | who last changed the referral status |
| `person` | `created_by_staff_id` | who registered the mother or recorded the baby's birth |

Rows written before sign-in existed have `NULL` there (meaning "before staff accounts"). The staff member always comes from the verified session, never from anything the browser sends. Not covered: `observation`, `guidance_event`, `play_log` (the sticker tap) and the update to `pregnancy` at birth; the encounter or person row beside them carries the attribution.

## Security notes

| Topic | What is done |
|---|---|
| Passwords | Argon2id (`argon2-cffi`, 19 MiB memory, 2 passes, 1 lane: OWASP's minimum profile, chosen to be gentle on the Pi). Minimum 8 characters, a short list of obvious passwords refused, no composition rules. Hashes never leave the server. |
| Sessions | A random 256-bit token in an `HttpOnly`, `SameSite=Lax` cookie. Only the token's SHA-256 is stored, so a copy of the database cannot be used to sign in, and there is no signing secret to protect. Responses under `/api/` are `Cache-Control: no-store`. |
| CSRF | Every POST/PUT/DELETE must carry `X-Reflex: 1` (the app adds it; a page on another site cannot), and a browser `Origin`, if sent, must match the hub's address. If you serve the hub under a different public name, list it in `REFLEX_ALLOWED_ORIGINS` (comma-separated). |
| Account enumeration | An unknown username and a wrong password give the same message. A deactivated account is announced only after the correct password. |
| Brute force | Per-username lockout plus a coarse per-address limit (30 misses in 10 minutes). |
| No public API map | `/openapi.json` is switched off. |

### HTTP versus HTTPS: read this before using real patient data

The hub is served over plain **HTTP**. A Wi-Fi password protects the radio link from people who do not have it, but it does **not** make HTTP safe for sensitive information:

- Anyone who knows the hotspot password (every phone that uses it) can capture other devices' traffic on that network: staff passwords, session cookies and patient records are readable in transit.
- HTTP gives no proof that a phone is talking to the real hub. A device impersonating the hub's address could collect passwords.
- `HttpOnly` stops scripts from reading the session cookie, but it does not help against network capture.

The code is ready for HTTPS, but turning it on is a deployment step that **has not been done or tested here**:

1. Serve the hub over TLS (for example `uvicorn app.main:app --host 0.0.0.0 --port 8443 --ssl-keyfile key.pem --ssl-certfile cert.pem`, or a small reverse proxy such as Caddy or nginx in front of port 8000). On a hub with no internet, certificates must come from your own certificate authority or a self-signed certificate that each phone is set up to trust; otherwise browsers warn on every visit. Generating and installing them is the work of whoever deploys the hub.
2. Set `REFLEX_COOKIE_SECURE=1` (for example in `reflex-hub.service`) so the browser only sends the session cookie over HTTPS. **Do not set it while the hub is still on HTTP**: browsers then drop the cookie and nobody can sign in.

Until that is done, treat the hub as a demonstration or pilot system with test data, and decide with the clinical and data-protection leads whether HTTP is acceptable for the real deployment.

## Demo data reset

```bash
python -m app.manage reset-demo-data
```

**For demonstration data only.** It lists what it will erase and waits for you to type `DELETE DEMO DATA`. It then permanently deletes every patient, household, consent, visit, assessment, review, referral and child record. Staff accounts and sessions are not touched. It cannot be undone, so never use it on real clinical data. (It replaces the old `rm data/reflex.db*`, which would also delete the staff accounts.)

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `REFLEX_DB` | `data/reflex.db` | database path (unchanged) |
| `REFLEX_SESSION_IDLE_HOURS` | `8` | sign out after this long without use |
| `REFLEX_SESSION_MAX_HOURS` | `12` | absolute maximum session length |
| `REFLEX_COOKIE_SECURE` | off | `1` only when served over HTTPS |
| `REFLEX_ALLOWED_ORIGINS` | none | extra allowed `Origin` values, comma-separated |

## Verifying it on your computer

From the project folder, in a virtual environment (Python 3.11 or newer):

```bash
pip install -r requirements-dev.txt
python -m pytest tests -v                  # auth, roles, sessions, workflows, migration

cd frontend
npm install
npm run build                              # regenerates src/routeTree.gen.ts and rebuilds ../app/web
npm run typecheck
npm run lint
```

End-to-end against a running hub (scratch database, so nothing real is touched):

```bash
export REFLEX_DB=/tmp/reflex-smoke.db
python -m app.manage create-chw smoke --name "Smoke Test" --password-stdin <<< "smoke test passphrase"
./run.sh &
REFLEX_SMOKE_USER=smoke REFLEX_SMOKE_PASS="smoke test passphrase" python tests/smoke_test.py http://127.0.0.1:8000
```

## Known limitations

- A session that ends in the middle of a screen sends the person to the sign-in page with a full page load; unsent answers saved as drafts come back, but the picture-game state in memory does not.
- Passwords travel over HTTP until HTTPS is set up (above).
- No self-service password recovery (the hub is offline, so there is no email): an administrator resets it.
- No second factor and no sign-in history screen. `last_login_at` is shown to administrators.
- Only attribution columns listed above exist; older rows have none.
- Swahili strings for the new screens are a draft and need a native-speaking reviewer, like the rest.
