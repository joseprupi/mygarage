import type { Comment, EventMedia, FeedPage, Post, PreviousVehicle, PublicUser, RecallsResponse, RedactionBox, UserSettings, Vehicle, VehicleEvent, VehicleMod, VehicleOwnership, VehicleSpecs, VehicleTransfer, VehicleTransferDetail, VinDecodeResult } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

/** Absolute-or-proxied URL for a backend path — use this for raw fetches (downloads) that bypass `api()`. */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

function humanizeField(field: string): string {
  const spaced = field.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// FastAPI returns validation errors as { detail: [{ loc, msg }, ...] }, which
// naively stringifies to "[object Object]". Turn it into a readable message.
function formatApiError(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((item) => {
      const loc = Array.isArray(item?.loc) ? item.loc : [];
      const field = loc.filter((p: unknown) => p !== "body").pop();
      const msg = typeof item?.msg === "string" ? item.msg : "Invalid value";
      return field ? `${humanizeField(String(field))}: ${msg}` : msg;
    });
    if (messages.length) return messages.join("; ");
  }
  return `Request failed: ${status}`;
}

// Error thrown for non-OK API responses. Carries the HTTP status so callers
// (and the QueryClient retry policy) can distinguish 4xx from transient errors.
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("carSocialToken");
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem("carSocialToken", token);
  else window.localStorage.removeItem("carSocialToken");
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(formatApiError(body, response.status), response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const authApi = {
  signup: (body: { username: string; email: string; password: string; display_name?: string }) =>
    api<{ accessToken: string; user: unknown }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  login: (body: { email: string; password: string }) =>
    api<{ accessToken: string; user: unknown }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  google: (credential: string) =>
    api<{ accessToken: string; user: unknown }>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential })
    }),
  me: () => api<unknown>("/auth/me"),
  updateProfile: (body: {
    display_name?: string;
    bio?: string;
    avatar_url?: string;
    location?: string;
    settings?: Partial<UserSettings>;
  }) => api<unknown>("/users/me", { method: "PATCH", body: JSON.stringify(body) }),
  changePassword: (body: { currentPassword?: string; newPassword: string }) =>
    api<void>("/auth/change-password", { method: "POST", body: JSON.stringify(body) }),
  deleteAccount: (body: { password?: string; confirm: "DELETE" }) =>
    api<void>("/users/me", { method: "DELETE", body: JSON.stringify(body) })
};

export type VehiclePayload = Partial<Omit<Vehicle, "specs">> & { specs?: VehicleSpecs | null };

export const vehicleApi = {
  create: (body: VehiclePayload) =>
    api<Vehicle>("/vehicles", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: VehiclePayload) =>
    api<Vehicle>(`/vehicles/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (id: string) => api<void>(`/vehicles/${id}`, { method: "DELETE" }),
  get: (id: string) => api<Vehicle>(`/vehicles/${id}`),
  myVehicles: (userId: string) => api<Vehicle[]>(`/users/${userId}/vehicles`),
  posts: (id: string) => api<Post[]>(`/vehicles/${id}/posts`),
  gallery: (id: string) => api<Post[]>(`/vehicles/${id}/gallery`),
  events: (id: string) => api<VehicleEvent[]>(`/vehicles/${id}/events`),
  mods: (id: string) => api<VehicleMod[]>(`/vehicles/${id}/mods`),
  /** POST /vehicles/{id}/decode-vin — decodes stored VIN, saves specs, returns updated vehicle. */
  decodeVin: (id: string) => api<Vehicle>(`/vehicles/${id}/decode-vin`, { method: "POST" }),
  /** GET /vehicles/{id}/recalls — NHTSA recall data. */
  recalls: (id: string) => api<RecallsResponse>(`/vehicles/${id}/recalls`)
};

export const vinApi = {
  /** GET /vin/decode/{vin} — decode a VIN without saving. Auth required. */
  decode: (vin: string) => api<VinDecodeResult>(`/vin/decode/${encodeURIComponent(vin)}`)
};

export const postApi = {
  create: (body: unknown) => api<Post>("/posts", { method: "POST", body: JSON.stringify(body) }),
  delete: (id: string) => api<void>(`/posts/${id}`, { method: "DELETE" }),
  like: (id: string) => api<void>(`/posts/${id}/like`, { method: "POST" }),
  unlike: (id: string) => api<void>(`/posts/${id}/like`, { method: "DELETE" }),
  likers: (id: string) => api<PublicUser[]>(`/posts/${id}/likes`),
  comments: (id: string) => api<Comment[]>(`/posts/${id}/comments`),
  comment: (id: string, body: string) =>
    api<Comment>(`/posts/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ body })
    }),
  deleteComment: (id: string) => api<void>(`/comments/${id}`, { method: "DELETE" }),
  likeComment: (id: string) => api<void>(`/comments/${id}/like`, { method: "POST" }),
  unlikeComment: (id: string) => api<void>(`/comments/${id}/like`, { method: "DELETE" })
};

export const feedApi = {
  get: (cursor?: string | null, limit = 20) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    return api<FeedPage>(`/feed?${params.toString()}`);
  }
};

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
  tags: string[];
  confidence: string;
  notes: string | null;
};

export const aiApi = {
  // Backend-proxied Gemini extraction. 503 (ApiError) when GEMINI_API_KEY is unset.
  scanReceipt: async (files: File[]) => {
    const token = getToken();
    const form = new FormData();
    for (const file of files) form.append("files", file);
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${API_BASE}/ai/receipt-scan`, {
      method: "POST",
      headers,
      body: form
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.detail ?? `Receipt scan failed: ${response.status}`);
    }
    return response.json() as Promise<ReceiptScan>;
  }
};

export const mediaApi = {
  uploadUrl: (body: { filename: string; contentType: string; purpose: string }) =>
    api<{ uploadUrl: string; publicUrl: string; objectKey: string; maxUploadBytes: number }>(
      "/media/upload-url",
      { method: "POST", body: JSON.stringify(body) }
    ),
  // Direct upload: streams the file through the API to storage. Works even when
  // the browser cannot reach the object store host directly (e.g. over a tunnel).
  upload: async (file: File, purpose: string) => {
    const token = getToken();
    const form = new FormData();
    form.append("file", file);
    form.append("purpose", purpose);
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${API_BASE}/media/upload`, {
      method: "POST",
      headers,
      body: form
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.detail ?? `Upload failed: ${response.status}`);
    }
    return response.json() as Promise<{ url: string; objectKey: string }>;
  },
  // Reserve a Cloudflare Stream direct-creator-upload slot. Returns the upload
  // target plus the derived playback URLs. The backend answers 503 (ApiError
  // with status 503) when Stream isn't configured — callers handle that
  // gracefully rather than treating it as a hard failure.
  videoDirectUpload: (maxDurationSeconds?: number) =>
    api<{
      uid: string;
      uploadUrl: string;
      playbackUrl: string;
      hlsUrl: string;
      iframeUrl: string;
      thumbnailUrl: string;
    }>("/media/video/direct-upload", {
      method: "POST",
      body: JSON.stringify(maxDurationSeconds ? { maxDurationSeconds } : {})
    }),
  // Poll a reserved video's processing status until `ready` is true.
  videoStatus: (uid: string) =>
    api<{ ready: boolean; state: string; durationSeconds: number | null }>(
      `/media/video/${uid}/status`
    )
};

// POST a File to an arbitrary absolute URL (Cloudflare's upload.videodelivery.net
// target). This deliberately does NOT go through API_BASE — it talks straight to
// Cloudflare. Uses XMLHttpRequest so we can surface upload progress.
export function uploadFileToUrl(
  uploadUrl: string,
  file: File,
  onProgress?: (fraction: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl, true);
    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded / event.total);
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

export const catalogApi = {
  makes: () => api<string[]>("/catalog/makes"),
  years: () => api<number[]>("/catalog/years"),
  models: (make: string, year: number) =>
    api<string[]>(`/catalog/models?make=${encodeURIComponent(make)}&year=${year}`)
};

export const geoApi = {
  search: (q: string) => api<string[]>(`/geo/search?q=${encodeURIComponent(q)}`)
};

export const eventApi = {
  create: (vehicleId: string, body: unknown) =>
    api<VehicleEvent>(`/vehicles/${vehicleId}/events`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  get: (eventId: string) => api<VehicleEvent>(`/vehicle-events/${eventId}`),
  update: (eventId: string, body: unknown) =>
    api<VehicleEvent>(`/vehicle-events/${eventId}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    }),
  delete: (eventId: string) => api<void>(`/vehicle-events/${eventId}`, { method: "DELETE" }),
  setHidden: (eventId: string, hidden: boolean) =>
    api<void>(`/vehicle-events/${eventId}/hidden`, {
      method: "PATCH",
      body: JSON.stringify({ hidden })
    })
};

export const reportApi = {
  create: (body: {
    targetType: "post" | "comment" | "user" | "vehicle" | "event";
    targetId: string;
    reason: "spam" | "harassment" | "inappropriate" | "privacy" | "other";
    details?: string;
  }) => api<void>("/reports", { method: "POST", body: JSON.stringify(body) })
};

export const blockApi = {
  block: (userId: string) => api<void>(`/users/${userId}/block`, { method: "POST" }),
  unblock: (userId: string) => api<void>(`/users/${userId}/block`, { method: "DELETE" }),
  list: () => api<PublicUser[]>("/users/me/blocks")
};

export const transferApi = {
  create: (
    vehicleId: string,
    body: {
      handoverDate?: string | null;
      handoverMileage?: number | null;
      showOwnerName?: boolean;
      keepDocuments?: boolean;
      keepPostsTagged?: boolean;
    }
  ) => api<VehicleTransfer>(`/vehicles/${vehicleId}/transfers`, { method: "POST", body: JSON.stringify(body) }),
  pending: (vehicleId: string) => api<VehicleTransfer>(`/vehicles/${vehicleId}/transfers/pending`),
  revoke: (transferId: string) => api<void>(`/transfers/${transferId}`, { method: "DELETE" }),
  byCode: (code: string) => api<VehicleTransferDetail>(`/transfers/by-code/${code}`),
  accept: (code: string) => api<Vehicle>(`/transfers/by-code/${code}/accept`, { method: "POST" }),
  previousVehicles: () => api<PreviousVehicle[]>("/users/me/vehicles/previous")
};

export const modApi = {
  create: (vehicleId: string, body: unknown) =>
    api<VehicleMod>(`/vehicles/${vehicleId}/mods`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  update: (modId: string, body: unknown) =>
    api<VehicleMod>(`/mods/${modId}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    }),
  delete: (modId: string) => api<void>(`/mods/${modId}`, { method: "DELETE" })
};

// PATCH /vehicle-event-media/{id} — set visibility ('private'|'redacted'|'original').
// Returns 409 {detail} when the transition is not allowed; ApiError carries the message.
export const eventMediaApi = {
  setVisibility: (id: string, visibility: "private" | "redacted" | "original") =>
    api<EventMedia>(`/vehicle-event-media/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ visibility })
    })
};

// PATCH /vehicle-event-documents/{id} — same semantics as eventMediaApi.setPublic.
export const eventDocumentApi = {
  setPublic: (id: string, isPublic: boolean) =>
    api<void>(`/vehicle-event-documents/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ isPublic })
    })
};

export const ownershipApi = {
  list: (vehicleId: string) => api<VehicleOwnership[]>(`/vehicles/${vehicleId}/ownerships`),
  create: (
    vehicleId: string,
    body: {
      label?: string | null;
      startDate: string;
      startMileage?: number | null;
      endDate?: string | null;
      endMileage?: number | null;
    }
  ) =>
    api<VehicleOwnership>(`/vehicles/${vehicleId}/ownerships`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  update: (
    id: string,
    body: {
      label?: string | null;
      startDate?: string;
      startMileage?: number | null;
      endDate?: string | null;
      endMileage?: number | null;
    }
  ) =>
    api<VehicleOwnership>(`/ownerships/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    }),
  remove: (id: string) => api<void>(`/ownerships/${id}`, { method: "DELETE" })
};

// ─── Redaction API ───────────────────────────────────────────────────────────
// Owner-only. PATCH boxes replaces boxes + re-renders the redacted copy in place.
// POST regenerate re-runs AI box detection and re-renders. 503/502 on AI errors.
export const redactionApi = {
  setBoxes: (mediaId: string, boxes: RedactionBox[]) =>
    api<EventMedia>(`/vehicle-event-media/${mediaId}/redaction/boxes`, {
      method: "PATCH",
      body: JSON.stringify({ boxes })
    }),
  regenerate: (mediaId: string) =>
    api<EventMedia>(`/vehicle-event-media/${mediaId}/redaction/regenerate`, { method: "POST" })
};
