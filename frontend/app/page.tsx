import { FeedSection } from "@/components/FeedSection";
import { GuestHero } from "@/components/GuestHero";
import { serverApiBase } from "@/lib/api/serverBase";

type FeaturedVehicle = {
  id: string;
  year?: number | null;
  make: string;
  model: string;
  nickname?: string | null;
};

async function getFirstPublicVehicle(): Promise<FeaturedVehicle | undefined> {
  try {
    const base = serverApiBase();
    const sitemapRes = await fetch(`${base}/sitemap/entries`, { cache: "no-store" });
    if (!sitemapRes.ok) return undefined;
    const sitemapData = await sitemapRes.json();
    const id = sitemapData?.vehicles?.[0]?.id as string | undefined;
    if (!id) return undefined;
    const vRes = await fetch(`${base}/vehicles/${id}`, { cache: "no-store" });
    if (!vRes.ok) return undefined;
    const v = await vRes.json();
    return { id: v.id, year: v.year ?? null, make: v.make, model: v.model, nickname: v.nickname ?? null };
  } catch {
    return undefined;
  }
}

export default async function HomePage() {
  const featuredVehicle = await getFirstPublicVehicle();

  return (
    <section className="space-y-5">
      <GuestHero exampleVehicleId={featuredVehicle?.id} featuredVehicle={featuredVehicle} />
      <FeedSection />
    </section>
  );
}
