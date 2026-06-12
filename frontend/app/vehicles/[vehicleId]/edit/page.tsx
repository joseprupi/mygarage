import { AuthGate } from "@/components/AuthGate";
import { VehicleForm } from "@/components/VehicleForm";

export default async function EditVehiclePage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  return (
    <AuthGate message="Log in to edit this vehicle.">
      <VehicleForm vehicleId={vehicleId} />
    </AuthGate>
  );
}
