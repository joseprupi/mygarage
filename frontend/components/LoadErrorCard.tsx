"use client";

import Link from "next/link";

import { ApiError } from "@/lib/api/client";

// Styled load-failure state for shared detail links. A 404/403 on a shared
// link means the thing is private or gone — say so calmly instead of a bare
// "Failed to load" (this is exactly the page a buyer lands on).
export function LoadErrorCard({ error, noun }: { error: unknown; noun: string }) {
  const gone = error instanceof ApiError && (error.status === 404 || error.status === 403);
  return (
    <div className="surface rounded-3xl p-8 text-center">
      <h1 className="text-xl font-bold">
        {gone ? `This ${noun} is private or no longer exists.` : `Couldn't load this ${noun}.`}
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        {gone
          ? "The owner may have removed it or made it private."
          : "Something went wrong on our end. Try again in a moment."}
      </p>
      <Link href="/" className="btn btn-primary mt-5">
        Back to the feed
      </Link>
    </div>
  );
}
