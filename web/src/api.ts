import type { Role } from "./types";

const URL_KEY = "casino_server_url";
const AUTH_KEY = "casino_auth";
const DEFAULT_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:8787";

export function serverUrl(): string {
  try {
    return (localStorage.getItem(URL_KEY) ?? DEFAULT_URL).replace(/\/+$/, "");
  } catch {
    return DEFAULT_URL;
  }
}
export function setServerUrl(url: string): void {
  try {
    localStorage.setItem(URL_KEY, url);
  } catch {
    /* ignore */
  }
}

export function toWsUrl(base: string): string {
  const u = new URL(base);
  return `${u.protocol === "https:" ? "wss:" : "ws:"}//${u.host}${u.pathname.replace(/\/+$/, "")}/ws`;
}

export function savedPassword(): string {
  try {
    return sessionStorage.getItem(AUTH_KEY) ?? "";
  } catch {
    return "";
  }
}
export function savePassword(pw: string): void {
  try {
    if (pw) sessionStorage.setItem(AUTH_KEY, pw);
    else sessionStorage.removeItem(AUTH_KEY);
  } catch {
    /* ignore */
  }
}

const basic = (pw: string) => "Basic " + btoa("casino:" + pw);

/** Verifies a password; resolves to the role it grants, or null if wrong. */
export async function login(pw: string): Promise<Role | null> {
  const res = await fetch(`${serverUrl()}/api/login`, { method: "POST", headers: { Authorization: basic(pw) } });
  if (!res.ok) return null;
  return ((await res.json()) as { role: Role }).role;
}

/** Sends one action to the server; throws an Error with the server's message on failure. */
export async function act(pw: string, action: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${serverUrl()}/api/action`, {
    method: "POST",
    headers: { Authorization: basic(pw), "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
  if (!res.ok) {
    const msg = ((await res.json().catch(() => ({}))) as { error?: string }).error;
    throw new Error(msg ?? `HTTP ${res.status}`);
  }
}
