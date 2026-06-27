import { AuthGate } from "@/components/AuthGate";
import { VehicleEventForm } from "@/components/VehicleEventForm";

export default async function EditVehicleEventPage({
  params
}: {
  params: Promise<{ vehicleId: string; eventId: string }>;
}) {
  const { vehicleId, eventId } = await params;
  return (
    <AuthGate message="Log in to edit this event.">
      <VehicleEventForm vehicleId={vehicleId} eventId={eventId} />
    </AuthGate>
  );
}
