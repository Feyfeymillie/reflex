# Pregnancy risk model trained on Tanzania DHS 2022

Outcome: **perinatal death (stillbirth 7+ months, or death in first 7 days)**. Unit: pregnancies ending in the 60 months before interview (live births + stillbirths).
Data: 10,819 pregnancies, 420 outcomes (none: 10399, early_neonatal: 224, stillbirth: 196), 628 clusters.
Held out: 25% of survey clusters (v001), weighted by v005.

## Held-out results

| Model | AUC | Avg precision | Baseline rate |
|---|---|---|---|
| XGBoost (app model) | 0.603 (95% CI 0.542–0.671) | 0.0536 | 0.032 |
| Logistic regression, same features | 0.569 | 0.058 | |
| Simple rule (age <18 or ≥35, 5+ births, prior stillbirth) | 0.566 | 0.0377 | |

5-fold cross-validation over all clusters (same settings): AUC 0.579 (folds 0.634, 0.556, 0.549, 0.588, 0.568).
AUC 0.5 is a coin flip. Read every number below with that in mind.

## Bands on held-out pregnancies

| Band | Share of pregnancies | Outcome rate | × baseline | Share of all outcomes caught |
|---|---|---|---|---|
| low | 69% | 2.54% | 0.79 | 55% |
| medium | 27% | 3.79% | 1.18 | 32% |
| high | 4% | 11.87% | 3.71 | 13% |

## Features

| Feature | Used | Coverage | Mean abs SHAP (test) |
|---|---|---|---|
| age_years | yes | 100% | 0.0674 |
| gestation_weeks | no | 0% | 0.0 |
| gravida | yes | 100% | 0.016 |
| parity | yes | 100% | 0.1172 |
| anc_visits | no | 0% | 0.0 |
| prior_preeclampsia | no | 0% | 0.0 |
| prior_stillbirth | yes | 100% | 0.0647 |
| prior_csection | no | 0% | 0.0 |
| prior_pph | no | 0% | 0.0 |
| bp_sys | no | 0% | 0.0 |
| bp_dia | no | 0% | 0.0 |
| muac | no | 0% | 0.0 |
| danger_sign_count | no | 0% | 0.0 |

## Caveats

- DHS has no pre-eclampsia, PPH, blood pressure in pregnancy, MUAC, gestation at visit or danger signs. The model learned nothing about them; the app's danger-sign and BP rules still apply and still override the model.
- History is self-reported by the mother, recalled up to 5 years later.
- prior_csection is NOT used: too few known cases and a clinically backwards effect (see script docstring).
- 10% of each history answer was blanked in training rows so a question the CHW skips scores as average, not high.
- Depth-1 trees: each feature adds risk on its own, no interactions. Deeper trees scored lower in cross-validation.
- ANC visits are NOT used: DHS counts them after the pregnancy ended, so short pregnancies look like low attenders.
- Population survey, not clinic patients. A clinic population is sicker; expect calibration to drift.
- This is a screening aid for prioritising visits, not a diagnosis.
