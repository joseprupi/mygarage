import { FeedSection } from "@/components/FeedSection";
import { Landing } from "@/components/landing/Landing";
import { loadLanding } from "@/lib/landing";

// "/" serves both audiences from one HTML response: the landing (server-rendered
// with the featured vehicle's real data, for guests and crawlers) and the feed
// slot (logged-in users). Which one is visible is decided by CSS on
// <html data-auth>, set before first paint by the boot script in layout.tsx.
export default async function HomePage() {
  const data = await loadLanding();

  return (
    <>
      <div className="guest-only">
        <Landing data={data} />
      </div>
      <section className="member-only space-y-5">
        <FeedSection />
      </section>
    </>
  );
}
