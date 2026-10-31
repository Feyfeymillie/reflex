import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { HeartHandshake, Save } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ConsentCard } from "@/components/ConsentCard";
import { BandBadge, BAND_LABEL } from "@/components/ChwDecision";
import { Section, TF } from "@/components/anc-fields";
import { BirthFields, OUTCOME, PLACE } from "@/components/BirthFields";
import { emptyNewborn, newbornPayload } from "@/components/NewbornFields";
import { api, errorText } from "@/lib/api";
import { finalBand, latest, loadPatients, type Consent, type Patient } from "@/lib/store";

import { t, useLang } from "@/lib/i18n";
export const Route = createFileRoute("/postpartum/")({
  head: () => ({ meta: [{ title: "Postpartum — RefleX" }] }),
  component: PostpartumList,
});

/** Who to screen first: self-harm alert, then a high-risk pregnancy, then a stillbirth. */
function priority(p: Patient) {
  const last = p.postnatal[p.postnatal.length - 1];
  const c = latest(p);
  let score = 0;
  if (last?.selfHarm) score += 100;
  if (last && ["high", "urgent"].includes(last.band)) score += 50;
  if (c && ["high", "urgent"].includes(finalBand(c))) score += 20;
  if (p.pregnancy?.outcome === "stillbirth") score += 30;
  if (!last) score += 5;
  return score;
}

function PostpartumList() {
  useLang();
  const [patients, setPatients] = useState<Patient[]>([]);
  useEffect(() => { loadPatients().then(setPatients).catch((e) => toast.error(errorText(e))); }, []);
  const sorted = useMemo(() => [...patients].sort((a, b) => priority(b) - priority(a)), [patients]);

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-2xl bg-teal/15 text-teal flex items-center justify-center"><HeartHandshake className="size-6" /></div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("Postpartum mental health")}</h1>
            <p className="text-muted-foreground text-sm">{t("EPDS screening from 2 weeks after birth. Mothers flagged in pregnancy are listed first.")}</p>
          </div>
        </div>

        <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
          <div className="font-semibold">{t("Mothers ({n})", { n: sorted.length })}</div>
          <div className="mt-3 divide-y divide-border">
            {sorted.map((p) => {
              const last = p.postnatal[p.postnatal.length - 1];
              const c = latest(p);
              return (
                <Link key={p.id} to="/postpartum/$id" params={{ id: p.id }} className="flex items-center justify-between gap-3 py-3 hover:bg-secondary/40 rounded-lg px-2">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.pregnancy?.outcome === "ongoing" || !p.pregnancy ? t("Still pregnant / birth not recorded") : `${t(p.pregnancy.outcome)} ${p.pregnancy.deliveryDate ?? ""}`}
                      {c && <> · {t("pregnancy risk")} {t(BAND_LABEL[finalBand(c)])}</>}
                    </div>
                  </div>
                  {last ? <BandBadge band={last.band} /> : <span className="text-xs text-muted-foreground">{t("not screened")}</span>}
                </Link>
              );
            })}
          </div>
        </div>

        <PostnatalEntry />
      </div>
    </AppShell>
  );
}

/** A mother first met after delivery enters here, with no pregnancy history needed. */
function PostnatalEntry() {
  useLang();
  const nav = useNavigate();
  const [f, setF] = useState({ name: "", age: "", village: "", phone: "", outcome: "", date: "", place: "", babyName: "", babySex: "", gestationAtBirthWeeks: "" });
  const [consent, setConsent] = useState<Consent>({ care: false });
  const [busy, setBusy] = useState(false);
  const [nb, setNb] = useState(emptyNewborn);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent.care) { toast.error(t("Care consent is required before anything is saved.")); return; }
    setBusy(true);
    try {
      const p = await api<Patient>("POST", "/api/v1/postnatal-entry", {
        name: f.name, age: parseInt(f.age, 10), village: f.village, phone: f.phone, consent,
        birth: { outcome: OUTCOME[f.outcome], date: f.date, place: PLACE[f.place], babyName: f.babyName,
                 babySex: f.babySex.toLowerCase() || undefined, gestationAtBirthWeeks: f.gestationAtBirthWeeks || undefined,
                 newborn: newbornPayload(nb) },
      });
      toast.success(t("Mother registered after delivery"));
      nav({ to: "/postpartum/$id", params: { id: p.id } });
    } catch (err) { toast.error(errorText(err)); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="text-xl font-bold">{t("New mother met after delivery")}</h2>
      <p className="text-sm text-muted-foreground -mt-2">{t("Many mothers first meet a CHW after birth. No pregnancy record is needed to start here.")}</p>
      <ConsentCard module="postnatal_mh" value={consent} onChange={setConsent} />
      <Section step="1" title="Mother">
        <TF label="Name" value={f.name} onChange={set("name")} placeholder="Halima Bakari" />
        <TF label="Age (years)" value={f.age} onChange={set("age")} type="number" />
        <TF label="Village" value={f.village} onChange={set("village")} />
        <TF label="Phone (optional)" value={f.phone} onChange={set("phone")} />
      </Section>
      <BirthFields f={f} set={set} nb={nb} setNb={setNb} />
      <button disabled={busy || !consent.care} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50">
        <Save className="size-4" /> {busy ? t("Saving…") : t("Register and continue to EPDS")}
      </button>
    </form>
  );
}
