/**
 * CarFable API client for the mobile app.
 *
 * Dev networking: phone/browser reach the dev backend over the VPN.
 * Native apps have no CORS; the web build's origin is allowed by the
 * backend's CORS_ORIGINS env.
 */
import { Platform } from "react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";

// Production by default (Cloud Run). Dev overrides via mobile/.env.development
// (EXPO_PUBLIC_* vars are inlined by Expo at bundle time).
const PROD_API = "https://mygarage-backend-147573336932.us-central1.run.app";
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? PROD_API;
export const IS_PROD_API = API_BASE === PROD_API;
// Dev stack stores relative "/media/..." URLs that map to the local MinIO bucket;
// production stores absolute GCS URLs, which pass straight through.
const MEDIA_BASE = process.env.EXPO_PUBLIC_MEDIA_BASE ?? "";

export function mediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  if (url.startsWith("/media/") && MEDIA_BASE) return MEDIA_BASE + url.slice("/media".length);
  return API_BASE + url;
}

// --- token storage: SecureStore on device, localStorage on web ---

const TOKEN_KEY = "carfable_token";

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

export type PostMedia = {
  id?: string;
  url: string;
  media_type?: "image" | "video" | null;
  thumbnail_url?: string | null;
  sort_order?: number;
  width?: number | null;
  height?: number | null;
  mediaType?: string; // set by uploadImage before posting; ignored by the backend (media_type defaults to image)
};

export type RedactionBox = {
  kind: string;
  /** [ymin, xmin, ymax, xmax] in 0–1000 coordinate space */
  box: [number, number, number, number];
  source?: string;
};

export type Media = {
  id?: string;
  url: string | null;           // null for non-owners when private; presigned absolute URL for owners
  mediaType?: string | null;    // camelCase from backend
  thumbnailUrl?: string | null; // camelCase from backend
  width?: number | null;
  height?: number | null;
  sortOrder?: number;
  isPublic?: boolean;
  piiStatus?: "unknown" | "none" | "detected";
  piiKinds?: string[];
  blurUrl?: string | null;      // relative /media/... path (public bucket)
  canView?: boolean;
  createdAt?: string;
  // Redaction — owner sees all; visitor sees redactedUrl + canViewRedacted when published
  redactionStatus?: string | null;        // null | 'proposed' | 'published'
  redactionBoxes?: RedactionBox[] | null;
  redactedUrl?: string | null;
  redactionPreviewUrl?: string | null;
  canViewRedacted?: boolean;
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
  media: PostMedia[];
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

export type UserSettings = {
  detectMissedFillups: boolean;
  includeEstimatedFuel: boolean;
};

export type UserProfile = PublicUser & {
  bio?: string | null;
  location?: string | null;
  created_at?: string;
  settings?: UserSettings;
  has_password?: boolean;
  viewerHasBlocked?: boolean;
  blockedViewer?: boolean;
};

export type VehicleSpecs = {
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  bodyClass?: string | null;
  driveType?: string | null;
  engineCylinders?: number | null;
  displacementL?: number | null;
  engineHp?: number | null;
  fuelType?: string | null;
  transmission?: string | null;
  plantCountry?: string | null;
};

export type VinDecodeResult = {
  vin: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  bodyClass?: string | null;
  driveType?: string | null;
  engineCylinders?: number | null;
  displacementL?: number | null;
  engineHp?: number | null;
  fuelType?: string | null;
  transmission?: string | null;
  plantCountry?: string | null;
  errorCode?: string | null;
  errorText?: string | null;
  matched: boolean;
};

export type RecallResult = {
  campaignNumber: string;
  reportReceivedDate?: string | null;
  component?: string | null;
  summary?: string | null;
  consequence?: string | null;
  remedy?: string | null;
  notes?: string | null;
  parkIt: boolean;
  parkOutside: boolean;
};

export type RecallsResponse = {
  count: number;
  results: RecallResult[];
  unavailable?: boolean;
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
  purchase_date: string | null;
  color: string | null;
  transmission: string | null;
  engine: string | null;
  drivetrain: string | null;
  description: string | null;
  cover_image_url: string | null;
  visibility: string;
  owner?: PublicUser | null;
  specs?: VehicleSpecs | null;
  specs_decoded_at?: string | null;
};

export type EventDocument = {
  id?: string;
  url: string | null;           // null for non-owners when private
  filename: string;
  content_type: string;
  sort_order?: number;
  isPublic?: boolean;
  piiStatus?: "unknown" | "none" | "detected";
  piiKinds?: string[];
  blurUrl?: string | null;
  canView?: boolean;
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
  fuel_gallons: number | null;
  fuel_price_cents: number | null;
  fuel_full_tank: boolean;
  fuel_missed_previous: boolean | null;
  tags: string[];
  currency: string;
  shop_name: string | null;
  location: string | null;
  visibility: string;
  media: Media[];
  documents: EventDocument[];
  // Ownership fields (camelCase per backend alias)
  ownershipId: string | null;
  isPreviousOwner: boolean;
  canEdit: boolean;
  hidden?: boolean;
  // Provenance fields
  source?: "manual" | "scan" | "scan_edited";
  editedFields?: string[];
  scanSnapshot?: unknown; // owner-only raw scan object
};

export type VehicleOwnership = {
  id: string;
  ordinal: number;
  ownerUserId: string | null;
  ownerUsername: string | null;
  label: string | null;
  startDate: string;
  startMileage: number | null;
  endDate: string | null;
  endMileage: number | null;
  isCurrent: boolean;
  showOwnerName: boolean;
};

export type OwnershipPayload = {
  label?: string | null;
  startDate: string;
  startMileage?: number | null;
  endDate?: string | null;
  endMileage?: number | null;
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
  fuelGallons?: number | null;
  fuelPriceCents?: number | null;
  fuelFullTank?: boolean;
  fuelMissedPrevious?: boolean | null;
  tags?: string[];
  currency?: string;
  shopName?: string | null;
  location?: string | null;
  visibility?: string;
  media?: Array<{ url: string | null; sort_order?: number }>;
  documents?: EventDocument[];
  source?: "manual" | "scan";
  scanSnapshot?: unknown;
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
  update: (patch: Partial<Pick<UserProfile, "username" | "display_name" | "bio" | "location"> & { settings?: Partial<UserSettings> }>) =>
    request<UserProfile>("/users/me", { method: "PATCH", body: JSON.stringify(patch) }),
  updateSettings: (partial: Partial<UserSettings>) =>
    request<UserProfile>("/users/me", { method: "PATCH", body: JSON.stringify({ settings: partial }) }),
  vehicles: (userId: string) => request<Vehicle[]>(`/users/${userId}/vehicles`),
  posts: (userId: string) => request<Post[]>(`/users/${userId}/posts`),
};

export type VehiclePayload = {
  make: string;
  model: string;
  year?: number | null;
  trim?: string | null;
  nickname?: string | null;
  vin?: string | null;
  mileage?: number | null;
  purchase_date?: string | null;
  color?: string | null;
  description?: string | null;
  cover_image_url?: string | null;
  visibility?: string;
  specs?: VehicleSpecs | null;
};

export const catalogApi = {
  makes: () => request<string[]>("/catalog/makes"),
  models: (make: string, year: number) =>
    request<string[]>(`/catalog/models?make=${encodeURIComponent(make)}&year=${year}`),
};

export const vinApi = {
  decode: (vin: string) => request<VinDecodeResult>(`/vin/decode/${encodeURIComponent(vin)}`),
};

export const vehicleApi = {
  get: (id: string) => request<Vehicle>(`/vehicles/${id}`),
  create: (payload: VehiclePayload) =>
    request<Vehicle>("/vehicles", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: string, payload: Partial<VehiclePayload>) =>
    request<Vehicle>(`/vehicles/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  delete: (id: string) => request<void>(`/vehicles/${id}`, { method: "DELETE" }),
  posts: (id: string) => request<Post[]>(`/vehicles/${id}/posts`),
  gallery: (id: string) => request<Post[]>(`/vehicles/${id}/gallery`),
  events: (id: string) => request<VehicleEvent[]>(`/vehicles/${id}/events`),
  mods: (id: string) => request<VehicleMod[]>(`/vehicles/${id}/mods`),
  decodeVin: (id: string) => request<Vehicle>(`/vehicles/${id}/decode-vin`, { method: "POST" }),
  recalls: (id: string) => request<RecallsResponse>(`/vehicles/${id}/recalls`),
};

export const eventApi = {
  get: (eventId: string) => request<VehicleEvent>(`/vehicle-events/${eventId}`),
  create: (vehicleId: string, payload: EventPayload) =>
    request<VehicleEvent>(`/vehicles/${vehicleId}/events`, { method: "POST", body: JSON.stringify(payload) }),
  update: (eventId: string, payload: Partial<EventPayload>) =>
    request<VehicleEvent>(`/vehicle-events/${eventId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  delete: (eventId: string) => request<void>(`/vehicle-events/${eventId}`, { method: "DELETE" }),
  setHidden: (eventId: string, hidden: boolean) =>
    request<void>(`/vehicle-events/${eventId}/hidden`, { method: "PATCH", body: JSON.stringify({ hidden }) }),
};

export const ownershipApi = {
  list: (vehicleId: string) => request<VehicleOwnership[]>(`/vehicles/${vehicleId}/ownerships`),
  create: (vehicleId: string, payload: OwnershipPayload) =>
    request<VehicleOwnership>(`/vehicles/${vehicleId}/ownerships`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: string, payload: Partial<OwnershipPayload>) =>
    request<VehicleOwnership>(`/ownerships/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  remove: (id: string) => request<void>(`/ownerships/${id}`, { method: "DELETE" }),
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
  create: (payload: { caption: string | null; vehicleIds: string[]; media: PostMedia[] }) =>
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
export async function uploadImage(asset: PickedAsset, purpose: string): Promise<{ url: string; mediaType: "image" }> {
  const form = new FormData();
  await appendAsset(form, "file", asset);
  form.append("purpose", purpose);
  const data = await postForm<{ url: string }>("/media/upload", form, "Upload failed");
  return { url: data.url, mediaType: "image" };
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
  tags: string[];
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

export const googleAuthApi = {
  /** Exchange a Google ID token for a CarFable session (same endpoint the web uses). */
  async login(credential: string): Promise<TokenResponse> {
    const data = await request<TokenResponse>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    });
    await setToken(data.accessToken);
    return data;
  },
};

export const appleAuthApi = {
  /** Exchange an Apple identityToken for a CarFable session. */
  async login(credential: string, fullName?: string | null): Promise<TokenResponse> {
    const data = await request<TokenResponse>("/auth/apple", {
      method: "POST",
      body: JSON.stringify({ credential, fullName: fullName ?? null }),
    });
    await setToken(data.accessToken);
    return data;
  },
};

export const eventMediaApi = {
  /** Toggle public/private on an event media item. Throws with detail on 409 (PII lock). */
  setPublic: (id: string, isPublic: boolean) =>
    request<Media>(`/vehicle-event-media/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ isPublic }),
    }),
};

export const redactionApi = {
  /** Run AI redaction detection; returns media with status 'proposed' and AI boxes. */
  propose: (mediaId: string) =>
    request<Media>(`/vehicle-event-media/${mediaId}/redaction/propose`, { method: "POST" }),
  /** Replace all boxes (re-renders preview server-side). */
  setBoxes: (mediaId: string, boxes: RedactionBox[]) =>
    request<Media>(`/vehicle-event-media/${mediaId}/redaction/boxes`, {
      method: "PATCH",
      body: JSON.stringify({ boxes }),
    }),
  /** Publish the redacted copy (makes it visible to visitors via canViewRedacted). */
  publish: (mediaId: string) =>
    request<Media>(`/vehicle-event-media/${mediaId}/redaction/publish`, { method: "POST" }),
  /** Unpublish the redacted copy (hides it from visitors). */
  unpublish: (mediaId: string) =>
    request<Media>(`/vehicle-event-media/${mediaId}/redaction/unpublish`, { method: "POST" }),
};

export const eventDocumentApi = {
  /** Toggle public/private on an event document. Throws with detail on 409 (PII lock). */
  setPublic: (id: string, isPublic: boolean) =>
    request<EventDocument>(`/vehicle-event-documents/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ isPublic }),
    }),
};

// --- Transfer types ---

export type TransferRecord = {
  id: string;
  code: string;
  url: string;
  status: string;
  handoverDate: string | null;
  handoverMileage: number | null;
  showOwnerName: boolean;
  keepDocuments: boolean;
  keepPostsTagged: boolean;
  expiresAt: string;
  vehicle: {
    id: string;
    year: number | null;
    make: string;
    model: string;
    nickname: string | null;
    coverUrl: string | null;
  };
  fromUser: { username: string; displayName: string | null } | null;
};

export type TransferPreview = TransferRecord & {
  counts: { events: number; mods: number; photos: number };
  canAccept: boolean;
};

export type PreviousVehicle = {
  vehicle: Vehicle;
  period_start: string;
  period_end: string | null;
  is_public: boolean;
};

// --- New API groups ---

export const authApiExtra = {
  changePassword: (currentPassword: string | undefined, newPassword: string) =>
    request<void>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(
        currentPassword !== undefined
          ? { currentPassword, newPassword }
          : { newPassword },
      ),
    }),
};

export type ReportPayload = {
  targetType: "post" | "comment" | "user" | "vehicle" | "event";
  targetId: string;
  reason: "spam" | "harassment" | "inappropriate" | "privacy" | "other";
  details?: string;
};

export const reportApi = {
  create: (payload: ReportPayload) =>
    request<void>("/reports", { method: "POST", body: JSON.stringify(payload) }),
};

export const blockApi = {
  block: (userId: string) =>
    request<void>(`/users/${userId}/block`, { method: "POST" }),
  unblock: (userId: string) =>
    request<void>(`/users/${userId}/block`, { method: "DELETE" }),
  list: () => request<UserProfile[]>("/users/me/blocks"),
};

export type TransferCreatePayload = {
  handoverDate?: string | null;
  handoverMileage?: number | null;
  showOwnerName?: boolean;
  keepDocuments?: boolean;
  keepPostsTagged?: boolean;
};

export const transferApi = {
  create: (vehicleId: string, payload: TransferCreatePayload) =>
    request<TransferRecord>(`/vehicles/${vehicleId}/transfers`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  pending: (vehicleId: string) =>
    request<TransferRecord>(`/vehicles/${vehicleId}/transfers/pending`),
  revoke: (transferId: string) =>
    request<void>(`/transfers/${transferId}`, { method: "DELETE" }),
  byCode: (code: string) =>
    request<TransferPreview>(`/transfers/by-code/${code}`),
  accept: (code: string) =>
    request<Vehicle>(`/transfers/by-code/${code}/accept`, { method: "POST" }),
  previousVehicles: () =>
    request<PreviousVehicle[]>("/users/me/vehicles/previous"),
};
