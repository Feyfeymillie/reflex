// Who is signed in on this phone. The session itself is an HttpOnly cookie that scripts cannot read; this file only
// remembers the account details the hub returned, so screens can show a name and hide what a role may not use.
// The hub enforces every permission again on the server: hiding a menu item is convenience, not security.
import { useSyncExternalStore } from "react";
import { api, ApiError, setAuthHandlers } from "./api";

export type Role = "chw" | "admin";
export type StaffUser = {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};
export type StaffRow = StaffUser & { lockedOut: boolean };

const DRAFT_PREFIX = "reflex:draft:";
const LAST_USER_KEY = "reflex:last-user";

let user: StaffUser | null = null;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export function useUser(): StaffUser | null {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => user,
    () => user,
  );
}

function setUser(u: StaffUser | null) {
  user = u;
  loaded = true;
  emit();
}

/** Unsent answers are patient data kept on the phone. They survive a session expiring (nothing is lost mid-visit) but
 *  not an explicit sign-out, nor a different person signing in. */
function clearDrafts() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(DRAFT_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage unavailable: nothing to clear */
  }
}

/** The signed-in account, asking the hub once and remembering the answer. Throws only if the hub cannot be reached. */
export async function ensureUser(force = false): Promise<StaffUser | null> {
  if (loaded && !force) return user;
  try {
    setUser((await api<{ user: StaffUser }>("GET", "/api/v1/auth/me")).user);
  } catch (e) {
    if (e instanceof ApiError && e.status === 0) throw e;
    setUser(null);
  }
  return user;
}

export async function login(username: string, password: string): Promise<StaffUser> {
  const r = await api<{ user: StaffUser }>("POST", "/api/v1/auth/login", { username, password });
  try {
    const previous = localStorage.getItem(LAST_USER_KEY);
    if (previous && previous !== r.user.id) clearDrafts(); // someone else's unsent answers must not appear for this person
    localStorage.setItem(LAST_USER_KEY, r.user.id);
  } catch {
    /* ignore */
  }
  setUser(r.user);
  return r.user;
}

export async function logout(): Promise<void> {
  try {
    await api("POST", "/api/v1/auth/logout");
  } catch {
    /* the hub may be unreachable; still sign out on this phone */
  }
  clearDrafts();
  setUser(null);
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<StaffUser> {
  const r = await api<{ user: StaffUser }>("POST", "/api/v1/auth/password", {
    currentPassword,
    newPassword,
  });
  setUser(r.user);
  return r.user;
}

export const homeFor = (u: StaffUser) => (u.role === "admin" ? "/admin/staff" : "/");

setAuthHandlers({
  // The hub says the session is over (idle too long, deactivated, password reset). Drafts stay on the phone.
  onSessionEnded: () => {
    const wasSignedIn = loaded && user !== null; // the very first /me check on page load just means "not signed in yet"
    setUser(null);
    if (wasSignedIn && !window.location.pathname.startsWith("/login")) {
      window.location.assign(
        "/login?next=" + encodeURIComponent(window.location.pathname + window.location.search),
      );
    }
  },
  onPasswordChangeRequired: () => {
    if (window.location.pathname !== "/account") window.location.assign("/account");
  },
});
