import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import Script from "next/script";

import { AuthChromeSync } from "@/components/AuthChromeSync";
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
  itunes: { appId: "6804418892" },
  description: "Vehicle-first social profiles, posts, galleries, and history."
};

// Runs before first paint. Auth lives in localStorage (key must match
// getToken/setToken in lib/api/client.ts), so the server can't know who is
// logged in; these attributes let CSS in globals.css show guest-only vs
// member-only content and drop the app chrome on the guest home without a flash.
// AuthChromeSync + setToken keep them current afterwards.
const BOOT_SCRIPT = `(function(){var d=document.documentElement;try{d.dataset.auth=window.localStorage.getItem("carSocialToken")?"1":"0"}catch(e){d.dataset.auth="0"}try{d.dataset.home=location.pathname==="/"?"1":"0"}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: data-auth / data-home are set on <html> by the
    // boot script, outside React.
    <html lang="en" className={`${sans.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>
        <Providers>
          <AuthChromeSync />
          <div className="app-chrome">
            <Nav />
          </div>
          <div className="app-shell md:pl-16">
            <main className="app-main mx-auto min-h-screen max-w-3xl px-4 pb-24 pt-6 md:pb-10 md:pt-10">{children}</main>
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
