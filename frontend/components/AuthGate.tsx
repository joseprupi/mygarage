"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { authApi } from "@/lib/api/client";

// Wraps pages that require a signed-in user. While the ["me"] query is
// pending it shows a light loading state (so logged-in users don't flash
// the guest card); once settled, guests get a login card instead of a form
// whose Save would 401/403.
export function AuthGate({
  children,
  message = "Log in to continue."
}: {
  children: React.ReactNode;
  message?: string;
}) {
  const me = useQuery({ queryKey: ["me"], queryFn: authApi.me, retry: false });

  if (me.isPending) {
    return <div className="surface rounded-3xl p-6 text-sm text-slate-500">Loading...</div>;
  }
  if (!me.data) {
    return (
      <div className="surface rounded-3xl p-6">
        <p className="mb-4">{message}</p>
        <Link className="btn btn-primary" href="/auth">
          Log in
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}
