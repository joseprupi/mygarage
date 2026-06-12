import { AuthGate } from "@/components/AuthGate";
import { VehicleForm } from "@/components/VehicleForm";

export default function NewVehiclePage() {
  return (
    <AuthGate message="Log in to add a vehicle.">
      <VehicleForm />
    </AuthGate>
  );
}
