// Zanzibar referral facilities.
// Names and levels come from published sources:
//  - Mnazi Mmoja is the only tertiary hospital and serves all of Zanzibar (Unguja and Pemba); Pemba's main referral
//    hospital is in Chake Chake (UNFPA Tanzania).
//  - Unguja district hospitals Kivunge and Makunduchi; hospitals Mwembeladu, Fuoni, Bumbwini and Rahaleo were visited
//    in a 2015 maternal health assessment (Boston University / State University of Zanzibar).
//  - Fuoni (West B) was upgraded to a basic EmONC unit open 24 hours (UNFPA Tanzania).
//  - Each Pemba district (Chake Chake, Mkoani, Wete) had one comprehensive EmONC facility in the 2016 BMC Pregnancy and
//    Childbirth survey of Zanzibar.
// These sources are from 2015 to 2019. SERVICES CHANGE: confirm what each facility can do, and its phone number,
// with the Zanzibar Ministry of Health before real use. No phone numbers are stored here on purpose; the user adds them.
import type { Patient } from "./store";

export type Facility = {
  id: string;
  name: string;
  island: "Unguja" | "Pemba";
  district: string;
  level: string; // what the sources say about it
  matchDistricts: string[]; // lower-case words that suggest this facility for a patient's district
};

export const FACILITIES: Facility[] = [
  { id: "mnazi-mmoja", name: "Mnazi Mmoja Hospital", island: "Unguja", district: "Mjini (Urban)", level: "National referral hospital for all Zanzibar: comprehensive surgical care", matchDistricts: ["mjini", "urban", "magharibi a", "west a", "kati", "central"] },
  { id: "mwembeladu", name: "Mwembeladu Maternity Hospital", island: "Unguja", district: "Mjini (Urban)", level: "Hospital in Unguja providing maternity care", matchDistricts: ["mjini", "urban"] },
  { id: "fuoni", name: "Fuoni Health Unit", island: "Unguja", district: "Magharibi B (West B)", level: "Basic emergency obstetric care, open 24 hours", matchDistricts: ["magharibi b", "west b", "fuoni"] },
  { id: "kivunge", name: "Kivunge Hospital", island: "Unguja", district: "Kaskazini A (North A)", level: "District hospital", matchDistricts: ["kaskazini", "north", "kivunge"] },
  { id: "makunduchi", name: "Makunduchi Hospital", island: "Unguja", district: "Kusini (South)", level: "District hospital", matchDistricts: ["kusini", "south", "makunduchi"] },
  { id: "chake-chake", name: "Chake Chake Hospital", island: "Pemba", district: "Chake Chake", level: "Main referral hospital on Pemba", matchDistricts: ["chake"] },
  { id: "wete", name: "Wete Hospital", island: "Pemba", district: "Wete", level: "District hospital", matchDistricts: ["wete", "micheweni"] },
  { id: "mkoani", name: "Mkoani Hospital", island: "Pemba", district: "Mkoani", level: "District hospital", matchDistricts: ["mkoani"] },
];

/** Facilities with those matching the patient's district first. */
export function orderedFacilities(p: Patient): { facility: Facility; suggested: boolean }[] {
  const place = `${p.rch4?.district || ""} ${p.rch4?.ward || ""} ${p.rch4?.village || ""}`.toLowerCase().trim();
  const matches = (f: Facility) => place !== "" && f.matchDistricts.some((m) => place.includes(m));
  const all = FACILITIES.map((facility) => ({ facility, suggested: matches(facility) }));
  return [...all.filter((x) => x.suggested), ...all.filter((x) => !x.suggested)];
}

const KEY = "reflex:facility-phones:v1";

export function loadPhones(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}

export function savePhone(id: string, phone: string): Record<string, string> {
  const all = loadPhones();
  const clean = phone.trim();
  if (clean) all[id] = clean; else delete all[id];
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage blocked: keep working without saving */ }
  return all;
}
