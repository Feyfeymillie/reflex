import { pick } from "./i18n";

// All data lives on the RefleX hub (the Raspberry Pi). This phone only talks to it over the hub's Wi-Fi.
export class ApiError extends Error {
  constructor(
    public status: number,
    public errors: string[],
    public body?: unknown,
  ) {
    super(errors.join(" "));
  }
}

type ErrorBody = { errors?: string[]; auth_required?: boolean; password_change_required?: boolean };

// lib/auth.ts registers these. Kept here as plain callbacks so api.ts does not import the auth store (no import cycle).
type AuthHandlers = { onSessionEnded?: () => void; onPasswordChangeRequired?: () => void };
let handlers: AuthHandlers = {};
export function setAuthHandlers(h: AuthHandlers) {
  handlers = h;
}

export async function api<T>(
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      // X-Reflex is the hub's CSRF check: another website cannot add a custom header to a request to this hub.
      headers:
        body === undefined
          ? { "X-Reflex": "1" }
          : { "Content-Type": "application/json", "X-Reflex": "1" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, [
      "Haiwezi kufikia RefleX hub. Majibu yako yamebaki kwenye simu hii; jaribu tena. / Can't reach the RefleX hub. Your answers are kept on this phone; try again.",
    ]);
  }
  const data = (await res.json().catch(() => ({}))) as ErrorBody;
  if (!res.ok) {
    if (res.status === 401 && data.auth_required) handlers.onSessionEnded?.();
    if (res.status === 403 && data.password_change_required) handlers.onPasswordChangeRequired?.();
    throw new ApiError(res.status, data.errors ?? [`Error ${res.status}`], data);
  }
  return data as T;
}

export function errorText(e: unknown): string {
  return e instanceof ApiError ? e.errors.map(pick).join("\n") : String(e);
}
