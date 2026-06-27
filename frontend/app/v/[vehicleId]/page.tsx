import type { Metadata } from "next";

import type { Vehicle } from "@/lib/types";
import { absoluteMediaUrl, serverFetch } from "@/lib/api/serverBase";
import { VehicleClient } from "./VehicleClient";

export async function generateMetadata({
  params
}: {
  params: Promise<{ vehicleId: string }>;
}): Promise<Metadata> {
  const { vehicleId } = await params;
  const vehicle = await serverFetch<Vehicle>(`/vehicles/${vehicleId}`);
  if (!vehicle) return { title: "CeCeCar" };

  const name = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
  const title = `${name || "Vehicle"} — CeCeCar`;
  const owner = vehicle.owner?.username ? `@${vehicle.owner.username}` : "an owner";
  const description =
    vehicle.description?.trim() ||
    `${name || "This vehicle"}'s full history on CeCeCar, kept by ${owner}.`;
  const image = absoluteMediaUrl(vehicle.cover_image_url) ?? absoluteMediaUrl(vehicle.owner?.avatar_url);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `/v/${vehicle.id}`,
      images: image ? [{ url: image }] : undefined
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined
    }
  };
}

export default function VehiclePage(props: { params: Promise<{ vehicleId: string }> }) {
  return <VehicleClient {...props} />;
}
