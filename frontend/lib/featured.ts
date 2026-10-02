// The vehicle showcased on the logged-out home page. Defaults to the owner's
// 2004 4Runner (a real, public, two-owner history); override per environment
// with NEXT_PUBLIC_FEATURED_VEHICLE_ID (e.g. a local dev vehicle).
export const FEATURED_VEHICLE_ID =
  process.env.NEXT_PUBLIC_FEATURED_VEHICLE_ID || "a64befab-6eb8-4617-9516-8336f9847c6d";
