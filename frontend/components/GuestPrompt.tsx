"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { authApi } from "@/lib/api/client";

// Subtle "log in" affordance shown only to logged-out (guest) visitors above
// the feed. Logged-in users see nothing extra.
export function GuestPrompt() {
  const { data, error, isPending } = useQuery({
    queryKey: ["me"],
    queryFn: authApi.me,
    retry: false
  });

  // Only reveal the prompt once we know the visitor is a guest, so a logged-in
  // user doesn't see it flash before `me` resolves.
  if (isPending) return null;
  const isGuest = !data || !!error;
  if (!isGuest) return null;

  return (
    <div className="surface flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-sm">
      <span className="text-slate-600">Browsing as a guest</span>
      <Link className="font-medium text-petrol" href="/auth">
        Log in or Sign up
      </Link>
    </div>
  );
}
