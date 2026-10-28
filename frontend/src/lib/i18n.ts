// Swahili / English switch. English strings are the keys; sw.json holds the Swahili.
// The choice is kept on the phone (localStorage) and works offline: everything is bundled.
import { useSyncExternalStore } from "react";
import sw from "./sw.json";

export type Lang = "sw" | "en";
const KEY = "mg:lang";
const dict = sw as Record<string, string>;

function initial(): Lang {
  try { return localStorage.getItem(KEY) === "en" ? "en" : "sw"; } catch { return "sw"; }
}
let lang: Lang = initial();
const listeners = new Set<() => void>();
if (typeof document !== "undefined") document.documentElement.lang = lang;

export function getLang(): Lang { return lang; }
export function setLang(l: Lang) {
  lang = l;
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  document.documentElement.lang = l;
  listeners.forEach((f) => f());
}

/** Subscribe a component (call once at the top of each page) so it re-renders on a switch. */
export function useLang(): Lang {
  return useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, () => lang, () => lang);
}

/** Translate an English UI string. `{name}` placeholders are filled from vars. Unknown strings fall back to English. */
export function t(en: string, vars?: Record<string, string | number | undefined | null>): string {
  let s = lang === "sw" ? dict[en] ?? en : en;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v ?? ""));
  return s;
}

/** Pick the right half of a server string written as "Swahili / English". */
export function pick(both: string): string {
  const i = both.indexOf(" / ");
  if (i < 0) return both;
  return lang === "sw" ? both.slice(0, i) : both.slice(i + 3);
}

/** Choose between two server-provided texts. */
export function bi(swText: string | undefined | null, enText: string | undefined | null): string {
  return (lang === "sw" ? swText || enText : enText || swText) || "";
}
