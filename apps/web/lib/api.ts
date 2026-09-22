const TOKEN_KEY = "vietvoice.accessToken";

export function saveAccessToken(token: string): void { localStorage.setItem(TOKEN_KEY, token); }
export function clearAccessToken(): void { localStorage.removeItem(TOKEN_KEY); }

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:3200"}${path}`, { ...init, headers });
}
