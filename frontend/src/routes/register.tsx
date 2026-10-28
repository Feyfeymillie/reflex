import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { registerPatient, type ANCVisitData, type Consent, type RCH4Profile } from "@/lib/store";
import { errorText } from "@/lib/api";
import { clearDraft, useDraft } from "@/lib/draft";
import { looksLikeUltrasound } from "@/lib/scan-check";
import { ConsentCard } from "@/components/ConsentCard";
import { Upload, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { t, useLang } from "@/lib/i18n";
import {
  BLOOD_GROUPS, DangerSigns, NF, NUF, POS_NEG_NOTDONE, REACTIVE_NOTDONE, REACTIVE_UNKNOWN, RHESUS,
  Section, SF, SUGAR_UNITS, TA, TF, URINE_GLUCOSE, URINE_PROTEIN, YESNO,
} from "@/components/anc-fields";


export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Register ANC Client (RCH4) — REFLEX AI Module 1" },
      { name: "description", content: "Register a new pregnant mother using the Tanzanian RCH4 antenatal card workflow." },
      { property: "og:title", content: "Register ANC Client (RCH4) — REFLEX AI Module 1" },
      { property: "og:description", content: "RCH4-aligned antenatal registration with instant AI risk screening." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  useLang();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [complications, setComplications] = useState("");
  const [history, setHistory] = useState("");
  const [gestationWeeks, setGestationWeeks] = useState("");
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 10));
  const [bloodPressure, setBloodPressure] = useState("");
  const [weight, setWeight] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [notes, setNotes] = useState("");
  const [ultrasound, setUltrasound] = useState<string | undefined>();
  const [rch4, setRch4] = useState<RCH4Profile>({});
  const [anc, setAnc] = useState<ANCVisitData>({ visitNumber: "1" });
  const [danger, setDanger] = useState<string[]>([]);
  const [phoneOwner, setPhoneOwner] = useState("");
  const [consent, setConsent] = useState<Consent>({ care: false });
  const [saving, setSaving] = useState(false);

  const DRAFT = "reflex:draft:register";
  const draft = { name, age, complications, history, gestationWeeks, visitDate, bloodPressure, weight, symptoms, notes, rch4, anc, danger, phoneOwner };
  useDraft(DRAFT, draft, (d) => {
    setName(d.name); setAge(d.age); setComplications(d.complications); setHistory(d.history);
    setGestationWeeks(d.gestationWeeks); setVisitDate(d.visitDate); setBloodPressure(d.bloodPressure);
    setWeight(d.weight); setSymptoms(d.symptoms); setNotes(d.notes); setRch4(d.rch4); setAnc(d.anc);
    setDanger(d.danger); setPhoneOwner(d.phoneOwner);
  });

  const r = <K extends keyof RCH4Profile>(k: K) => (v: string) => setRch4((s) => ({ ...s, [k]: v }));
  const v = <K extends keyof ANCVisitData>(k: K) => (val: string) => setAnc((s) => ({ ...s, [k]: val }));

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = async () => {
      const url = rd.result as string;
      if (!(await looksLikeUltrasound(url)) && !window.confirm(t("This doesn't look like an ultrasound scan. Upload anyway?"))) { e.target.value = ""; return; }
      setUltrasound(url);
    };
    rd.readAsDataURL(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !age || !bloodPressure) { toast.error(t("Name, age and blood pressure are required")); return; }
    if (!visitDate) { toast.error(t("Visit date is required")); return; }
    if (!consent.care) { toast.error(t("Care consent is required before anything is saved.")); return; }
    const symptomText = [symptoms, ...danger].filter(Boolean).join(", ");
    setSaving(true);
    try {
      const patient = await registerPatient({
        name, age: parseInt(age, 10), gestationWeeks: parseInt(gestationWeeks, 10) || 0,
        complications, history, rch4, phoneOwner, consent,
        checkIn: {
          bloodPressure,
          weight: parseFloat(weight) || 0,
          symptoms: symptomText,
          notes: notes || "Booking visit (RCH4 registration)",
          date: new Date(visitDate).toISOString(),
          anc: { ...anc, gestationWeeks: gestationWeeks || anc.gestationWeeks, dangerSigns: danger },
          ultrasound,
        },
      });
      clearDraft(DRAFT);
      toast.success(t("ANC client registered. First visit saved and analysed on the RefleX hub."));
      nav({ to: "/patient/$id", params: { id: patient.id } });
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("New ANC Registration — RCH4 Card")}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("Booking visit for a first-time client. Follows the Tanzanian RCH4 antenatal card. Returning mothers should open their card and add a new ANC visit instead.")}
          </p>
        </div>

        <form onSubmit={submit} className="mt-6 grid lg:grid-cols-[1fr_320px] gap-6 items-start">
          <div className="space-y-5">
            <ConsentCard module="pregnancy" value={consent} onChange={setConsent} />
            <Section step="1" title="Clinic & client identification" hint="RCH4 header details">
              <TF label="Clinic / facility name" value={rch4.clinicName || ""} onChange={r("clinicName")} placeholder="Mnazi Mmoja Health Centre" />
              <TF label="RCH / ANC number" value={rch4.rchNumber || ""} onChange={r("rchNumber")} placeholder="RCH4-2026-0184" />
              <TF label="Client name" value={name} onChange={setName} placeholder="Amina Juma" />
              <TF label="Age (years)" value={age} onChange={setAge} placeholder="28" type="number" />
              <TF label="Date of birth" value={rch4.dateOfBirth || ""} onChange={r("dateOfBirth")} type="date" />
              <TF label="Phone number" value={rch4.phone || ""} onChange={r("phone")} placeholder="+255 7xx xxx xxx" />
              <SF label="Whose phone is it?" value={phoneOwner} onChange={setPhoneOwner} options={["self", "husband", "relative", "neighbour", "none"]} />
              <TF label="Village / hamlet" value={rch4.village || ""} onChange={r("village")} placeholder="Kigamboni" />
              <TF label="Ward" value={rch4.ward || ""} onChange={r("ward")} />
              <TF label="District / council" value={rch4.district || ""} onChange={r("district")} />
              <SF label="Marital status" value={rch4.maritalStatus || ""} onChange={r("maritalStatus")} options={["Married", "Single", "Cohabiting", "Widowed", "Separated"]} />
              <SF label="Education level" value={rch4.education || ""} onChange={r("education")} options={["None", "Primary", "Secondary", "College", "University"]} />
              <TF label="Occupation" value={rch4.occupation || ""} onChange={r("occupation")} placeholder="Farmer" />
            </Section>

            <Section step="2" title="Partner details" hint="Male partner involvement, as recorded on RCH4">
              <TF label="Partner name" value={rch4.partnerName || ""} onChange={r("partnerName")} />
              <TF label="Partner age" value={rch4.partnerAge || ""} onChange={r("partnerAge")} type="number" />
              <TF label="Partner occupation" value={rch4.partnerOccupation || ""} onChange={r("partnerOccupation")} />
              <SF label="Partner HIV status / tested" value={rch4.partnerHiv || ""} onChange={r("partnerHiv")} options={["Not tested", "Negative", "Positive", "Unknown"]} />
            </Section>

            <Section step="3" title="Obstetric history" hint="Gravida, para and previous pregnancy outcomes">
              <TF label="Gravida (pregnancies)" value={rch4.gravida || ""} onChange={r("gravida")} type="number" />
              <TF label="Para (deliveries)" value={rch4.para || ""} onChange={r("para")} type="number" />
              <TF label="Living children" value={rch4.livingChildren || ""} onChange={r("livingChildren")} type="number" />
              <TF label="Abortions / miscarriages" value={rch4.abortions || ""} onChange={r("abortions")} type="number" />
              <TF label="LMP (last monthly period)" value={rch4.lmp || ""} onChange={r("lmp")} type="date" />
              <TF label="EDD (expected delivery date)" value={rch4.edd || ""} onChange={r("edd")} type="date" />
              <SF label="Previous caesarean section" value={rch4.priorCsection || ""} onChange={r("priorCsection")} options={YESNO} />
              <SF label="Previous stillbirth / neonatal death" value={rch4.priorStillbirth || ""} onChange={r("priorStillbirth")} options={YESNO} />
              <SF label="Previous postpartum haemorrhage" value={rch4.priorPph || ""} onChange={r("priorPph")} options={YESNO} />
              <SF label="Previous preeclampsia / eclampsia" value={rch4.priorPreeclampsia || ""} onChange={r("priorPreeclampsia")} options={YESNO} />
              <TF label="Other previous complications" value={complications} onChange={setComplications} placeholder="None / Anaemia / Preeclampsia..." />
              <TA label="Medical & surgical history" value={history} onChange={setHistory} placeholder="Chronic conditions, medications, allergies, surgeries, TB/HIV care..." />
            </Section>

            <Section step="4" title="Baseline examination (booking visit)" hint="Visit date is mandatory and stored with this visit">
              <TF label="Visit date" value={visitDate} onChange={setVisitDate} type="date" />
              <TF label="Gestation age (weeks)" value={gestationWeeks} onChange={setGestationWeeks} placeholder="24" type="number" />
              <TF label="Blood pressure (mmHg)" value={bloodPressure} onChange={setBloodPressure} placeholder="120/80" />
              <TF label="Weight (kg)" value={weight} onChange={setWeight} placeholder="65" type="number" />
              <TF label="Height (cm)" value={rch4.height || ""} onChange={r("height")} placeholder="158" type="number" />
              <TF label="MUAC (cm)" value={anc.muac || ""} onChange={v("muac")} placeholder="24" type="number" />
              <TF label="Temperature (°C)" value={anc.temperature || ""} onChange={v("temperature")} placeholder="36.8" type="number" />
              <TF label="Pulse (bpm)" value={anc.pulse || ""} onChange={v("pulse")} placeholder="80" type="number" />
              <TF label="Fundal height (cm)" value={anc.fundalHeight || ""} onChange={v("fundalHeight")} type="number" />
              <SF label="Presentation" value={anc.presentation || ""} onChange={v("presentation")} options={["Cephalic", "Breech", "Transverse", "Not palpable"]} />
              <TF label="Fetal heart rate (bpm)" value={anc.fetalHeartRate || ""} onChange={v("fetalHeartRate")} type="number" />
              <SF label="Fetal movement" value={anc.fetalMovement || ""} onChange={v("fetalMovement")} options={["Present", "Reduced", "Absent"]} />
              <SF label="Oedema" value={anc.oedema || ""} onChange={v("oedema")} options={["None", "Mild", "Moderate", "Severe"]} />
              <DangerSigns selected={danger} onToggle={(s) => setDanger((d) => d.includes(s) ? d.filter((x) => x !== s) : [...d, s])} />
              <TA label="Other symptoms / complaints" value={symptoms} onChange={setSymptoms} placeholder="Headache, swelling, blurred vision..." />
            </Section>

            <Section step="5" title="Laboratory investigations" hint="RCH4 booking-visit laboratory screening">
              <NF label="Haemoglobin (Hb)" value={anc.hb || ""} onChange={v("hb")} placeholder="e.g., 11.5" suffix="g/dL" />
              <SF label="Blood group" value={rch4.bloodGroup || ""} onChange={r("bloodGroup")} options={BLOOD_GROUPS} />
              <SF label="Rhesus factor" value={rch4.rhesus || ""} onChange={r("rhesus")} options={RHESUS} />
              <SF label="Urine albumin / protein" value={anc.urineProtein || ""} onChange={v("urineProtein")} options={URINE_PROTEIN} />
              <SF label="Urine glucose" value={anc.urineGlucose || ""} onChange={v("urineGlucose")} options={URINE_GLUCOSE} />
              <NUF label="Fasting / random blood sugar" value={anc.bloodSugar || ""} onChange={v("bloodSugar")}
                unit={anc.bloodSugarUnit || "mmol/L"} onUnitChange={v("bloodSugarUnit")} units={SUGAR_UNITS} placeholder="e.g., 5.4" />
              <SF label="HIV / PMTCT screening" value={anc.hivTest || ""} onChange={v("hivTest")} options={REACTIVE_UNKNOWN} />
              <SF label="Syphilis (VDRL / RPR / mRDT)" value={anc.syphilisTest || ""} onChange={v("syphilisTest")} options={REACTIVE_NOTDONE} />
              <SF label="Malaria (mRDT / BS)" value={anc.malariaTest || ""} onChange={v("malariaTest")} options={POS_NEG_NOTDONE} />
              <SF label="Hepatitis B (HBsAg)" value={anc.hepatitisB || ""} onChange={v("hepatitisB")} options={POS_NEG_NOTDONE} />
            </Section>


            <Section step="6" title="Preventive services given" hint="TT/Td, IPTp, iron-folate, ITN, PMTCT">
              <SF label="TT / Td dose given" value={anc.ttDose || ""} onChange={v("ttDose")} options={["TT1", "TT2", "TT3", "TT4", "TT5", "Not given"]} />
              <SF label="IPTp-SP dose" value={anc.iptpDose || ""} onChange={v("iptpDose")} options={["IPTp1", "IPTp2", "IPTp3", "IPTp4", "Not given"]} />
              <SF label="Iron & folic acid" value={anc.ironFolate || ""} onChange={v("ironFolate")} options={YESNO} />
              <SF label="Albendazole / mebendazole" value={anc.albendazole || ""} onChange={v("albendazole")} options={YESNO} />
              <SF label="Insecticide-treated net issued" value={anc.itnGiven || ""} onChange={v("itnGiven")} options={YESNO} />
              <SF label="ARV / PMTCT started" value={anc.arvGiven || ""} onChange={v("arvGiven")} options={["Not applicable", "Yes", "No"]} />
            </Section>

            <Section step="7" title="Birth plan & follow-up" hint="Delivery and emergency preparedness">
              <SF label="Planned place of delivery" value={rch4.deliveryPlace || ""} onChange={r("deliveryPlace")} options={["Health centre", "District hospital", "Regional hospital", "Dispensary", "Home"]} />
              <TF label="Birth companion / escort" value={rch4.birthCompanion || ""} onChange={r("birthCompanion")} />
              <TF label="Transport plan" value={rch4.transportPlan || ""} onChange={r("transportPlan")} placeholder="Village ambulance / bodaboda" />
              <TF label="Identified blood donor" value={rch4.bloodDonor || ""} onChange={r("bloodDonor")} />
              <SF label="Savings for delivery" value={rch4.savings || ""} onChange={r("savings")} options={YESNO} />
              <TF label="Next visit date" value={anc.nextVisitDate || ""} onChange={v("nextVisitDate")} type="date" />
              <SF label="Referred today" value={anc.referred || ""} onChange={v("referred")} options={YESNO} />
              <TF label="Provider name / signature" value={anc.provider || ""} onChange={v("provider")} />
              <TA label="Counselling given & notes" value={notes} onChange={setNotes} placeholder="Nutrition, birth preparedness, danger-sign education, PMTCT..." />
            </Section>
          </div>

          <div className="space-y-4 lg:sticky lg:top-6">
            <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
              <label className="text-sm font-medium">{t("Ultrasound image")}</label>
              <label className="mt-3 cursor-pointer flex flex-col items-center justify-center aspect-square rounded-xl border-2 border-dashed border-border bg-secondary/40 hover:bg-secondary text-muted-foreground overflow-hidden">
                {ultrasound ? (
                  <img src={ultrasound} alt="Ultrasound preview" className="w-full h-full object-cover" />
                ) : (
                  <>
                    <Upload className="size-7 mb-2 text-primary" />
                    <span className="text-xs">{t("Tap to upload ultrasound")}</span>
                    <span className="text-[10px]">{t("JPG / PNG • stored with the visit, not analysed by the AI")}</span>
                  </>
                )}
                <input type="file" accept="image/*" onChange={onFile} className="hidden" />
              </label>
            </div>
            <div className="rounded-2xl bg-gradient-hero text-white p-6 shadow-glow">
              <div className="flex items-center gap-2 text-sm font-medium opacity-90"><Sparkles className="size-4" />{' '}{t("Scored on the RefleX hub")}</div>
              <p className="text-sm mt-2 opacity-90">{t("The booking visit is scored as soon as you save: a risk model plus danger-sign rules. Any danger sign sends her to the facility whatever the score. The CHW makes the final decision.")}</p>
            </div>
            <button type="submit" disabled={saving || !consent.care} className="w-full disabled:opacity-50 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 shadow-card">
              <Save className="size-4" /> {saving ? "Saving…" : "Register & Analyze"}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
