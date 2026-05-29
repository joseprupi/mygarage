import { VehicleEventForm } from "@/components/VehicleEventForm";

export default async function EditVehicleEventPage({
  params
}: {
  params: Promise<{ vehicleId: string; eventId: string }>;
}) {
  const { vehicleId, eventId } = await params;
  return <VehicleEventForm vehicleId={vehicleId} eventId={eventId} />;
}
