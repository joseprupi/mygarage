import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import Script from "next/script";

import { Nav } from "@/components/Nav";
import { Providers } from "@/app/providers";
import "./globals.css";

// Google Analytics 4. The id is only set in the production build (via
// deploy-frontend.sh / _config.sh), so GA is inert in local dev — nothing
// renders when NEXT_PUBLIC_GA_ID is empty.
const gaId = process.env.NEXT_PUBLIC_GA_ID;

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://carfable.com"),
  title: "CarFable",
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
        {gaId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${gaId}');
              `}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
