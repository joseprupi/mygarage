"use client";

import Link from "next/link";

import { useMe } from "@/lib/useMe";

// Shown at the top of the home feed for guests only. Hides itself once the
// ["me"] query resolves to a logged-in user, so logged-in users never see it.
export function GuestHero({ exampleVehicleId }: { exampleVehicleId?: string }) {
  const me = useMe();

  // While loading, render nothing (avoid layout shift for logged-in users)
  if (me.isPending || me.data) return null;

  return (
    <div className="surface rounded-3xl p-8 mb-6">
      <h1 className="text-3xl font-bold tracking-tight mb-2">
        Your car&apos;s life, in one place.
      </h1>
      <p className="text-slate-600 mb-6 max-w-md">
        Service history, mods, fuel and photos — a shareable record for every car you own.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/auth" className="btn btn-primary">
          Create account
        </Link>
        {exampleVehicleId && (
          <Link href={`/v/${exampleVehicleId}`} className="btn btn-secondary">
            See an example
          </Link>
        )}
      </div>
    </div>
  );
}
