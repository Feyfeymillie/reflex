import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Heart,
  Languages,
  Loader2,
  Lock,
  ShieldCheck,
  User,
  WifiOff,
} from "lucide-react";
import logo from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError, errorText } from "@/lib/api";
import { ensureUser, homeFor, login } from "@/lib/auth";
import { setLang, t, useLang } from "@/lib/i18n";

const search = z.object({ next: z.string().optional() });

export const Route = createFileRoute("/login")({
  validateSearch: (s) => search.parse(s),
  beforeLoad: async () => {
    const u = await ensureUser();
    if (u) throw redirect({ to: u.role === "admin" ? "/admin/staff" : "/" });
  },
  head: () => ({ meta: [{ title: "Sign in — RefleX" }] }),
  component: LoginPage,
});

/** Only follow in-app paths: a crafted ?next=https://elsewhere must not become an open redirect. */
function safeNext(next: string | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/login"))
    return null;
  return next;
}

function LoginPage() {
  const lang = useLang();
  const router = useRouter();
  const { next } = Route.useSearch();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wait, setWait] = useState(0);
  const [noAdmin, setNoAdmin] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", localStorage.getItem("mg:dark") === "1");
    api<{ adminExists: boolean }>("GET", "/api/v1/auth/setup-status")
      .then((r) => setNoAdmin(!r.adminExists))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (wait <= 0) return;
    const id = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(id);
  }, [wait]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || wait > 0) return;
    if (!username.trim() || !password) {
      setError(t("Enter your username and password."));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const u = await login(username.trim(), password);
      const target = u.mustChangePassword ? "/account" : (safeNext(next) ?? homeFor(u));
      router.history.push(target);
    } catch (err) {
      setError(errorText(err));
      if (err instanceof ApiError && err.status === 429) {
        setWait(Number((err.body as { retryAfter?: number } | undefined)?.retryAfter) || 30);
      }
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background text-foreground">
      <aside className="hidden lg:flex flex-col justify-between bg-gradient-hero text-white p-12">
        <div className="flex items-center gap-3">
          <img
            src={logo}
            alt=""
            className="size-10 rounded-lg bg-white/90 p-1"
            width={40}
            height={40}
          />
          <span className="text-xl font-semibold tracking-tight">RefleX</span>
        </div>
        <div className="space-y-6 max-w-md">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            {t("Care for mother and child, in one record.")}
          </h1>
          <ul className="space-y-3 text-white/90">
            <li className="flex gap-3">
              <Heart className="size-5 shrink-0 mt-0.5" />
              {t("Pregnancy, postpartum and child development together.")}
            </li>
            <li className="flex gap-3">
              <WifiOff className="size-5 shrink-0 mt-0.5" />
              {t("Works with no internet, on the hub's own Wi-Fi.")}
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="size-5 shrink-0 mt-0.5" />
              {t("Each health worker signs in with their own account.")}
            </li>
          </ul>
        </div>
        <p className="text-sm text-white/70">
          {t("For community health workers and their supervisors.")}
        </p>
      </aside>

      <main className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setLang(lang === "sw" ? "en" : "sw")}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium hover:bg-secondary"
          >
            <Languages className="size-4" /> {lang === "sw" ? "Kiswahili" : "English"}
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-sm space-y-6">
            <div className="lg:hidden flex items-center gap-3">
              <img src={logo} alt="" className="size-10" width={40} height={40} />
              <span className="text-xl font-semibold tracking-tight">RefleX</span>
            </div>
            <div className="space-y-1.5">
              <h2 className="text-3xl font-bold tracking-tight">{t("Sign in")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("Use the username and password your administrator gave you.")}
              </p>
            </div>

            {noAdmin && (
              <div
                role="status"
                className="rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm space-y-1"
              >
                <p className="font-medium">{t("This hub has no administrator yet.")}</p>
                <p className="text-muted-foreground">{t("On the hub, run:")}</p>
                <code className="block rounded bg-background px-2 py-1 text-xs break-all">
                  python -m app.manage create-admin USERNAME --name "Full Name"
                </code>
              </div>
            )}

            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <label htmlFor="username" className="text-sm font-medium">
                  {t("Username")}
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    autoFocus
                    className="h-11 pl-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium">
                  {t("Password")}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={show ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="h-11 pl-9 pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShow(!show)}
                    aria-label={show ? t("Hide password") : t("Show password")}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-2.5 text-muted-foreground hover:text-foreground"
                  >
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <span className="whitespace-pre-line">
                    {error}
                    {wait > 0 ? ` (${wait}s)` : ""}
                  </span>
                </div>
              )}

              <Button type="submit" size="lg" className="w-full h-11" disabled={busy || wait > 0}>
                {busy ? (
                  <>
                    <Loader2 className="animate-spin" /> {t("Signing in…")}
                  </>
                ) : (
                  t("Sign in")
                )}
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              {t("Forgot your password? Ask your administrator to reset it.")}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
