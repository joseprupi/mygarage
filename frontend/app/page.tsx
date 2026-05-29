import { Feed } from "@/components/Feed";

export default function HomePage() {
  return (
    <section className="space-y-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Car Social</p>
        <h1 className="text-3xl font-bold">The feed for builds, drives, and living vehicle history.</h1>
      </div>
      <Feed />
    </section>
  );
}
