import { VehicleEventForm } from "@/components/VehicleEventForm";

export default async function NewVehicleEventPage({
  params
}: {
  params: Promise<{ vehicleId: string }>;
}) {
  const { vehicleId } = await params;
  return <VehicleEventForm vehicleId={vehicleId} />;
}
