/**
 * CeCeCar API client for the mobile app.
 *
 * Dev networking: phone/browser reach the dev backend over the VPN.
 * Native apps have no CORS; the web build's origin is allowed by the
 * backend's CORS_ORIGINS env.
 */
import { Platform } from "react-native";
import { router } from "expo-router";
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
  if (res.status === 401 && token) {
    // Stored token is expired or invalid — clear it and send the user to login.
    await setToken(null);
    router.replace("/login");
    throw new Error("Session expired — please log in again.");
  }
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

export type UserProfile = PublicUser & {
  bio?: string | null;
  location?: string | null;
  created_at?: string;
};

export type Vehicle = {
  id: string;
  owner_user_id: string;
  make: string;
  model: string;
  year: number | null;
  trim: string | null;
  nickname: string | null;
  vin: string | null;
  mileage: number | null;
  color: string | null;
  transmission: string | null;
  engine: string | null;
  drivetrain: string | null;
  description: string | null;
  cover_image_url: string | null;
  visibility: string;
  owner?: PublicUser | null;
};

export type EventDocument = {
  id?: string;
  url: string;
  filename: string;
  content_type: string;
  sort_order?: number;
};

export type VehicleEvent = {
  id: string;
  vehicle_id: string;
  event_type: string;
  title: string;
  description: string | null;
  event_date: string | null;
  mileage: number | null;
  cost_cents: number | null;
  currency: string;
  shop_name: string | null;
  location: string | null;
  visibility: string;
  media: Media[];
  documents: EventDocument[];
};

export type VehicleMod = {
  id: string;
  vehicle_id: string;
  category: string;
  name: string;
  brand: string | null;
  cost_cents: number | null;
  currency: string;
  link: string | null;
  installed_date: string | null;
  mileage: number | null;
  notes: string | null;
  sort_order: number;
  media: Media[];
};

export type Comment = {
  id: string;
  post_id: string;
  parent_comment_id: string | null;
  body: string;
  created_at: string;
  author: PublicUser | null;
  like_count: number;
  viewer_has_liked: boolean;
};

export type EventPayload = {
  eventType: string;
  title: string;
  description?: string | null;
  eventDate: string;
  mileage?: number | null;
  costCents?: number | null;
  currency?: string;
  shopName?: string | null;
  location?: string | null;
  visibility?: string;
  media?: Media[];
  documents?: EventDocument[];
};

export type ModPayload = {
  category: string;
  name: string;
  brand?: string | null;
  costCents?: number | null;
  currency?: string;
  installedDate?: string | null;
  mileage?: number | null;
  notes?: string | null;
  media?: Media[];
};

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

export const userApi = {
  me: () => request<UserProfile>("/auth/me"),
  get: (userId: string) => request<UserProfile>(`/users/${userId}`),
  update: (patch: Partial<Pick<UserProfile, "username" | "display_name" | "bio" | "location">>) =>
    request<UserProfile>("/users/me", { method: "PATCH", body: JSON.stringify(patch) }),
  vehicles: (userId: string) => request<Vehicle[]>(`/users/${userId}/vehicles`),
  posts: (userId: string) => request<Post[]>(`/users/${userId}/posts`),
};

export const vehicleApi = {
  get: (id: string) => request<Vehicle>(`/vehicles/${id}`),
  delete: (id: string) => request<void>(`/vehicles/${id}`, { method: "DELETE" }),
  posts: (id: string) => request<Post[]>(`/vehicles/${id}/posts`),
  gallery: (id: string) => request<Post[]>(`/vehicles/${id}/gallery`),
  events: (id: string) => request<VehicleEvent[]>(`/vehicles/${id}/events`),
  mods: (id: string) => request<VehicleMod[]>(`/vehicles/${id}/mods`),
};

export const eventApi = {
  get: (eventId: string) => request<VehicleEvent>(`/vehicle-events/${eventId}`),
  create: (vehicleId: string, payload: EventPayload) =>
    request<VehicleEvent>(`/vehicles/${vehicleId}/events`, { method: "POST", body: JSON.stringify(payload) }),
  update: (eventId: string, payload: Partial<EventPayload>) =>
    request<VehicleEvent>(`/vehicle-events/${eventId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  delete: (eventId: string) => request<void>(`/vehicle-events/${eventId}`, { method: "DELETE" }),
};

export const modApi = {
  create: (vehicleId: string, payload: ModPayload) =>
    request<VehicleMod>(`/vehicles/${vehicleId}/mods`, { method: "POST", body: JSON.stringify(payload) }),
  update: (modId: string, payload: Partial<ModPayload>) =>
    request<VehicleMod>(`/mods/${modId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  delete: (modId: string) => request<void>(`/mods/${modId}`, { method: "DELETE" }),
};

export const postApi = {
  get: (id: string) => request<Post>(`/posts/${id}`),
  create: (payload: { caption: string | null; vehicleIds: string[]; media: Media[] }) =>
    request<Post>("/posts", { method: "POST", body: JSON.stringify(payload) }),
  delete: (id: string) => request<void>(`/posts/${id}`, { method: "DELETE" }),
  like: (id: string) => request<void>(`/posts/${id}/like`, { method: "POST" }),
  unlike: (id: string) => request<void>(`/posts/${id}/like`, { method: "DELETE" }),
  likers: (id: string) => request<PublicUser[]>(`/posts/${id}/likes`),
  comments: (id: string) => request<Comment[]>(`/posts/${id}/comments`),
  addComment: (id: string, body: string, parentCommentId?: string) =>
    request<Comment>(`/posts/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ body, parentCommentId: parentCommentId ?? null }),
    }),
  deleteComment: (commentId: string) => request<void>(`/comments/${commentId}`, { method: "DELETE" }),
};

export type PickedAsset = { uri: string; mimeType?: string | null; fileName?: string | null };

async function appendAsset(form: FormData, field: string, asset: PickedAsset): Promise<void> {
  const name = asset.fileName ?? `photo-${Date.now()}.jpg`;
  const type = asset.mimeType ?? "image/jpeg";
  if (Platform.OS === "web") {
    const blob = await (await fetch(asset.uri)).blob();
    form.append(field, new File([blob], name, { type }));
  } else {
    // React Native's FormData file part shape
    form.append(field, { uri: asset.uri, name, type } as unknown as Blob);
  }
}

async function postForm<T>(path: string, form: FormData, errorLabel: string): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    let detail = `${errorLabel} (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // keep generic message
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

/**
 * Upload an image picked with expo-image-picker.
 * Native: FormData with a {uri, name, type} file part. Web: fetch the blob first.
 */
export async function uploadImage(asset: PickedAsset, purpose: string): Promise<Media> {
  const form = new FormData();
  await appendAsset(form, "file", asset);
  form.append("purpose", purpose);
  const data = await postForm<{ url: string }>("/media/upload", form, "Upload failed");
  return { url: data.url, media_type: "image" };
}

// --- AI scanning (backend-proxied Gemini) ---

export type ReceiptScan = {
  eventType: string;
  title: string;
  eventDate: string | null;
  costCents: number | null;
  currency: string;
  mileage: number | null;
  shopName: string | null;
  location: string | null;
  description: string | null;
  confidence: string;
  notes: string | null;
};

export type FuelScan = {
  totalCents: number | null;
  gallons: number | null;
  pricePerGallon: number | null;
  stationName: string | null;
  mileage: number | null;
  confidence: string;
  notes: string | null;
};

async function scanFiles<T>(path: string, assets: PickedAsset[], label: string): Promise<T> {
  const form = new FormData();
  for (const asset of assets) await appendAsset(form, "files", asset);
  return postForm<T>(path, form, label);
}

export const aiApi = {
  scanReceipt: (assets: PickedAsset[]) =>
    scanFiles<ReceiptScan>("/ai/receipt-scan", assets, "Receipt scan failed"),
  scanFuel: (assets: PickedAsset[]) =>
    scanFiles<FuelScan>("/ai/fuel-scan", assets, "Fuel scan failed"),
};
