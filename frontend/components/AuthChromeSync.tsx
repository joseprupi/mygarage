"use client";

import { useEffect, useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import { useMe } from "@/lib/useMe";

// useLayoutEffect on the client (runs before paint), useEffect on the server
// (where neither runs) — avoids the SSR warning.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Keeps the <html> data attributes set by the inline boot script in layout.tsx
 * correct after first paint:
 *  - data-home: "1" on "/", else "0" — updated on client-side navigation,
 *    before paint, so the guest landing never shows the app chrome (and other
 *    routes never lose it).
 *  - data-auth: flipped to "0" when the stored token is rejected (401), so a
 *    stale token shows the landing instead of an empty feed. setToken() in
 *    lib/api/client.ts handles login/logout.
 * Renders nothing.
 */
export function AuthChromeSync() {
  const pathname = usePathname();
  const me = useMe();
  const rejected = me.error instanceof ApiError && me.error.status === 401;

  useIsoLayoutEffect(() => {
    document.documentElement.dataset.home = pathname === "/" ? "1" : "0";
  }, [pathname]);

  useEffect(() => {
    if (rejected) document.documentElement.dataset.auth = "0";
  }, [rejected]);

  return null;
}
