"use client";

import { useMe } from "@/lib/useMe";
import { Feed } from "@/components/Feed";

// Renders the feed only for logged-in users.
// Guests see the hero/showcase instead (GuestHero handles that).
export function FeedSection() {
  const me = useMe();
  // While me is pending or guest: show nothing (GuestHero handles guest content).
  if (!me.data) return null;
  return <Feed />;
}
