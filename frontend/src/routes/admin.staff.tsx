import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  Copy,
  KeyRound,
  Loader2,
  Lock,
  Pencil,
  Power,
  Plus,
  UserCog,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, errorText } from "@/lib/api";
import type { StaffRow, StaffUser } from "@/lib/auth";
import { t, useLang } from "@/lib/i18n";

export const Route = createFileRoute("/admin/staff")({
  head: () => ({ meta: [{ title: "Staff accounts — RefleX" }] }),
  component: StaffPage,
});

type Reveal = { name: string; username: string; password: string };
type Confirm = { kind: "deactivate" | "reset"; user: StaffRow };

/** navigator.clipboard only exists on HTTPS or localhost; the hub is plain HTTP, so fall back to the old way. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function StaffPage() {
  useLang();
  const [staff, setStaff] = useState<StaffRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ staff: StaffRow[] }>("GET", "/api/v1/admin/staff")
      .then((r) => setStaff(r.staff))
      .catch((e) => toast.error(errorText(e)));
  }, []);
  useEffect(load, [load]);

  async function act(u: StaffRow, action: "activate" | "deactivate" | "unlock" | "reset-password") {
    setBusyId(u.id);
    try {
      const r = await api<{ user: StaffUser; temporaryPassword?: string }>(
        "POST",
        `/api/v1/admin/staff/${u.id}/${action}`,
      );
      if (action === "reset-password" && r.temporaryPassword)
        setReveal({ name: u.fullName, username: u.username, password: r.temporaryPassword });
      else
        toast.success(
          action === "deactivate"
            ? t("Account deactivated. They were signed out.")
            : action === "activate"
              ? t("Account activated.")
              : t("Unlocked."),
        );
      load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <UserCog className="size-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{t("Staff accounts")}</h1>
              <p className="text-muted-foreground text-sm">
                {t(
                  "Create and manage community health worker accounts. Administrators cannot see patient records.",
                )}
              </p>
            </div>
          </div>
          <Button onClick={() => setAdding(true)} size="lg">
            <Plus /> {t("Add health worker")}
          </Button>
        </div>

        <div className="rounded-2xl bg-card border border-border shadow-card overflow-hidden">
          {staff === null && (
            <p className="p-6 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> {t("Loading…")}
            </p>
          )}
          {staff?.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">{t("No accounts yet.")}</p>
          )}
          <ul className="divide-y divide-border">
            {staff?.map((u) => (
              <li key={u.id} className="p-4 flex flex-wrap items-center gap-3 justify-between">
                <div className="min-w-0">
                  <div className="font-medium flex flex-wrap items-center gap-2">
                    {u.fullName}
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full border ${u.role === "admin" ? "border-primary/40 text-primary" : "border-border text-muted-foreground"}`}
                    >
                      {u.role === "admin" ? t("Administrator") : t("Health worker")}
                    </span>
                    {!u.isActive && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
                        {t("Deactivated")}
                      </span>
                    )}
                    {u.lockedOut && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent/20 text-accent-foreground">
                        {t("Locked out")}
                      </span>
                    )}
                    {u.mustChangePassword && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                        {t("Must set a new password")}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {u.username} ·{" "}
                    {u.lastLoginAt
                      ? t("Last sign-in {date}", {
                          date: u.lastLoginAt.slice(0, 16).replace("T", " "),
                        })
                      : t("Never signed in")}
                  </div>
                </div>
                {u.role === "chw" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === u.id}
                      onClick={() => setEditing(u)}
                    >
                      <Pencil /> {t("Edit")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === u.id}
                      onClick={() => setConfirm({ kind: "reset", user: u })}
                    >
                      <KeyRound /> {t("Reset password")}
                    </Button>
                    {u.lockedOut && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyId === u.id}
                        onClick={() => act(u, "unlock")}
                      >
                        <Lock /> {t("Unlock")}
                      </Button>
                    )}
                    {u.isActive ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyId === u.id}
                        onClick={() => setConfirm({ kind: "deactivate", user: u })}
                      >
                        <Power /> {t("Deactivate")}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyId === u.id}
                        onClick={() => act(u, "activate")}
                      >
                        <Power /> {t("Activate")}
                      </Button>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">{t("Managed on the hub")}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <AddDialog
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(r) => {
          setAdding(false);
          setReveal(r);
          load();
        }}
      />
      <EditDialog
        user={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "reset"
                ? t("Reset this password?")
                : t("Deactivate this account?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "reset"
                ? t(
                    "{name} will be signed out everywhere and must use a new temporary password. You will see it once.",
                    { name: confirm?.user.fullName },
                  )
                : t(
                    "{name} will be signed out everywhere and cannot sign in until you activate the account again. Their records are kept.",
                    { name: confirm?.user.fullName },
                  )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm)
                  act(confirm.user, confirm.kind === "reset" ? "reset-password" : "deactivate");
                setConfirm(null);
              }}
            >
              {confirm?.kind === "reset" ? t("Reset password") : t("Deactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!reveal} onOpenChange={(o) => !o && setReveal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Temporary password")}</DialogTitle>
            <DialogDescription>
              {t(
                "Give this to {name} in person or by phone. It is shown only once. They will be asked to choose their own password at first sign-in.",
                { name: reveal?.name },
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-border bg-secondary/40 p-4 space-y-1 text-center">
            <div className="text-xs text-muted-foreground">
              {t("Username")}: <b>{reveal?.username}</b>
            </div>
            <div className="font-mono text-2xl tracking-wider select-all break-all">
              {reveal?.password}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={async () => {
                if (await copyText(reveal?.password ?? "")) toast.success(t("Copied"));
                else toast.error(t("Could not copy: select the text and copy it."));
              }}
            >
              <Copy /> {t("Copy")}
            </Button>
            <Button onClick={() => setReveal(null)}>{t("Done")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function AddDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (r: Reveal) => void;
}) {
  useLang();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ user: StaffUser; temporaryPassword: string }>(
        "POST",
        "/api/v1/admin/staff",
        { fullName, username },
      );
      onCreated({
        name: r.user.fullName,
        username: r.user.username,
        password: r.temporaryPassword,
      });
      setFullName("");
      setUsername("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t("Add health worker")}</DialogTitle>
            <DialogDescription>
              {t(
                "A temporary password is made for you to hand over. They choose their own at first sign-in.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor="fn" className="text-sm font-medium">
              {t("Full name")}
            </label>
            <Input
              id="fn"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="h-11"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="un" className="text-sm font-medium">
              {t("Username")}
            </label>
            <Input
              id="un"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-11"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              {t("3 to 32 letters, numbers, dots, dashes or underscores. Example: asha.juma")}
            </p>
          </div>
          {error && (
            <div
              role="alert"
              className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span className="whitespace-pre-line">{error}</span>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={busy || !fullName.trim() || !username.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : <Plus />} {t("Create account")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  user,
  onClose,
  onSaved,
}: {
  user: StaffRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  useLang();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setName(user?.fullName ?? "");
    setError("");
  }, [user]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      await api("PUT", `/api/v1/admin/staff/${user.id}`, { fullName: name });
      toast.success(t("Saved."));
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t("Edit account")}</DialogTitle>
            <DialogDescription>{user?.username}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor="en" className="text-sm font-medium">
              {t("Full name")}
            </label>
            <Input
              id="en"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11"
              autoFocus
            />
          </div>
          {error && (
            <div
              role="alert"
              className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span className="whitespace-pre-line">{error}</span>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy && <Loader2 className="animate-spin" />} {t("Save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
