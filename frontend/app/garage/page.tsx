"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { api, transferApi } from "@/lib/api/client";
import { useMe } from "@/lib/useMe";
import { formatDate } from "@/lib/format";
import type { PreviousVehicle, Vehicle } from "@/lib/types";

export default function GaragePage() {
  const me = useMe();
  const user = me.data as { id: string } | undefined;
  const vehicles = useQuery({
    queryKey: ["garage", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => api<Vehicle[]>(`/users/${user!.id}/vehicles`)
  });
  const previousVehicles = useQuery({
    queryKey: ["previousVehicles"],
    enabled: Boolean(user?.id),
    queryFn: () => transferApi.previousVehicles(),
    retry: false
  });

  if (me.isPending) {
    return <div className="surface rounded-3xl p-6 text-sm text-slate-500">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="surface rounded-3xl p-6">
        <p className="mb-4">Log in to see your garage.</p>
        <Link href="/auth" className="btn btn-primary">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Garage</h1>
          <Link className="btn btn-primary" href="/vehicles/new">
            Add vehicle
          </Link>
        </div>
        {vehicles.error && <p className="text-sm text-red-600">Failed to load vehicles.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {vehicles.data?.map((vehicle) => (
            <Link className="surface hover-lift rounded-2xl p-4" href={`/v/${vehicle.id}`} key={vehicle.id}>
              <p className="font-semibold">
                {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")}
              </p>
              <p className="text-sm text-slate-500">{vehicle.nickname ?? vehicle.visibility}</p>
            </Link>
          ))}
        </div>
      </div>

      {(previousVehicles.data?.length ?? 0) > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-slate-500">Previously owned</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {previousVehicles.data!.map((pv: PreviousVehicle) => {
              const label = [pv.vehicle.year, pv.vehicle.make, pv.vehicle.model].filter(Boolean).join(" ");
              const period = [
                pv.period_start ? formatDate(pv.period_start) : null,
                pv.period_end ? formatDate(pv.period_end) : "transferred"
              ].filter(Boolean).join(" – ");
              return pv.is_public ? (
                <Link
                  key={pv.vehicle.id}
                  className="surface hover-lift rounded-2xl p-4 opacity-70 hover:opacity-100"
                  href={`/v/${pv.vehicle.id}`}
                >
                  <p className="font-semibold">{label}</p>
                  <p className="text-sm text-slate-500">{period}</p>
                </Link>
              ) : (
                <div key={pv.vehicle.id} className="surface rounded-2xl p-4 opacity-50">
                  <p className="font-semibold">{label}</p>
                  <p className="text-sm text-slate-400">{period} · now private</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
