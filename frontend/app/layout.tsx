import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";

import { Nav } from "@/components/Nav";
import { Providers } from "@/app/providers";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "Car Social",
  description: "Vehicle-first social profiles, posts, galleries, and history."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body>
        <Providers>
          <Nav />
          <div className="md:pl-16">
            <main className="mx-auto min-h-screen max-w-3xl px-4 pb-24 pt-6 md:pb-10 md:pt-10">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
