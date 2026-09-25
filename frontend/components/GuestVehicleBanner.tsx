"use client";

import Link from "next/link";

import { useMe } from "@/lib/useMe";

/** Slim invitation shown to logged-out visitors on public vehicle pages. */
export function GuestVehicleBanner() {
  const me = useMe();
  if (me.isLoading || me.data) return null;
  return (
    <div className="surface flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-3">
      <p className="text-sm text-slate-600">Keep a log like this for your own car.</p>
      <div className="flex items-center gap-2">
        <Link href="/auth" className="btn btn-primary text-xs">
          Sign up free
        </Link>
        <a
          href="https://apps.apple.com/us/app/carfable/id6804418892"
          className="btn btn-secondary text-xs"
          target="_blank"
          rel="noreferrer"
        >
           App Store
        </a>
      </div>
    </div>
  );
}
