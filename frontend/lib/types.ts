export type UserSettings = {
  detectMissedFillups: boolean;
  includeEstimatedFuel: boolean;
};

/** Decoded VIN specs stored on the vehicle. All fields optional (partial decode). */
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

/** Result of GET /vin/decode/{vin}. */
export type VinDecodeResult = VehicleSpecs & {
  vin: string;
  errorCode?: string | null;
  errorText?: string | null;
  matched: boolean;
};

export type Recall = {
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
  results: Recall[];
  unavailable?: boolean;
};

export type PublicUser = {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  location?: string | null;
  settings?: UserSettings;
  viewerHasBlocked?: boolean;
  blockedViewer?: boolean;
};

export type Vehicle = {
  id: string;
  owner_user_id: string;
  make: string;
  model: string;
  year?: number | null;
  trim?: string | null;
  nickname?: string | null;
  vin?: string | null;
  mileage?: number | null;
  purchase_date?: string | null;
  color?: string | null;
  transmission?: string | null;
  engine?: string | null;
  drivetrain?: string | null;
  description?: string | null;
  cover_image_url?: string | null;
  visibility: "public" | "private" | "unlisted";
  specs?: VehicleSpecs | null;
  specs_decoded_at?: string | null;
  owner?: PublicUser | null;
};

export type VehicleSummary = {
  id: string;
  year?: number | null;
  make: string;
  model: string;
  nickname?: string | null;
  cover_image_url?: string | null;
};

// Used for post/mod/gallery media (snake_case, public bucket).
export type Media = {
  id?: string;
  url: string;
  media_type: "image" | "video";
  thumbnail_url?: string | null;
  width?: number | null;
  height?: number | null;
  duration_seconds?: number | null;
  sort_order?: number;
  /** Client-only: object URL for in-form preview of private-bucket items. Never sent to API. */
  localPreviewUrl?: string;
};

// API response shape for items in VehicleEvent.media (camelCase + privacy fields).
export type EventMedia = {
  id: string;
  /** null for non-owners when the item is private. */
  url: string | null;
  /** Blurred placeholder image URL (always public). */
  blurUrl: string | null;
  isPublic: boolean;
  piiStatus: "unknown" | "none" | "detected";
  piiKinds: string[];
  /** Whether the current viewer can see the full item. */
  canView: boolean;
  mediaType: "image" | "video";
  thumbnailUrl: string | null;
  sortOrder: number;
  createdAt: string;
};

// Simple form-state type used in VehicleEventForm + DocumentUploader (upload flow).
export type EventDocument = {
  id?: string;
  url: string;
  filename: string;
  content_type: string;
  sort_order?: number;
};

// API response shape for items in VehicleEvent.documents (camelCase + privacy fields).
export type EventDocumentRead = {
  id: string;
  /** null for non-owners when the item is private. */
  url: string | null;
  /** Blurred placeholder image URL (always public). */
  blurUrl: string | null;
  isPublic: boolean;
  piiStatus: "unknown" | "none" | "detected";
  piiKinds: string[];
  /** Whether the current viewer can see the full item. */
  canView: boolean;
  filename: string;
  contentType: string;
  sortOrder: number;
  createdAt: string;
};

export type Post = {
  id: string;
  caption?: string | null;
  visibility: "public" | "private" | "unlisted";
  created_at: string;
  updated_at: string;
  author: PublicUser;
  media: Media[];
  vehicles: VehicleSummary[];
  like_count: number;
  comment_count: number;
  viewer_has_liked: boolean;
};

export type Comment = {
  id: string;
  post_id: string;
  author_user_id: string;
  parent_comment_id?: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  author?: PublicUser | null;
  like_count: number;
  viewer_has_liked: boolean;
};

export type FeedPage = {
  items: Post[];
  nextCursor?: string | null;
  hasMore: boolean;
};

export type VehicleEvent = {
  id: string;
  vehicle_id: string;
  event_type: string;
  title: string;
  description?: string | null;
  event_date?: string | null;
  mileage?: number | null;
  cost_cents?: number | null;
  fuel_gallons?: number | null;
  fuel_price_cents?: number | null;
  fuel_full_tank?: boolean;
  fuel_missed_previous?: boolean | null;
  currency: string;
  shop_name?: string | null;
  location?: string | null;
  tags?: string[];
  visibility: "public" | "private";
  hidden?: boolean;
  media: EventMedia[];
  documents: EventDocumentRead[];
  /** How the event was created: manual entry, scanned receipt, or scan that was then edited. */
  source: "manual" | "scan" | "scan_edited";
  /** Which trust fields were changed after a scan prefill (backend-computed). */
  editedFields: string[];
  /** Original scan output — owner-only; null for visitors. */
  scanSnapshot: Record<string, unknown> | null;
  created_at: string;
  // Ownership attribution (camelCase — matches backend aliases)
  ownershipId: string | null;
  isPreviousOwner: boolean;
  canEdit: boolean;
};

export type VehicleTransfer = {
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

export type VehicleTransferDetail = VehicleTransfer & {
  counts: { events: number; mods: number; photos: number };
  canAccept: boolean;
};

export type PreviousVehicle = {
  vehicle: Vehicle;
  period_start: string;
  period_end: string | null;
  is_public: boolean;
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

export type VehicleMod = {
  id: string;
  vehicle_id: string;
  author_user_id: string;
  category: string;
  name: string;
  brand?: string | null;
  cost_cents?: number | null;
  currency: string;
  link?: string | null;
  installed_date?: string | null;
  mileage?: number | null;
  notes?: string | null;
  media: Media[];
  sort_order: number;
  created_at: string;
  updated_at: string;
};
