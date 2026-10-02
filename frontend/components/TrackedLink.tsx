"use client";

import Link from "next/link";

import { track } from "@/lib/analytics";

/**
 * A link that fires a GA4 event on click. Lets server components (the landing
 * page) attach analytics without becoming client components themselves.
 * External hrefs (http…) render a plain <a>; internal ones use next/link.
 */
export function TrackedLink({
  href,
  event,
  params,
  className,
  children
}: {
  href: string;
  event: string;
  params?: Record<string, unknown>;
  className?: string;
  children: React.ReactNode;
}) {
  const onClick = () => track(event, params);
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} className={className} onClick={onClick} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
