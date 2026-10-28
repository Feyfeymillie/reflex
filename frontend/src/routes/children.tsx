import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Baby } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { errorText } from "@/lib/api";
import { loadPatients, type Patient } from "@/lib/store";

import { t, useLang } from "@/lib/i18n";
export const Route = createFileRoute("/children")({
  head: () => ({ meta: [{ title: "Child development — RefleX" }] }),
  component: ChildrenPage,
});

function ChildrenPage() {
  useLang();
  const [patients, setPatients] = useState<Patient[]>([]);
  useEffect(() => { loadPatients().then(setPatients).catch((e) => toast.error(errorText(e))); }, []);
  const kids = patients.flatMap((m) => m.children.map((c) => ({ ...c, mother: m.name })));
  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-2xl bg-accent/15 text-accent flex items-center justify-center"><Baby className="size-6" /></div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("Child development")}</h1>
            <p className="text-muted-foreground text-sm">{t("Milestones and play ideas for parents, 0 to 3 years. No scores, no diagnosis.")}</p>
          </div>
        </div>
        <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
          {kids.length === 0 && <p className="text-sm text-muted-foreground">{t("No children yet. Record a birth from a mother's postpartum page.")}</p>}
          <div className="divide-y divide-border">
            {kids.map((k) => (
              <Link key={k.id} to="/child/$id" params={{ id: k.id }} className="flex justify-between py-3 px-2 rounded-lg hover:bg-secondary/40">
                <div><div className="font-medium">{k.name}</div><div className="text-xs text-muted-foreground">{t("Mother:")} {k.mother}</div></div>
                <div className="text-xs text-muted-foreground">{t("born {date}", { date: k.dob })}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
