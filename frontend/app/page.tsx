import { Feed } from "@/components/Feed";

export default function HomePage() {
  return (
    <section className="space-y-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-petrol">Car Social</p>
        <h1 className="text-2xl font-bold sm:text-3xl">The feed for builds, drives, and living vehicle history.</h1>
      </div>
      <Feed />
    </section>
  );
}
