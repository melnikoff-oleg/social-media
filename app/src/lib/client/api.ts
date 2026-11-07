// Browser-side helpers shared by the pages: a 401 means the session is gone, so go to /login.

export function redirectToLogin(): void {
  if (typeof window !== "undefined") window.location.assign("/login");
}

/** fetch() that sends the user to /login on 401. The response is still returned. */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) redirectToLogin();
  return res;
}

export const LOAD_ERROR = "Não foi possível carregar os dados";

/** The raw `{ error }` string of a response body, or "". Machine code, not for display. */
export async function readErrorCode(res: Response): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  if (body && typeof body === "object" && "error" in body) {
    const msg = (body as { error: unknown }).error;
    if (typeof msg === "string") return msg;
  }
  return "";
}

/** Statuses whose `{ error }` text is a fixed, user-facing message written by our API. */
const SHOWN_STATUSES = new Set([400, 409, 422]);

/**
 * Message to show for a failed response: the server's text for 400 (validation),
 * 409 (duplicate) and 422 (limit reached), a fixed `fallback` for every other status.
 */
export async function readError(
  res: Response,
  fallback = "Não foi possível concluir a ação."
): Promise<string> {
  if (!SHOWN_STATUSES.has(res.status)) return fallback;
  return (await readErrorCode(res)) || fallback;
}

/**
 * GETs a list endpoint. Anything that is not a 2xx array (an `{ error }` body, a network
 * failure) yields an empty list plus an error line; a 401 redirects and yields no error.
 */
export async function fetchList<T>(url: string): Promise<{ items: T[]; error: string | null }> {
  try {
    const res = await apiFetch(url);
    if (res.status === 401) return { items: [], error: null };
    if (!res.ok) return { items: [], error: await readError(res, LOAD_ERROR) };
    const body: unknown = await res.json().catch(() => null);
    if (!Array.isArray(body)) return { items: [], error: LOAD_ERROR };
    return { items: body as T[], error: null };
  } catch {
    return { items: [], error: LOAD_ERROR };
  }
}
