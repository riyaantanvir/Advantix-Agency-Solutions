const BASE = "/api";

export interface ToolUser {
  id: number;
  name: string;
  email: string;
}

export interface ShortUrl {
  id: number;
  shortCode: string;
  originalUrl: string;
  title: string | null;
  userId: number;
  clicks: number;
  createdAt: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

export const toolsApi = {
  auth: {
    me: () => request<{ user: ToolUser }>("/tools/auth/me"),
    login: (email: string, password: string) =>
      request<{ user: ToolUser }>("/tools/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    register: (name: string, email: string, password: string) =>
      request<{ user: ToolUser }>("/tools/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      }),
    logout: () => request<{ ok: boolean }>("/tools/auth/logout", { method: "POST" }),
  },
  urls: {
    list: () => request<ShortUrl[]>("/tools/urls"),
    create: (originalUrl: string, title?: string, customSlug?: string) =>
      request<ShortUrl>("/tools/urls", {
        method: "POST",
        body: JSON.stringify({ originalUrl, title, customSlug }),
      }),
    delete: (id: number) =>
      request<{ ok: boolean }>(`/tools/urls/${id}`, { method: "DELETE" }),
    resolve: (code: string) =>
      request<{ url: string; title: string | null }>(`/tools/urls/resolve/${code}`),
    analytics: (id: number) =>
      request<{
        totalClicks: number;
        byDay: Array<{ day: string; clicks: string }>;
        byCountry: Array<{ country: string; country_code: string; clicks: string }>;
        byReferrer: Array<{ referrer: string; clicks: string }>;
        byDevice: Array<{ device: string; clicks: string }>;
      }>(`/tools/urls/${id}/analytics`),
  },
};
