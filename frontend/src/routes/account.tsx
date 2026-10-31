import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorText } from "@/lib/api";
import { changePassword, homeFor, useUser } from "@/lib/auth";
import { t, useLang } from "@/lib/i18n";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "My account — RefleX" }] }),
  component: AccountPage,
});

function AccountPage() {
  useLang();
  const router = useRouter();
  const user = useUser();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const forced = !!user?.mustChangePassword;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (next.length < 8) return setError(t("The new password needs at least 8 characters."));
    if (next !== again) return setError(t("The two new passwords do not match."));
    if (next === current)
      return setError(t("The new password must be different from the old one."));
    setBusy(true);
    try {
      const u = await changePassword(current, next);
      toast.success(t("Password changed. Other devices were signed out."));
      setCurrent("");
      setNext("");
      setAgain("");
      router.history.push(homeFor(u));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const type = show ? "text" : "password";
  return (
    <AppShell>
      <div className="max-w-md mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <KeyRound className="size-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("My account")}</h1>
            {user && (
              <p className="text-sm text-muted-foreground">
                {user.fullName} · {user.username}
              </p>
            )}
          </div>
        </div>

        {forced && (
          <div
            role="status"
            className="rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm"
          >
            {t(
              "Choose your own password before you continue. The one you were given is temporary.",
            )}
          </div>
        )}

        <form
          onSubmit={submit}
          className="rounded-2xl bg-card border border-border p-5 shadow-card space-y-4"
          noValidate
        >
          <h2 className="font-semibold">{t("Change password")}</h2>
          <div className="space-y-1.5">
            <label htmlFor="current" className="text-sm font-medium">
              {forced ? t("Temporary password") : t("Current password")}
            </label>
            <Input
              id="current"
              type={type}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="new" className="text-sm font-medium">
              {t("New password")}
            </label>
            <Input
              id="new"
              type={type}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">
              {t(
                "At least 8 characters. A few words together make a strong, easy-to-remember password.",
              )}
            </p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="again" className="text-sm font-medium">
              {t("Type the new password again")}
            </label>
            <Input
              id="again"
              type={type}
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              autoComplete="new-password"
              className="h-11"
            />
          </div>
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}{" "}
            {show ? t("Hide passwords") : t("Show passwords")}
          </button>
          {error && (
            <div
              role="alert"
              className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span className="whitespace-pre-line">{error}</span>
            </div>
          )}
          <Button
            type="submit"
            size="lg"
            className="w-full h-11"
            disabled={busy || !current || !next || !again}
          >
            {busy ? (
              <>
                <Loader2 className="animate-spin" /> {t("Saving…")}
              </>
            ) : (
              t("Change password")
            )}
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
