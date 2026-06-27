import { AuthGate } from "@/components/AuthGate";
import { VehicleEventForm } from "@/components/VehicleEventForm";

export default async function NewVehicleEventPage({
  params
}: {
  params: Promise<{ vehicleId: string }>;
}) {
  const { vehicleId } = await params;
  return (
    <AuthGate message="Log in to add an event.">
      <VehicleEventForm vehicleId={vehicleId} />
    </AuthGate>
  );
}
