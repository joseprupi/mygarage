"use client";

import Link from "next/link";

import { useMe } from "@/lib/useMe";

type FeaturedVehicle = {
  id: string;
  year?: number | null;
  make: string;
  model: string;
  nickname?: string | null;
};

export function GuestHero({
  exampleVehicleId,
  featuredVehicle,
}: {
  exampleVehicleId?: string;
  featuredVehicle?: FeaturedVehicle;
}) {
  const me = useMe();

  // While loading, render nothing (avoid layout shift for logged-in users)
  if (me.isPending || me.data) return null;

  const vehicleLabel = featuredVehicle
    ? [featuredVehicle.year, featuredVehicle.make, featuredVehicle.model]
        .filter(Boolean)
        .join(" ")
    : null;

  const vehicleAge =
    featuredVehicle?.year ? new Date().getFullYear() - featuredVehicle.year : null;

  return (
    <>
      <div className="surface rounded-3xl p-8 mb-2">
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

      {featuredVehicle && vehicleLabel && (
        <Link
          href={`/v/${featuredVehicle.id}?tab=history`}
          className="surface hover-lift rounded-3xl p-5 flex items-center justify-between gap-4 group"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-petrol mb-1">
              Real history
            </p>
            <p className="font-semibold text-base leading-snug">{vehicleLabel}</p>
            {vehicleAge != null && vehicleAge > 0 && (
              <p className="text-sm text-slate-500 mt-0.5">
                {vehicleAge} year{vehicleAge === 1 ? "" : "s"} of service records
              </p>
            )}
          </div>
          <span className="shrink-0 text-slate-400 group-hover:text-petrol transition-colors text-lg">
            →
          </span>
        </Link>
      )}

      <div className="surface rounded-3xl p-5 flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-sm">CarFable for iPhone</p>
          <p className="text-xs text-slate-500 mt-0.5">Log receipts, track history on the go.</p>
        </div>
        <Link
          href="https://apps.apple.com/us/app/carfable/id6804418892"
          className="btn btn-secondary shrink-0 text-sm"
          target="_blank"
          rel="noopener noreferrer"
        >
          Download on the App Store
        </Link>
      </div>
    </>
  );
}
