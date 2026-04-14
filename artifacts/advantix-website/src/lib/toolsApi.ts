const BASE = "/api";

export interface ToolUser {
  id: number;
  name: string;
  email: string;
}

export interface ToolUserProfile {
  id: number;
  name: string;
  email: string;
  companyName: string | null;
  phone: string | null;
  website: string | null;
}

export interface ShortUrl {
  id: number;
  shortCode: string;
  originalUrl: string;
  title: string | null;
  userId: number;
  clicks: number;
  clickLimit: number | null;
  passwordHash: string | null;
  createdAt: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Server returned an invalid response");
  }
  if (!res.ok) {
    const err: any = new Error((data.error as string) ?? "Request failed");
    err.needsVerification = data.needsVerification;
    err.email = data.email;
    throw err;
  }
  return data as T;
}

export const toolsApi = {
  auth: {
    config: () => request<{ googleEnabled: boolean; turnstileEnabled: boolean }>("/tools/auth/config"),
    me: () => request<{ user: ToolUser }>("/tools/auth/me"),
    login: (email: string, password: string, turnstileToken?: string) =>
      request<{ user: ToolUser }>("/tools/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, turnstileToken }),
      }),
    register: (name: string, email: string, password: string, turnstileToken?: string) =>
      request<{ needsVerification: boolean; email: string }>("/tools/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password, turnstileToken }),
      }),
    verifyEmail: (email: string, code: string) =>
      request<{ user: ToolUser }>("/tools/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ email, code }),
      }),
    resendCode: (email: string) =>
      request<{ ok: boolean }>("/tools/auth/resend-code", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    forgotPassword: (email: string) =>
      request<{ ok: boolean }>("/tools/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    resetPassword: (token: string, password: string) =>
      request<{ ok: boolean }>("/tools/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      }),
    logout: () => request<{ ok: boolean }>("/tools/auth/logout", { method: "POST" }),
    profile: () => request<ToolUserProfile>("/tools/auth/profile"),
    updateProfile: (data: { name: string; companyName?: string; phone?: string; website?: string }) =>
      request<{ ok: boolean; name: string }>("/tools/auth/profile", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    changePassword: (currentPassword: string, newPassword: string) =>
      request<{ ok: boolean }>("/tools/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
  },
  recordings: {
    save: (durationSeconds: number) =>
      request<{ ok: boolean }>("/tools/recordings", {
        method: "POST",
        body: JSON.stringify({ durationSeconds }),
      }),
    stats: () =>
      request<{ totalRecordings: number; totalSeconds: number }>("/tools/recordings/stats"),
  },
  urls: {
    list: () => request<ShortUrl[]>("/tools/urls"),
    create: (
      originalUrl: string,
      title?: string,
      customSlug?: string,
      password?: string,
      clickLimit?: number,
    ) =>
      request<ShortUrl>("/tools/urls", {
        method: "POST",
        body: JSON.stringify({ originalUrl, title, customSlug, password, clickLimit }),
      }),
    delete: (id: number) =>
      request<{ ok: boolean }>(`/tools/urls/${id}`, { method: "DELETE" }),
    resolve: (code: string) =>
      request<{ url: string; title: string | null }>(`/tools/urls/resolve/${code}`),
    analytics: (id: number) =>
      request<{
        totalClicks: number;
        byDay: Array<{ day: string; clicks: string }>;
        byHour: Array<{ hour: number; clicks: string }>;
        byCountry: Array<{ country: string; country_code: string; clicks: string }>;
        byReferrer: Array<{ referrer: string; clicks: string }>;
        byDevice: Array<{ device: string; clicks: string }>;
        byBrowser: Array<{ browser: string; clicks: string }>;
        byOS: Array<{ os: string; clicks: string }>;
        byISP: Array<{ isp: string; clicks: string; is_mobile: boolean }>;
        byLanguage: Array<{ language: string; clicks: string }>;
        byRegion: Array<{ region: string; clicks: string }>;
        byOrg: Array<{ org: string; clicks: string }>;
        connectionSplit: { cellular: string; wifi_or_broadband: string };
        recentClicks: Array<{
          ip: string; country: string | null; city: string | null; region: string | null;
          browser: string | null; os: string | null; isp: string | null; org: string | null;
          timezone: string | null; language: string | null; is_bot: boolean | null;
          is_mobile: boolean | null; referrer: string | null; device: string | null;
          created_at: string;
        }>;
      }>(`/tools/urls/${id}/analytics`),
  },
};
