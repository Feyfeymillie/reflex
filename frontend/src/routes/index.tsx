import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ArrowRight, BookOpen, Globe2, ShieldCheck, Stethoscope, WifiOff, Heart, Users, Sparkles } from "lucide-react";
import hero from "@/assets/hero.jpg";
import logo from "@/assets/logo.png";
import { AppShell } from "@/components/AppShell";

import { t, useLang } from "@/lib/i18n";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "REFLEX AI Module 1 — Prenatal Risk Detection for African Clinics" },
      { name: "description", content: "Offline maternal and child health support for community health workers, running on a Raspberry Pi." },
      { property: "og:title", content: "REFLEX AI Module 1 — Prenatal Risk Detection" },
      { property: "og:description", content: "Offline maternal and child health support for community health workers." },
    ],
  }),
  component: Landing,
});

const stats = [
  { value: "295K", label: "Maternal deaths/year globally", sub: "70% in Sub-Saharan Africa" },
  { value: "0", label: "Internet needed", sub: "Runs on a Raspberry Pi hub" },
  { value: "3", label: "Modules, one record", sub: "Pregnancy, postpartum, child" },
  { value: "<2s", label: "Risk analysis time", sub: "Even fully offline" },
];

function Landing() {
  useLang();
  return (
    <AppShell>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-soft" />
        <div className="relative max-w-7xl mx-auto px-4 lg:px-8 py-16 lg:py-24 grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-card border border-border text-xs">
              <Sparkles className="size-3.5 text-accent" />
              {t("Built for Tanzanian community health workers")}
            </div>
            <h1 className="text-4xl lg:text-6xl font-bold tracking-tight leading-tight">
              {t("Mother and child health")}{' '}<span className="text-gradient">{t("on one offline record")}</span>
            </h1>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-hero text-white font-medium shadow-glow hover:opacity-95"
              >
                {t("Start Screening")}{' '}<ArrowRight className="size-4" />
              </Link>
              <Link
                to="/dataset"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-card border border-border font-medium hover:bg-secondary"
              >
                <BookOpen className="size-4" />{' '}{t("Learn More")}
              </Link>
            </div>
            <div className="flex items-center gap-4 pt-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5"><WifiOff className="size-4 text-accent" />{' '}{t("Works offline")}</div>
              <div className="flex items-center gap-1.5"><ShieldCheck className="size-4 text-teal" />{' '}{t("Privacy-first")}</div>
              <div className="flex items-center gap-1.5"><Stethoscope className="size-4 text-primary" />{' '}{t("The CHW decides")}</div>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-hero rounded-3xl opacity-20 blur-2xl" />
            <img
              src={hero}
              alt="Healthcare worker using REFLEX AI with expectant mother"
              width={1536}
              height={1024}
              className="relative rounded-3xl shadow-glow object-cover w-full aspect-[4/3]"
            />
            <div className="absolute -bottom-6 -left-6 bg-card border border-border rounded-2xl p-4 shadow-card hidden md:block max-w-[260px]">
              <div className="flex items-center gap-2 text-xs text-success font-medium">
                <span className="size-2 rounded-full bg-success animate-pulse" />{' '}{t("Live screening")}
              </div>
              <div className="mt-2 text-sm font-semibold">{t("Risk score: 22% — Low")}</div>
              <div className="text-xs text-muted-foreground mt-1">{t("Routine checkup recommended in 4 weeks.")}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="max-w-7xl mx-auto px-4 lg:px-8 py-12">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl bg-card border border-border p-5 shadow-card">
              <div className="text-3xl font-bold text-gradient">{s.value}</div>
              <div className="font-medium mt-1 text-sm">{t(s.label)}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{t(s.sub)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Challenge */}
      <section className="max-w-7xl mx-auto px-4 lg:px-8 py-12 grid lg:grid-cols-3 gap-6">
        {[
          { icon: Heart, color: "text-destructive", title: "Rural distance", text: "Many expectant mothers live more than 50km from the nearest specialist, delaying critical interventions." },
          { icon: Users, color: "text-accent", title: "Limited specialists", text: "Most rural clinics rely on community health workers without diagnostic ultrasound expertise." },
          { icon: WifiOff, color: "text-teal", title: "Unreliable connectivity", text: "Cloud-only health tools fail where connectivity is intermittent. REFLEX AI runs entirely on the device." },
        ].map((c) => (
          <div key={c.title} className="rounded-2xl bg-card border border-border p-6 shadow-card">
            <c.icon className={`size-7 ${c.color}`} />
            <div className="font-semibold mt-3">{t(c.title)}</div>
            <p className="text-sm text-muted-foreground mt-1">{t(c.text)}</p>
          </div>
        ))}
      </section>

      {/* Offline banner */}
      <section className="max-w-7xl mx-auto px-4 lg:px-8 py-12">
        <div className="rounded-3xl bg-gradient-hero text-white p-8 lg:p-12 relative overflow-hidden">
          <div className="absolute -right-20 -bottom-20 size-72 rounded-full bg-white/10 blur-3xl" />
          <div className="relative grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-xs">
                <WifiOff className="size-3.5" />{' '}{t("Works Even Without Internet")}
              </div>
              <h2 className="text-3xl lg:text-4xl font-bold mt-3">{t("Offline-first by design")}</h2>
              <p className="mt-3 opacity-90 max-w-xl">
                Every record and risk check is stored on the RefleX hub, a Raspberry Pi in the clinic that runs its own Wi-Fi. Phones join that Wi-Fi; no internet is needed. Sync to district systems is roadmap, not built yet.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { k: "On-device AI", v: "Runs without GPU" },
                { k: "Local storage", v: "Encrypted records" },
                { k: "Auto-sync", v: "When network returns" },
                { k: "SMS fallback", v: "Referral alerts" },
              ].map((b) => (
                <div key={b.k} className="rounded-xl bg-white/10 backdrop-blur p-4">
                  <div className="text-sm font-semibold">{b.k}</div>
                  <div className="text-xs opacity-80">{b.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="max-w-7xl mx-auto px-4 lg:px-8 py-12">
        <h2 className="text-3xl font-bold">{t("Everything a community clinic needs")}</h2>
        <p className="text-muted-foreground mt-1">{t("From first visit to emergency referral.")}</p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
          {[
            { to: "/register", icon: Stethoscope, t: "Patient Registration", d: "Capture history, vitals, ultrasound in one screen." },
            { to: "/analysis", icon: Activity, t: "AI Risk Analysis", d: "Risk score, category, and complication detection in seconds." },
            { to: "/referral", icon: ShieldCheck, t: "Emergency Referrals", d: "Auto-alerts and nearest hospital suggestions for high-risk cases." },
            { to: "/analytics", icon: Globe2, t: "Clinic Analytics", d: "Track screenings, trends, and AI performance over time." },
            { to: "/dataset", icon: BookOpen, t: "African Datasets", d: "Learn how we reduce bias with locally sourced data." },
            { to: "/patients", icon: Users, t: "Patient Records", d: "Search and review every patient — even offline." },
          ].map((f) => (
            <Link key={f.t} to={f.to} className="group rounded-2xl bg-card border border-border p-5 shadow-card hover:shadow-glow hover:-translate-y-0.5 transition-all">
              <f.icon className="size-6 text-primary" />
              <div className="font-semibold mt-3 group-hover:text-primary">{t(f.t)}</div>
              <p className="text-sm text-muted-foreground mt-1">{t(f.d)}</p>
              <div className="text-xs text-primary mt-3 inline-flex items-center gap-1">{t("Open")}{' '}<ArrowRight className="size-3" /></div>
            </Link>
          ))}
        </div>
      </section>

      <footer className="border-t border-border mt-12">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src={logo} alt="" width={24} height={24} className="size-6" />
            REFLEX AI Module 1 © {new Date().getFullYear()}
          </div>
          <div>{t("Built for Tanzanian CHWs. Not yet clinically validated.")}</div>
        </div>
      </footer>
    </AppShell>
  );
}
