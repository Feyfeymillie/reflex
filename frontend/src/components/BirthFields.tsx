import { Section, SF, TF } from "@/components/anc-fields";
import { NewbornFields, type Newborn } from "@/components/NewbornFields";

export const OUTCOME: Record<string, string> = { "Live birth": "live_birth", Stillbirth: "stillbirth", Miscarriage: "miscarriage" };
export const PLACE: Record<string, string> = { "Health facility": "facility", Home: "home", "On the way": "en_route" };

export function BirthFields({ f, set, step = "2", nb, setNb }: {
  f: { outcome: string; date: string; place: string; babyName: string; babySex: string; gestationAtBirthWeeks: string };
  set: (k: "outcome" | "date" | "place" | "babyName" | "babySex" | "gestationAtBirthWeeks") => (v: string) => void; step?: string;
  nb?: Newborn; setNb?: (n: Newborn) => void;
}) {
  return (
    <Section step={step} title="Birth" hint="Weeks at birth decides the baby's corrected age if born early">
      <SF label="Outcome" value={f.outcome} onChange={set("outcome")} options={Object.keys(OUTCOME)} />
      <TF label="Date of delivery" value={f.date} onChange={set("date")} type="date" />
      <SF label="Place of delivery" value={f.place} onChange={set("place")} options={Object.keys(PLACE)} />
      {f.outcome === "Live birth" && <>
        <TF label="Baby's name (optional)" value={f.babyName} onChange={set("babyName")} />
        <SF label="Baby's sex" value={f.babySex} onChange={set("babySex")} options={["Female", "Male"]} />
        <TF label="Weeks pregnant at birth" value={f.gestationAtBirthWeeks} onChange={set("gestationAtBirthWeeks")} type="number" placeholder="39" />
        {nb && setNb && <NewbornFields n={nb} onChange={setNb} />}
      </>}
    </Section>
  );
}
