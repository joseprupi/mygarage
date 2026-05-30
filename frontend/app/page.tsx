import { Feed } from "@/components/Feed";
import { GuestPrompt } from "@/components/GuestPrompt";

export default function HomePage() {
  return (
    <section className="space-y-5">
      <GuestPrompt />
      <Feed />
    </section>
  );
}
