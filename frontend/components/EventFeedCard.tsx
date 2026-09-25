"use client";

import Link from "next/link";

import { carAvatarUri } from "@/lib/avatar";
import { eventTypeBadge, eventTypeLabel } from "@/lib/events";
import { formatDate, formatMoney } from "@/lib/format";
import type { EventFeedItem } from "@/lib/types";

export function EventFeedCard({ event }: { event: EventFeedItem }) {
  const vehicleLabel = [event.vehicle.year, event.vehicle.make, event.vehicle.model]
    .filter(Boolean)
    .join(" ");
  const historyHref = `/v/${event.vehicle.id}?tab=history`;

  const metaParts: string[] = [];
  if (event.costCents != null) metaParts.push(formatMoney(event.costCents));
  if (event.mileage != null) metaParts.push(`${event.mileage.toLocaleString()} mi`);
  if (event.receiptCount > 0) {
    metaParts.push(`${event.receiptCount} receipt${event.receiptCount === 1 ? "" : "s"}`);
  }

  return (
    <article className="surface hover-lift rounded-3xl p-4 relative">
      {/* Stretched link makes the whole card clickable — inner links stay z-10 */}
      <Link
        href={historyHref}
        className="absolute inset-0 rounded-3xl"
        aria-label={`View history for ${vehicleLabel}`}
      />

      <header className="relative z-10 mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-slate-200 ring-1 ring-slate-200">
            <img
              src={event.author.avatar_url || carAvatarUri(event.author.username)}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.src = carAvatarUri(event.author.username);
              }}
            />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
              <Link
                href={`/u/${event.author.username}`}
                className="relative z-10 font-semibold hover:text-petrol truncate"
              >
                @{event.author.username}
              </Link>
              <span className="text-slate-500">logged on</span>
              <Link
                href={historyHref}
                className="relative z-10 font-medium text-petrol hover:underline truncate"
              >
                {vehicleLabel}
                {event.vehicle.nickname ? ` · ${event.vehicle.nickname}` : ""}
              </Link>
            </div>
            <p className="text-xs text-slate-400">
              {formatDate(event.eventDate ?? event.createdAt)}
            </p>
          </div>
        </div>

        {event.thumbnailUrl && (
          <div className="relative z-10 h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100">
            <img
              src={event.thumbnailUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        )}
      </header>

      <div className="relative z-10 flex items-center gap-2">
        <span
          className={`chip text-xs font-semibold px-2 py-0.5 rounded-full ${eventTypeBadge(event.eventType)}`}
        >
          {eventTypeLabel(event.eventType)}
        </span>
        <span className="text-sm font-medium truncate">{event.title}</span>
      </div>

      {metaParts.length > 0 && (
        <p className="relative z-10 mt-1.5 text-xs text-slate-400">
          {metaParts.join(" · ")}
        </p>
      )}
    </article>
  );
}
