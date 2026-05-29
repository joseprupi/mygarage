"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { api, authApi } from "@/lib/api/client";
import type { Vehicle } from "@/lib/types";

export default function GaragePage() {
  const me = useQuery({ queryKey: ["me"], queryFn: authApi.me, retry: false });
  const user = me.data as { id: string } | undefined;
  const vehicles = useQuery({
    queryKey: ["garage", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => api<Vehicle[]>(`/users/${user!.id}/vehicles`)
  });

  if (!user) {
    return (
      <div className="rounded-3xl bg-white p-6">
        <p className="mb-4">Log in to see your garage.</p>
        <Link href="/auth" className="rounded-xl bg-asphalt px-4 py-2 text-white">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Garage</h1>
        <Link className="rounded-xl bg-asphalt px-4 py-2 text-white" href="/vehicles/new">
          Add vehicle
        </Link>
      </div>
      {vehicles.error && <p className="text-sm text-red-600">Failed to load vehicles.</p>}
      <div className="grid gap-3">
        {vehicles.data?.map((vehicle) => (
          <Link className="rounded-2xl bg-white p-4 shadow-sm" href={`/v/${vehicle.id}`} key={vehicle.id}>
            <p className="font-semibold">
              {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")}
            </p>
            <p className="text-sm text-slate-500">{vehicle.nickname ?? vehicle.visibility}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
