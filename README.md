# RefleX hub prototype (Thursday 8 Oct build), v0.3.1

The team's React frontend, served by a Raspberry Pi 5 over its own Wi-Fi hotspot, talking to a small
Python API on the same Pi. Any phone that joins the **RefleX** Wi-Fi opens `http://10.42.0.1:8000`.
No internet anywhere. **No Node on the Pi:** the frontend is built once on a laptop into `app/web/`
(already built and included here) and the Pi only serves those files.

All three modules work end to end on one shared record:

| Module | What it does | Where the logic lives |
|---|---|---|
| 1. Pregnancy risk | RCH4 registration + ANC visits, XGBoost risk score with its top reasons, danger-sign override to URGENT | `app/pregnancy.py` |
| 2. Postpartum | Record the birth (creates the baby's record), EPDS 10 questions rule-scored, Q10 self-harm → same-day referral. A mother can start here with no pregnancy record | `app/epds.py` |
| 3. Child development | Milestones by age (corrected for preterm), play ideas with a "We did it today" sticker chart, a full-screen picture game for the child, one fixed "talk to your CHW" rule. **No score, ever** | `app/child.py`, `frontend/src/components/ChildPlay.tsx` |

**Staff sign-in (new):** every health worker has their own account; administrators manage accounts but cannot see patient records. See [`docs/AUTH.md`](docs/AUTH.md).

Shared by all three: consent per person and module (enforced in the API, not just the screens), CHW
Accept/Override-with-reason on every flag, referrals, `/dataset` page showing live model + RAM numbers.

## New in v0.3.1 (6 Oct)
- The patient, list and referral screens show the **risk level (Low / Moderate / High / URGENT) and its reasons**, never the model's raw percentage. A big "97%" reads as accuracy to judges, and the number's scale changes whenever the model or its band cut-offs change. The trend chart plots the level per visit.
- Logo: the "MamaGuard" wordmark is cropped off `frontend/src/assets/logo.png`; the shield artwork stays and the app shows "RefleX" beside it.

## New in v0.3 (6 Oct)
- **Kiswahili / English switch works everywhere.** The button in the top bar changes every screen in all three modules, including server text (findings, EPDS questions and answers, milestones, guidance, errors). Swahili is the default; the choice is kept on the phone and works offline. English strings are keys into `frontend/src/lib/sw.json` (≈570 strings, **draft Swahili**, needs a native-speaking clinician to review).
- **EPDS** uses the team's accepted 10 items, each now labelled with its domain (Anhedonia, Enjoyment, Self-blame, Anxiety, Panic, Coping, Sleep, Sadness, Crying, Self-harm). Items 1, 2, 4 score 0→3 top to bottom; 3 and 5–10 are reversed. `app/epds.py` refuses to start if any item's option order breaks that, and the smoke test checks it. Q10 > 0 still means same-day alert and referral at any total.
- **Child module is interactive:**
  - *Find the picture* (12 months and up): the parent reads "Ng'ombe yuko wapi?", the child taps or points. 2 tiles at 12–17 months, 3 at 18–23, 4 from 24. A wrong tap only wiggles; a right one gets a star and "Hongera!". Under 12 months it becomes *Look and say*: one big picture at a time to name together. Pictures are everyday Tanzanian things (cow, chicken, goat, mango, ball…) drawn by the phone's emoji font, so nothing is downloaded. It reads the question aloud only if the phone already has an offline voice for the language. Nothing is scored or saved.
  - *Sticker chart:* each play idea has "Tumefanya leo! / We did it today!". One star per idea per day, kept on the hub (`play_log` table, `POST /api/v1/children/{id}/play`).
- MamaBot answers in both languages, its false claims (automatic SMS, sync when internet returns) are gone, and the fake voice button is removed.

## The demo journey
1. **New Patient** → read the consent script, tick consent (the save button stays disabled until you do), fill the RCH4 card, *Register & Analyze*.
2. Patient page → risk, reasons, recommendation in Swahili + English → **CHW decision: Accept / Override**.
3. **After birth: postpartum check** → record the birth → postnatal consent → EPDS → result. The page shows her pregnancy risk from step 2: that is the "one record" moment.
4. **Baby: growing up** → child consent → tick Yes / Not yet → guidance → hand the phone to the child for *Find the picture* → tap "We did it today" for a sticker.
6. Tap **Kiswahili / English** on any page: everything switches.
5. **Model & data** → model version, RAM use, CPU temperature (rubric 2b), and the "not done yet" list (6b).

Power cut: unsent answers stay on the phone (saved in the browser as you type) and come back with
"Tumerejesha majibu ambayo hayakutumwa". Everything the hub confirmed is in SQLite with
`synchronous=FULL`. Rehearse the real plug-pull on the Pi; it has only been tested here as a process kill.

## Run on the Pi
After `../pi-setup-tonight.md` steps 1–4 (venv with xgboost, fastapi, uvicorn, jinja2, psutil), plus `pip install -r requirements.txt` for `argon2-cffi`:
```bash
scp -r prototype reflex@reflex-hub.local:~/reflex/          # from the laptop
ssh reflex@reflex-hub.local
cd ~/reflex/prototype && source ~/reflex/venv/bin/activate
# do NOT run model/train_synthetic_model.py: it overwrites the DHS model with the synthetic placeholder
python -m app.manage create-admin admin --name "Your Name"   # once: the first administrator (see docs/AUTH.md)
./run.sh                                    # serves app + API on 0.0.0.0:8000
# second ssh window: needs a CHW account, e.g. python -m app.manage create-chw smoke --name "Smoke Test"
REFLEX_SMOKE_USER=smoke REFLEX_SMOKE_PASS='...' python tests/smoke_test.py http://127.0.0.1:8000   # must end "ALL PASSED"
```
Start on boot (needed for the power-pull demo):
```bash
sudo cp reflex-hub.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now reflex-hub
```
The smoke test creates test mothers. Before the demo, erase the **demo** patients (staff accounts are kept): `python -m app.manage reset-demo-data`. Demo data only; never on real records. Do not `rm data/reflex.db*` any more: that also deletes the staff accounts.

## Changing the frontend (on a laptop, not the Pi)
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173, proxies /api to a hub running on localhost:8000
npm run build      # writes ../app/web; copy app/web to the Pi
```

## Training on Tanzania DHS (person A)
On a laptop with the DHS Stata files (never copy them into this folder or a zip; DHS terms forbid sharing):
```
pip install xgboost==3.2.0 pandas scikit-learn
python model/train_dhs_model.py ~/dhs/TZIR82DT.zip --survey "Tanzania DHS 2022" --dry-run   # report only
python model/train_dhs_model.py ~/dhs/TZIR82DT.zip --survey "Tanzania DHS 2022"             # writes model.json
```
Outcome is perinatal death (stillbirth 7+ months or death in the first week). Only 5 of the 13 features exist
in DHS; the rest are NaN in training and handled by the danger-sign/BP rules. Read the docstring and
`model/dhs_training_report.md` before quoting any number.

## Swapping in the real model (person A)
The API reads `model/model.json` + `model/model_meta.json` and builds inputs in the order of
`model/features.json` (13 CHW-collectable features). Train on exactly those names (NaN allowed), save
with `booster.save_model("model.json")`, write `model_meta.json` like the placeholder (version, trained_on,
label, bands, your real held-out AUC as `test_auc`), restart. Mismatched feature names stop the app at start-up
with a message naming them. The frontend needs no change.

## What changed in the team's frontend, and why
- **Build:** Lovable/TanStack Start/Cloudflare SSR → plain Vite single-page build. Same pages, same look; it now runs as static files.
- **Data:** `src/lib/store.ts` no longer uses localStorage or the hand-tuned `computeAnalysis` score. It calls the hub API; the hub scores with the model + rules. Display helpers (`riskDrivers`, `possibleComplications`, BMI) are unchanged.
- **Added:** consent card on registration, CHW decision card, postpartum and child pages, links between modules, phone-owner field, unsent-answer drafts.
- **Fonts:** Google Fonts → bundled `@fontsource` files (works with no internet; the built app makes zero outside requests, checked in a browser with all non-hub traffic blocked).
- **Removed claims nothing supports:** "94.2% validation accuracy", "11 African nations / 38 clinics / 12K patients", "African maternal model v2.4", Kenyan hospitals with invented phone numbers, "delivered via SMS". `/dataset` now shows only what the hub reports.
- Ultrasound upload is kept, stored with the visit, and labelled as not analysed by the AI.

## Files
| Path | What |
|---|---|
| `app/main.py` | JSON API (`/api/v1/...`) + serves `app/web` |
| `app/pregnancy.py`, `app/epds.py`, `app/child.py` | the three modules |
| `app/db.py`, `app/schema.sql` | SQLite (WAL, `synchronous=FULL`), subset of shared family record v0.3 + guidance_event + play_log (new, not yet in the data model doc) |
| `app/web/` | built frontend (generated; don't edit) |
| `frontend/` | frontend source |
| `model/` | feature list, model trained on Tanzania DHS 2022 (`train_dhs_model.py`, report in `dhs_training_report.md`), old synthetic placeholder script |
| `app/auth.py`, `app/auth_routes.py`, `app/manage.py` | staff sign-in, roles, sessions; account routes; command-line administration |
| `tests/smoke_test.py` | API checks across all three modules against a running hub (signs in as a CHW), standard library only |
| `tests/test_auth.py`, `tests/test_workflows.py` | pytest suite (`pip install -r requirements-dev.txt`, `python -m pytest tests`) |
| `docs/AUTH.md` | sign-in, roles, setup, HTTPS, demo reset |

## Known gaps (say these out loud, rubric 6b)
- The risk model is trained on **Tanzania DHS 2022** (10,819 pregnancies, perinatal death). It is weak: cross-validated AUC 0.58, using only age, gravida, parity and prior stillbirth, because DHS has nothing else the app collects. BP, pre-eclampsia, PPH, MUAC and danger signs are handled by rules only. Not validated on clinic patients. See `model/dhs_training_report.md`.
- Swahili is a draft; the EPDS must be replaced with the validated Swahili version. A native speaker must proofread.
- BP rules, EPDS cut-offs (10/13) and band thresholds need a clinician's sign-off.
- The picture game's emoji look different on each phone brand; on very old Android phones some may show as boxes. Test on the team's demo phones.
- The play log uses the Pi's local date: set the Pi's timezone to Africa/Dar_es_Salaam.
- Single hub: no sync, no SMS. Staff sign-in exists, but the hub is plain HTTP: see "HTTP versus HTTPS" in `docs/AUTH.md` before real patient data. Referral facilities are placeholders to fill per ward.
- MamaBot is a keyword matcher with fixed answers, not AI. It says so.
- Module 3 autism screening uses the official **M-CHAT-R** items and scoring (16-30 months). The authors' permission is needed for electronic use beyond this demo, the Swahili items are a draft (use an approved translation), and the Follow-Up interview for the Medium band is not built. The five play games are not validated: results are saved for the CHW and never scored or referred.
