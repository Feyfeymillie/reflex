import { pick } from "./i18n";

// All data lives on the RefleX hub (the Raspberry Pi). This phone only talks to it over the hub's Wi-Fi.
export class ApiError extends Error {
  constructor(public status: number, public errors: string[], public body?: unknown) {
    super(errors.join(" "));
  }
}

export async function api<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, [
      "Haiwezi kufikia RefleX hub. Majibu yako yamebaki kwenye simu hii; jaribu tena. / Can't reach the RefleX hub. Your answers are kept on this phone; try again.",
    ]);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { errors?: string[] }).errors ?? [`Error ${res.status}`], data);
  return data as T;
}

export function errorText(e: unknown): string {
  return e instanceof ApiError ? e.errors.map(pick).join("\n") : String(e);
}
