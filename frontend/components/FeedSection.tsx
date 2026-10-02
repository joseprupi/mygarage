"use client";

import { useMe } from "@/lib/useMe";
import { Feed } from "@/components/Feed";

// Renders the feed only for logged-in users. Guests see the server-rendered
// landing instead; the wrapper in app/page.tsx is CSS-gated (.member-only) so
// nothing here flashes for them.
export function FeedSection() {
  const me = useMe();
  if (!me.data) return null;
  return <Feed />;
}
