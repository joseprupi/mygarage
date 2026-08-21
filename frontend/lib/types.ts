export type PublicUser = {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  location?: string | null;
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

export type Media = {
  id?: string;
  url: string;
  media_type: "image" | "video";
  thumbnail_url?: string | null;
  width?: number | null;
  height?: number | null;
  duration_seconds?: number | null;
  sort_order?: number;
};

export type EventDocument = {
  id?: string;
  url: string;
  filename: string;
  content_type: string;
  sort_order?: number;
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
  currency: string;
  shop_name?: string | null;
  location?: string | null;
  visibility: "public" | "private";
  media: Media[];
  documents: EventDocument[];
  created_at: string;
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
