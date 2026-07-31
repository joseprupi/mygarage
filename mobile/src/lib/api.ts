/**
 * CeCeCar API client for the mobile app.
 *
 * Dev networking: phone/browser reach the dev backend over the VPN.
 * Native apps have no CORS; the web build's origin is allowed by the
 * backend's CORS_ORIGINS env.
 */
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const HOST = "10.0.3.15";
export const API_BASE = `http://${HOST}:8010`;
const MEDIA_BASE = `http://${HOST}:9000/car-social`;

/** Stored media URLs are relative ("/media/...") — map them to the MinIO bucket. */
export function mediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  if (url.startsWith("/media/")) return MEDIA_BASE + url.slice("/media".length);
  return API_BASE + url;
}

// --- token storage: SecureStore on device, localStorage on web ---

const TOKEN_KEY = "cececar_token";

export async function getToken(): Promise<string | null> {
  if (Platform.OS === "web") return typeof localStorage === "undefined" ? null : localStorage.getItem(TOKEN_KEY);
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string | null): Promise<void> {
  if (Platform.OS === "web") {
    if (token === null) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, token);
    return;
  }
  if (token === null) await SecureStore.deleteItemAsync(TOKEN_KEY);
  else await SecureStore.setItemAsync(TOKEN_KEY, token);
}

// --- types (subset of backend schemas we render) ---

export type PublicUser = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url?: string | null;
};

export type Media = {
  id?: string;
  url: string;
  media_type?: string | null;
  thumbnail_url?: string | null;
};

export type VehicleSummary = {
  id: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  nickname?: string | null;
};

export type Post = {
  id: string;
  caption: string | null;
  created_at: string;
  author: PublicUser;
  media: Media[];
  vehicles: VehicleSummary[];
  like_count: number;
  comment_count: number;
  viewer_has_liked: boolean;
};

export type CursorPage = {
  items: Post[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type TokenResponse = {
  accessToken: string;
  user: PublicUser;
};

// --- fetch wrapper ---

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // non-JSON error body — keep the generic message
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const authApi = {
  async login(email: string, password: string): Promise<TokenResponse> {
    const data = await request<TokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await setToken(data.accessToken);
    return data;
  },
  me: () => request<PublicUser>("/auth/me"),
  async logout(): Promise<void> {
    await setToken(null);
  },
};

export const feedApi = {
  get: (cursor: string | null, limit = 20) =>
    request<CursorPage>(`/feed?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),
};
