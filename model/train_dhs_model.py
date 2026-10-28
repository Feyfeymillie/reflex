"""Train the pregnancy risk model on Tanzania DHS data (laptop, not the Pi).

    python model/train_dhs_model.py /path/to/TZIR82FL.DTA            # or the survey .zip
    python model/train_dhs_model.py /path/to/TZIR82FL.DTA --dry-run  # metrics + report only

Writes model.json, model_meta.json and dhs_training_report.md next to this file. The Pi only
loads model.json; it never sees DHS data. DHS terms forbid sharing the microdata, so keep the
.DTA files out of the prototype folder and out of any zip.

What DHS can and cannot give the 13 app features (see features.json):
  age_years         age at the end of the index pregnancy, (p3 - v011) / 12
  gravida           pregnancy order of the index pregnancy (this one included)
  parity            earlier pregnancies that ended in a live birth or stillbirth
  prior_stillbirth  any earlier pregnancy that ended in a stillbirth
  prior_csection    built (m17 on earlier births in the 5-year window) but OFF by default
                    (--use-cs): in TDHS 2022 only 40 index pregnancies have a known prior
                    caesarean, the model learnt "caesarean = protective", which is clinically
                    backwards, and its 0/NaN split mostly encodes first pregnancy vs not.
  anc_visits        m14, total ANC visits. OFF by default (--use-anc): it is counted after the
                    pregnancy ended, so a baby stillborn at 7 months had fewer weeks to attend.
                    That is reverse causation, and the app asks "visits so far", which differs.
  NOT IN DHS (left NaN, the model learns nothing from them; the app's rules still use them):
  gestation_weeks, prior_preeclampsia, prior_pph, bp_sys, bp_dia, muac, danger_sign_count

Outcome (label): perinatal death = stillbirth (pregnancy of 7+ months born dead, DHS-8 p32 == 2)
or a live birth who died in the first 7 days. Unit: one pregnancy ending in the 5 years before
interview, live birth or stillbirth (miscarriages/abortions are excluded: they cannot have the
outcome). Surveys without a pregnancy history (DHS-7 and earlier) fall back to early neonatal
death among live births, with prior_stillbirth NaN.

Weights: v005 / 1e6 in training and in every metric. Test set: 25% of clusters (v001) held out,
so women from the same village never sit on both sides.
"""
import argparse
import json
import re
import sys
import tempfile
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import GroupKFold, GroupShuffleSplit

HERE = Path(__file__).resolve().parent
FEATURES = [f["name"] for f in json.loads((HERE / "features.json").read_text())["features"]]
NOT_IN_DHS = ["gestation_weeks", "prior_preeclampsia", "prior_pph", "bp_sys", "bp_dia", "muac", "danger_sign_count"]
WINDOW_MONTHS = 60
SEED = 42


# ---------------- loading ----------------

def find_ir(path: Path, tmp: Path) -> Path:
    """Accept the IR .DTA itself, or a zip (survey or IR) and pull the IR .DTA out of it."""
    if path.suffix.lower() == ".dta":
        return path
    if path.suffix.lower() != ".zip":
        sys.exit(f"Expected a Stata .DTA or a .zip, got {path.name}")
    with zipfile.ZipFile(path) as z:
        names = [n for n in z.namelist() if n.lower().endswith(".dta")]
        ir = [n for n in names if re.search(r"ir\w*\.dta$", Path(n).name.lower())]
        if not ir:
            inner = [n for n in z.namelist() if re.search(r"ir\w*dt\.zip$", Path(n).name.lower())]
            if inner:
                z.extract(inner[0], tmp)
                return find_ir(tmp / inner[0], tmp)
            sys.exit(f"No Individual Recode (..IR..DTA) in {path.name}. Files: {names[:20]}")
        z.extract(ir[0], tmp)
        return tmp / ir[0]


def load_ir(dta: Path) -> pd.DataFrame:
    with pd.read_stata(dta, iterator=True, convert_categoricals=False) as r:
        cols = list(r.variable_labels().keys())
    keep = re.compile(r"^(caseid|v001|v005|v008|v011|v012|v201|"
                      r"pidx_\d+|pord_\d+|p0_\d+|p3_\d+|p5_\d+|p6_\d+|p19_\d+|p20_\d+|p32_\d+|"
                      r"bidx_\d+|bord_\d+|b0_\d+|b3_\d+|b5_\d+|b6_\d+|"
                      r"midx_\d+|m14_\d+|m17_\d+)$")
    use = [c for c in cols if keep.match(c)]
    print(f"Reading {len(use)} of {len(cols)} columns from {dta.name} ...")
    df = pd.read_stata(dta, columns=use, convert_categoricals=False)
    df.columns = [c.lower() for c in df.columns]
    return df


def wide_to_long(df, prefix_vars, index_var):
    """DHS wide slots (p32_01, p32_02, ...) -> one row per slot."""
    slots = sorted({c.split("_")[1] for c in df.columns if c.startswith(index_var + "_")})
    frames = []
    for s in slots:
        sub = pd.DataFrame({"caseid": df["caseid"], "slot": int(s)})
        for v in prefix_vars:
            col = f"{v}_{s}"
            sub[v] = df[col].values if col in df.columns else np.nan
        frames.append(sub)
    out = pd.concat(frames, ignore_index=True)
    return out[out[index_var].notna()]


# ---------------- building the analysis table ----------------

def build_from_pregnancy_history(df):
    """DHS-8: p-variables hold every pregnancy (live birth, stillbirth, miscarriage, abortion)."""
    w = df.set_index("caseid")
    preg = wide_to_long(df, ["pidx", "pord", "p0", "p3", "p5", "p6", "p19", "p20", "p32"], "pidx")
    preg = preg.join(w[["v001", "v005", "v008", "v011"]], on="caseid")
    # the pregnancy history counts pregnancies, but twins appear as two rows: keep one per pregnancy
    preg = preg.sort_values(["caseid", "p3", "p32"]).drop_duplicates(["caseid", "pord"], keep="last")
    preg = preg.sort_values(["caseid", "pord"])

    # history BEFORE each pregnancy, from all earlier pregnancies (any time, not only the window)
    g = preg.groupby("caseid")
    preg["is_birth"] = preg["p32"].isin([1, 2]).astype(int)
    preg["is_sb"] = (preg["p32"] == 2).astype(int)
    preg["parity"] = g["is_birth"].cumsum() - preg["is_birth"]
    preg["prior_stillbirth"] = ((g["is_sb"].cumsum() - preg["is_sb"]) > 0).astype(float)
    preg["gravida"] = preg["pord"]

    months_ago = preg["v008"] - preg["p3"]
    idx = preg[(months_ago < WINDOW_MONTHS) & (months_ago >= 1) & preg["p32"].isin([1, 2])].copy()
    idx["age_years"] = ((idx["p3"] - idx["v011"]) / 12).round()
    # label is set in attach_birth_history (b6/p6 age at death: 1dd days, so 100-106 = day 0-6)
    return idx, "perinatal death (stillbirth 7+ months, or death in first 7 days)"


def maternity_slots(df):
    """m-variables sit in their own slots (m14_1 .. m14_6), linked to the birth history by midx."""
    slots = sorted({c.split("_")[1] for c in df.columns if c.startswith("midx_")}, key=int)
    frames = [pd.DataFrame({"caseid": df["caseid"], "bidx": df[f"midx_{s}"],
                            "m14": df.get(f"m14_{s}", np.nan), "m17": df.get(f"m17_{s}", np.nan)}) for s in slots]
    m = pd.concat(frames, ignore_index=True)
    return m[m["bidx"].notna()].drop_duplicates(["caseid", "bidx"])


def attach_birth_history(idx, df):
    """Live-birth survival (b5/b6), ANC (m14) and caesarean (m17) live on the birth-history slots.
    Live births are matched to them by (caseid, birth month). Prior caesarean is computed from births
    strictly BEFORE the index pregnancy, so stillbirths and live births are treated the same way
    (otherwise missingness itself would leak the label)."""
    births = wide_to_long(df, ["bidx", "bord", "b3", "b5", "b6"], "bidx")
    births = births.merge(maternity_slots(df), on=["caseid", "bidx"], how="left")
    for v in ("m14", "m17"):
        births.loc[births[v] > 90, v] = np.nan  # 98 don't know, 99 missing
    b = births.groupby(["caseid", "b3"], as_index=False).agg(
        b5=("b5", "min"), b6=("b6", "min"), m14=("m14", "max"), m17=("m17", "max"))

    idx = idx.merge(b.rename(columns={"b3": "p3"}), on=["caseid", "p3"], how="left")
    matched = idx.loc[idx["p32"] == 1, "b5"].notna().mean()
    print(f"live births matched to birth history: {matched:.1%}")
    # survival: prefer the birth history, fall back to the pregnancy-history copy
    alive = idx["b5"].fillna(idx["p5"])
    age_death = idx["b6"].fillna(idx["p6"])
    early_nnd = (idx["p32"] == 1) & (alive == 0) & age_death.between(100, 106)
    idx["y"] = ((idx["p32"] == 2) | early_nnd).astype(int)
    idx["label_part"] = np.where(idx["p32"] == 2, "stillbirth", np.where(early_nnd, "early_neonatal", "none"))

    # prior caesarean from earlier births with a known m17 (DHS asks it for the 5-year window only)
    pairs = idx[["caseid", "p3"]].merge(b[["caseid", "b3", "m17"]], on="caseid")
    pairs = pairs[(pairs["b3"] < pairs["p3"]) & pairs["m17"].notna()]
    pcs = pairs.groupby(["caseid", "p3"])["m17"].max().rename("prior_csection").reset_index()
    idx = idx.merge(pcs, on=["caseid", "p3"], how="left")
    idx.loc[idx["parity"] == 0, "prior_csection"] = 0.0  # no earlier birth: nothing to have been a caesarean
    idx["anc_visits"] = idx["m14"]
    return idx


def build_from_birth_history(df):
    """DHS-7 and earlier: live births only, so the label is early neonatal death."""
    w = df.set_index("caseid")
    b = wide_to_long(df, ["bidx", "bord", "b0", "b3", "b5", "b6"], "bidx")
    b = b.merge(maternity_slots(df), on=["caseid", "bidx"], how="left")
    b = b.join(w[["v001", "v005", "v008", "v011"]], on="caseid")
    b = b.sort_values(["caseid", "b3", "b6"]).drop_duplicates(["caseid", "b3"], keep="first")
    months_ago = b["v008"] - b["b3"]
    idx = b[(months_ago < WINDOW_MONTHS) & (months_ago >= 1)].copy()
    idx["age_years"] = ((idx["b3"] - idx["v011"]) / 12).round()
    idx["gravida"] = np.nan  # birth order is not pregnancy order (miscarriages missing)
    idx["parity"] = idx["bord"] - 1
    idx["prior_stillbirth"] = np.nan
    idx["y"] = ((idx["b5"] == 0) & idx["b6"].between(100, 106)).astype(int)
    idx["label_part"] = np.where(idx["y"] == 1, "early_neonatal", "none")
    for v in ("m14", "m17"):
        idx.loc[idx[v] > 90, v] = np.nan
    idx["anc_visits"] = idx["m14"]
    idx["prior_csection"] = np.nan
    idx["p3"] = idx["b3"]
    return idx, "early neonatal death (live births dying in first 7 days); no stillbirths in this survey"


# ---------------- metrics ----------------

def wquantile(x, w, q):
    o = np.argsort(x)
    cw = np.cumsum(w[o]) / w.sum()
    return float(x[o][np.searchsorted(cw, q)])


def band_table(y, p, w, bands):
    out = []
    base = np.average(y, weights=w)
    for name, lo, hi in (("low", -1, bands["medium"]), ("medium", bands["medium"], bands["high"]), ("high", bands["high"], 2)):
        m = (p >= lo) & (p < hi)
        share = w[m].sum() / w.sum()
        rate = np.average(y[m], weights=w[m]) if m.any() else float("nan")
        capture = (w[m] * y[m]).sum() / (w * y).sum()
        out.append({"band": name, "share_of_pregnancies": round(share, 3), "outcome_rate": round(rate, 4),
                    "times_baseline": round(rate / base, 2), "share_of_all_outcomes": round(capture, 3)})
    return out


def metrics(y, p, w):
    return {"auc": round(roc_auc_score(y, p, sample_weight=w), 3),
            "avg_precision": round(average_precision_score(y, p, sample_weight=w), 4),
            "baseline_rate": round(float(np.average(y, weights=w)), 4)}


def boot_auc_ci(y, p, w, groups, n=300):
    rng = np.random.default_rng(SEED)
    ug = np.unique(groups)
    pos = {g: np.flatnonzero(groups == g) for g in ug}
    aucs = []
    for _ in range(n):
        ix = np.concatenate([pos[g] for g in rng.choice(ug, len(ug))])
        if y[ix].min() == y[ix].max():
            continue
        aucs.append(roc_auc_score(y[ix], p[ix], sample_weight=w[ix]))
    return [round(float(np.percentile(aucs, 2.5)), 3), round(float(np.percentile(aucs, 97.5)), 3)]


# ---------------- main ----------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("data", type=Path)
    ap.add_argument("--use-anc", action="store_true", help="include m14 ANC visits (reverse-causal, see docstring)")
    ap.add_argument("--use-cs", action="store_true", help="include prior_csection (tiny n in TDHS 2022, see docstring)")
    ap.add_argument("--dry-run", action="store_true", help="do not overwrite model.json / model_meta.json")
    ap.add_argument("--survey", default=None, help="label for the report, e.g. 'Tanzania DHS 2022'")
    a = ap.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        dta = find_ir(a.data, Path(tmp))
        df = load_ir(dta)
    survey = a.survey or dta.stem.upper()

    has_preg_history = any(c.startswith("p32_") for c in df.columns)
    if has_preg_history:
        idx, label = build_from_pregnancy_history(df)
        idx = attach_birth_history(idx, df)
    else:
        idx, label = build_from_birth_history(df)
    print(f"{survey}: {'pregnancy history (DHS-8)' if has_preg_history else 'birth history only'}; "
          f"{len(idx)} pregnancies, {int(idx['y'].sum())} outcomes")

    used = (["age_years", "gravida", "parity", "prior_stillbirth"] + (["prior_csection"] if a.use_cs else [])
            + (["anc_visits"] if a.use_anc else []))
    X = pd.DataFrame({f: (idx[f] if f in used else np.nan) for f in FEATURES}).astype(float)
    y = idx["y"].to_numpy()
    w = (idx["v005"] / 1e6).to_numpy()
    groups = idx["v001"].to_numpy()

    coverage = {f: round(float(X[f].notna().mean()), 3) for f in FEATURES}
    # guard: a feature whose missingness differs by outcome would let the model read the label
    for f in used:
        gap = abs(X.loc[y == 1, f].isna().mean() - X.loc[y == 0, f].isna().mean())
        if gap > 0.10:
            sys.exit(f"{f}: missing rate differs by {gap:.0%} between outcome groups (label leak). Fix before training.")

    tr, te = next(GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=SEED).split(X, y, groups))
    # inner split of the training clusters for early stopping
    itr, iva = next(GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=SEED + 1).split(tr, groups=groups[tr]))
    itr, iva = tr[itr], tr[iva]

    params = {"objective": "binary:logistic", "eval_metric": "logloss", "max_depth": 1, "eta": 0.05,
              "min_child_weight": 5, "subsample": 0.8, "colsample_bytree": 1.0, "lambda": 5.0,
              "nthread": 4, "seed": SEED}
    d = lambda ix: xgb.DMatrix(X.iloc[ix], label=y[ix], weight=w[ix], feature_names=FEATURES, missing=np.nan)
    # In DHS the history answers are never blank, but a CHW can skip them in the app. Without blanks in
    # training XGBoost sends a blank down an arbitrary branch (we saw a skipped "prior stillbirth"
    # score as High). Blank 10% of each history answer in TRAINING rows only, so a blank learns the
    # average risk. Test rows stay complete.
    Xm = X.copy()
    rng = np.random.default_rng(SEED)
    for f in [f for f in used if f != "age_years"]:
        Xm.loc[rng.random(len(Xm)) < 0.10, f] = np.nan
    dt = lambda ix: xgb.DMatrix(Xm.iloc[ix], label=y[ix], weight=w[ix], feature_names=FEATURES, missing=np.nan)
    es = xgb.train(params, dt(itr), num_boost_round=1000, evals=[(d(iva), "val")],
                   early_stopping_rounds=50, verbose_eval=False)
    n_rounds = max(es.best_iteration + 1, 20)
    booster = xgb.train(params, dt(tr), num_boost_round=n_rounds)
    p_te = booster.predict(d(te))

    # comparisons on the same held-out clusters
    lr_cols = [c for c in used]
    Xl = X[lr_cols].copy()
    for c in lr_cols:
        Xl[c + "_missing"] = Xl[c].isna().astype(float)
        Xl[c] = Xl[c].fillna(Xl[c].iloc[tr].median() if Xl[c].iloc[tr].notna().any() else 0)
    Xl["age_lt18"] = (X["age_years"] < 18).astype(float)
    Xl["age_ge35"] = (X["age_years"] >= 35).astype(float)
    lr = LogisticRegression(max_iter=2000).fit(Xl.iloc[tr], y[tr], sample_weight=w[tr])
    p_lr = lr.predict_proba(Xl.iloc[te])[:, 1]
    # the classic rule a CHW already uses: age <18 or >=35, 5+ previous births, previous stillbirth
    rule = ((X["age_years"] < 18) | (X["age_years"] >= 35) | (X["parity"] >= 5) | (X["prior_stillbirth"] == 1)).astype(float).to_numpy()

    # bands from TRAINING predictions: top 10% of pregnancies = high, next 20% = medium
    p_tr = booster.predict(d(tr))
    bands = {"medium": round(wquantile(p_tr, w[tr], 0.70), 4), "high": round(wquantile(p_tr, w[tr], 0.90), 4)}

    yt, wt, gt = y[te], w[te], groups[te]
    res = {
        "xgboost": {**metrics(yt, p_te, wt), "auc_95ci_cluster_bootstrap": boot_auc_ci(yt, p_te, wt, gt)},
        "logistic_regression": metrics(yt, p_lr, wt),
        "simple_rule_age_parity_stillbirth": metrics(yt, rule[te], wt),
    }
    # 5-fold grouped CV on all clusters: one 25% split is noisy with ~400 outcomes
    cv = []
    for ftr, fte in GroupKFold(5).split(X, y, groups):
        bcv = xgb.train(params, dt(ftr), num_boost_round=n_rounds)
        cv.append(round(float(roc_auc_score(y[fte], bcv.predict(d(fte)), sample_weight=w[fte])), 3))
    res["xgboost"]["cv5_auc_by_fold"] = cv
    res["xgboost"]["cv5_auc_mean"] = round(float(np.mean(cv)), 3)
    contrib = booster.predict(d(te), pred_contribs=True)[:, :-1]
    shap_mean = {f: round(float(np.average(np.abs(contrib[:, i]), weights=wt)), 4) for i, f in enumerate(FEATURES)}

    n_pos = int(y.sum())
    meta = {
        "model_version": f"dhs-{survey.lower().replace(' ', '-')}-0.1",
        "trained_on": f"{survey} (DHS Program microdata, survey-weighted). Not validated on clinic patients.",
        "label": label,
        "unit": f"pregnancies ending in the {WINDOW_MONTHS} months before interview (live births + stillbirths)",
        "n_pregnancies": int(len(idx)), "n_outcomes": n_pos, "n_clusters": int(len(np.unique(groups))),
        "label_breakdown": idx["label_part"].value_counts().to_dict(),
        "features_used": used,
        "features_not_in_dhs": [f for f in FEATURES if f not in used],
        "feature_coverage": coverage,
        "held_out": "25% of survey clusters (v001), weighted by v005",
        "test_auc": res["xgboost"]["cv5_auc_mean"],  # shown on the app's model page; 5-fold grouped CV
        "test": res,
        "test_bands": band_table(yt, p_te, wt, bands),
        "mean_abs_shap_test": shap_mean,
        "boost_rounds": n_rounds,
        "xgboost_version": xgb.__version__,
        "bands": bands,
        "bands_rule": "medium = top 30% of training pregnancies by score, high = top 10%",
        "features": FEATURES,
    }
    print(json.dumps({k: meta[k] for k in ("n_pregnancies", "n_outcomes", "label_breakdown", "test", "test_bands", "bands")}, indent=2))

    write_report(meta, survey, a.use_anc)
    if not a.dry_run:
        booster.save_model(HERE / "model.json")
        (HERE / "model_meta.json").write_text(json.dumps(meta, indent=2))
        print("Saved model.json and model_meta.json. Restart the app to load them.")


def write_report(m, survey, use_anc):
    t = m["test"]
    x = t["xgboost"]
    lines = [
        f"# Pregnancy risk model trained on {survey}", "",
        f"Outcome: **{m['label']}**. Unit: {m['unit']}.",
        f"Data: {m['n_pregnancies']:,} pregnancies, {m['n_outcomes']:,} outcomes "
        f"({', '.join(f'{k}: {v}' for k, v in m['label_breakdown'].items())}), {m['n_clusters']} clusters.",
        f"Held out: {m['held_out']}.", "",
        "## Held-out results", "",
        "| Model | AUC | Avg precision | Baseline rate |", "|---|---|---|---|",
        f"| XGBoost (app model) | {x['auc']} (95% CI {x['auc_95ci_cluster_bootstrap'][0]}–{x['auc_95ci_cluster_bootstrap'][1]}) | {x['avg_precision']} | {x['baseline_rate']} |",
        f"| Logistic regression, same features | {t['logistic_regression']['auc']} | {t['logistic_regression']['avg_precision']} | |",
        f"| Simple rule (age <18 or ≥35, 5+ births, prior stillbirth) | {t['simple_rule_age_parity_stillbirth']['auc']} | {t['simple_rule_age_parity_stillbirth']['avg_precision']} | |",
        "", f"5-fold cross-validation over all clusters (same settings): AUC {x['cv5_auc_mean']} (folds {', '.join(map(str, x['cv5_auc_by_fold']))}).",
        "AUC 0.5 is a coin flip. Read every number below with that in mind.",
        "", "## Bands on held-out pregnancies", "",
        "| Band | Share of pregnancies | Outcome rate | × baseline | Share of all outcomes caught |", "|---|---|---|---|---|",
        *[f"| {b['band']} | {b['share_of_pregnancies']:.0%} | {b['outcome_rate']:.2%} | {b['times_baseline']} | {b['share_of_all_outcomes']:.0%} |" for b in m["test_bands"]],
        "", "## Features", "",
        "| Feature | Used | Coverage | Mean abs SHAP (test) |", "|---|---|---|---|",
        *[f"| {f} | {'yes' if f in m['features_used'] else 'no'} | {m['feature_coverage'][f]:.0%} | {m['mean_abs_shap_test'][f]} |" for f in m["features"]],
        "", "## Caveats", "",
        "- DHS has no pre-eclampsia, PPH, blood pressure in pregnancy, MUAC, gestation at visit or danger signs. "
        "The model learned nothing about them; the app's danger-sign and BP rules still apply and still override the model.",
        "- History is self-reported by the mother, recalled up to 5 years later.",
        "- prior_csection " + ("IS used, with very few known cases." if "prior_csection" in m["features_used"] else
                               "is NOT used: too few known cases and a clinically backwards effect (see script docstring)."),
        "- 10% of each history answer was blanked in training rows so a question the CHW skips scores as average, not high.",
        "- Depth-1 trees: each feature adds risk on its own, no interactions. Deeper trees scored lower in cross-validation.",
        "- ANC visits " + ("ARE used. Caution: counted after the pregnancy ended (reverse causation)." if use_anc
                           else "are NOT used: DHS counts them after the pregnancy ended, so short pregnancies look like low attenders."),
        "- Population survey, not clinic patients. A clinic population is sicker; expect calibration to drift.",
        "- This is a screening aid for prioritising visits, not a diagnosis.",
    ]
    (HERE / "dhs_training_report.md").write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
