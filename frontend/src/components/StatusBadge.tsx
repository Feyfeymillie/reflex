import { cn } from "@/lib/utils";
import type { RiskCategory } from "@/lib/store";

import { t, useLang } from "@/lib/i18n";
export function StatusBadge({ category }: { category: RiskCategory }) {
  useLang();
  const map = {
    Low: "bg-success/15 text-success border-success/30",
    Moderate: "bg-warning/15 text-warning-foreground border-warning/40",
    High: "bg-destructive/15 text-destructive border-destructive/40",
  } as const;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", map[category])}>
      <span className={cn(
        "size-1.5 rounded-full",
        category === "Low" ? "bg-success" : category === "Moderate" ? "bg-warning" : "bg-destructive animate-pulse",
      )} />
      {t(`${category} Risk`)}
    </span>
  );
}
