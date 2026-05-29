import type { Metadata } from "next";

import { Nav } from "@/components/Nav";
import { Providers } from "@/app/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Car Social",
  description: "Vehicle-first social profiles, posts, galleries, and history."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Nav />
          <main className="mx-auto min-h-screen max-w-3xl px-4 pb-24 pt-6 md:pt-24">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
