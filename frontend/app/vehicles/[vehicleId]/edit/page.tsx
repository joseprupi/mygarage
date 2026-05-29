import { VehicleForm } from "@/components/VehicleForm";

export default async function EditVehiclePage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  return <VehicleForm vehicleId={vehicleId} />;
}
