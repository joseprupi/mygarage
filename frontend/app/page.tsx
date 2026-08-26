import { Feed } from "@/components/Feed";
import { GuestHero } from "@/components/GuestHero";
import { serverApiBase } from "@/lib/api/serverBase";

async function getFirstPublicVehicleId(): Promise<string | undefined> {
  try {
    const res = await fetch(`${serverApiBase()}/sitemap/entries`, {
      cache: "no-store",
    });
    if (!res.ok) return undefined;
    const data = await res.json();
    return data?.vehicles?.[0]?.id as string | undefined;
  } catch {
    return undefined;
  }
}

export default async function HomePage() {
  const exampleVehicleId = await getFirstPublicVehicleId();

  return (
    <section className="space-y-5">
      <GuestHero exampleVehicleId={exampleVehicleId} />
      <Feed />
    </section>
  );
}
