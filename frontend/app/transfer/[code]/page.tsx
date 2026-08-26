"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";

import { transferApi } from "@/lib/api/client";
import { useMe } from "@/lib/useMe";
import { formatDate } from "@/lib/format";

export default function TransferAcceptPage({
  params
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const currentUser = me.data as { id: string } | undefined;
  const [banner, setBanner] = useState(false);

  const transfer = useQuery({
    queryKey: ["transfer", code],
    queryFn: () => transferApi.byCode(code),
    enabled: Boolean(currentUser),
    retry: false
  });

  const acceptMutation = useMutation({
    mutationFn: () => transferApi.accept(code),
    onSuccess: (vehicle) => {
      setBanner(true);
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      void queryClient.invalidateQueries({ queryKey: ["garage"] });
      setTimeout(() => {
        router.push(`/v/${vehicle.id}`);
      }, 1500);
    }
  });

  if (me.isPending) {
    return (
      <div className="surface rounded-3xl p-6 text-sm text-slate-500">Loading…</div>
    );
  }

  if (!currentUser) {
    // Not logged in — redirect to login with return path
    const returnPath = `/transfer/${code}`;
    return (
      <div className="surface rounded-3xl p-8 text-center">
        <h1 className="mb-2 text-2xl font-bold">Log in to accept transfer</h1>
        <p className="mb-6 text-slate-500">You need a CarFable account to accept this vehicle transfer.</p>
        <Link
          href={`/auth?return=${encodeURIComponent(returnPath)}`}
          className="btn btn-primary"
        >
          Log in or sign up
        </Link>
      </div>
    );
  }

  if (transfer.isLoading) {
    return <div className="surface rounded-3xl p-6 text-sm text-slate-500">Loading transfer…</div>;
  }

  if (transfer.error) {
    return (
      <div className="surface rounded-3xl p-6">
        <h1 className="mb-2 text-xl font-bold">Transfer not found</h1>
        <p className="text-slate-500">This transfer link may have expired or already been used.</p>
        <Link href="/garage" className="btn btn-secondary mt-4">
          Go to garage
        </Link>
      </div>
    );
  }

  if (!transfer.data) return null;

  const t = transfer.data;
  const vehicleLabel = [t.vehicle.year, t.vehicle.make, t.vehicle.model].filter(Boolean).join(" ");
  const fromLabel = t.fromUser ? `@${t.fromUser.username}` : "a previous owner";
  const expiresDate = formatDate(t.expiresAt.slice(0, 10));

  return (
    <section className="mx-auto max-w-lg space-y-5">
      {banner && (
        <div className="rounded-2xl bg-green-50 px-5 py-3 text-sm font-semibold text-green-800">
          Vehicle transferred! Taking you there…
        </div>
      )}

      <div className="surface rounded-3xl p-6">
        {t.vehicle.coverUrl && (
          <img
            src={t.vehicle.coverUrl}
            alt=""
            className="mb-4 aspect-[16/9] w-full rounded-2xl object-cover"
          />
        )}
        <h1 className="text-2xl font-bold">{vehicleLabel}</h1>
        {t.vehicle.nickname && (
          <p className="text-sm font-semibold uppercase tracking-widest text-petrol">{t.vehicle.nickname}</p>
        )}
        <p className="mt-1 text-slate-600">
          Transfer from{" "}
          {t.fromUser ? (
            <Link href={`/u/${t.fromUser.username}`} className="font-semibold text-petrol hover:underline">
              {fromLabel}
            </Link>
          ) : (
            <span className="font-semibold">{fromLabel}</span>
          )}
        </p>
        <p className="mt-1 text-xs text-slate-400">Expires {expiresDate}</p>
      </div>

      <div className="surface rounded-3xl p-5 space-y-3">
        <h2 className="font-bold">What&apos;s included</h2>
        <ul className="space-y-1.5 text-sm text-slate-700">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-green-600">✓</span>
            <span>
              <strong>{t.counts.events}</strong> service events
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-green-600">✓</span>
            <span>
              <strong>{t.counts.mods}</strong> mods
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-green-600">✓</span>
            <span>
              <strong>{t.counts.photos}</strong> photos
            </span>
          </li>
          {t.keepDocuments ? (
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-green-600">✓</span>
              <span>Receipts and documents attached</span>
            </li>
          ) : (
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-slate-400">–</span>
              <span className="text-slate-500">Documents not included (seller opted out)</span>
            </li>
          )}
          {t.keepPostsTagged ? (
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-green-600">✓</span>
              <span>Seller&apos;s posts stay tagged to this vehicle</span>
            </li>
          ) : (
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-slate-400">–</span>
              <span className="text-slate-500">Seller&apos;s posts will be untagged</span>
            </li>
          )}
        </ul>
      </div>

      <div className="surface rounded-3xl p-5">
        {!t.canAccept && (
          <p className="mb-3 rounded-xl bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
            {t.status === "accepted"
              ? "This transfer has already been accepted."
              : t.status === "expired"
                ? "This transfer link has expired."
                : "You cannot accept this transfer (it may be your own vehicle)."}
          </p>
        )}
        {acceptMutation.error && (
          <p className="mb-3 text-sm text-red-600">
            {acceptMutation.error instanceof Error ? acceptMutation.error.message : "Failed to accept transfer"}
          </p>
        )}
        <button
          type="button"
          className="btn btn-primary w-full py-3 disabled:opacity-60"
          disabled={!t.canAccept || acceptMutation.isPending || banner}
          onClick={() => acceptMutation.mutate()}
        >
          {acceptMutation.isPending ? "Accepting…" : "Accept ownership"}
        </button>
        <p className="mt-2 text-center text-xs text-slate-400">
          This cannot be undone. Do another transfer if needed.
        </p>
      </div>
    </section>
  );
}
