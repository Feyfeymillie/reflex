# REFLEX AI Module 2: intervention plans

Adds, on top of the Module 1 web app: a multi-condition risk dashboard (10 pregnancy conditions),
per-condition intervention checklists with timestamps, a referral tracker, follow-up and postpartum
steps, missing-test prompts, and a Zanzibar referral facility list.

## New files
- src/lib/conditions.ts, protocols.ts, interventions.ts, facilities.ts, alerts.ts
- src/components/ConditionDashboard.tsx, InterventionPlan.tsx

## Files that REPLACE the Module 1 versions
- src/lib/store.ts (fixes: "Non-Reactive" shown as a flag; visit-to-visit score change)
- src/routes/patient.$id.tsx (adds the dashboard and plan; removes the old complications box)
- src/routes/referral.tsx (Zanzibar facilities; no fake distances, beds or phone numbers)

## How to use
Copy this `src` folder over the Module 1 `src` folder, then `npm install` and `npm run dev`.
No new packages are needed.

## Status
Prototype for decision support, not for clinical use. Scoring is rule-based and not yet validated.
Steps for some conditions were checked against the Tanzania Mainland STG (read via Prescribing Companion);
gestational diabetes and perinatal depression were not. A clinician must review before any real use.
