"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ImageUploader } from "@/components/ImageUploader";
import { VideoUploader } from "@/components/VideoUploader";
import { PlayBadge } from "@/components/VideoPlayer";
import { DocumentUploader } from "@/components/DocumentUploader";
import { LocationInput } from "@/components/LocationInput";
import { eventApi } from "@/lib/api/client";
import { EVENT_TYPES, eventTypeLabel } from "@/lib/events";
import type { EventDocument, Media } from "@/lib/types";

const emptyForm = {
  eventType: "maintenance",
  title: "",
  description: "",
  eventDate: "",
  mileage: "",
  cost: "",
  currency: "USD",
  shopName: "",
  location: "",
  visibility: "public"
};

export function VehicleEventForm({ vehicleId, eventId }: { vehicleId: string; eventId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = Boolean(eventId);
  const [media, setMedia] = useState<Media[]>([]);
  const [documents, setDocuments] = useState<EventDocument[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const eventQuery = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => eventApi.get(eventId!),
    enabled: isEdit
  });

  useEffect(() => {
    const e = eventQuery.data;
    if (!e) return;
    setForm({
      eventType: e.event_type,
      title: e.title ?? "",
      description: e.description ?? "",
      eventDate: e.event_date ?? "",
      mileage: e.mileage != null ? String(e.mileage) : "",
      cost: e.cost_cents != null ? String(e.cost_cents / 100) : "",
      currency: e.currency ?? "USD",
      shopName: e.shop_name ?? "",
      location: e.location ?? "",
      visibility: e.visibility ?? "public"
    });
    setMedia(e.media ?? []);
    setDocuments(e.documents ?? []);
  }, [eventQuery.data]);

  const deleteMutation = useMutation({
    mutationFn: () => eventApi.delete(eventId!),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["vehicleEvents", vehicleId] }),
        queryClient.invalidateQueries({ queryKey: ["vehicle", vehicleId] })
      ]);
      router.push(`/v/${vehicleId}`);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Unable to delete event")
  });

  if (isEdit && eventQuery.isLoading) return <div className="p-6">Loading event...</div>;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!form.eventDate) {
      setError("Date is required.");
      return;
    }
    const payload = {
      ...form,
      eventDate: form.eventDate || null,
      mileage: form.mileage ? Number(form.mileage) : null,
      costCents: form.cost ? Math.round(Number(form.cost) * 100) : null,
      media: media.map((item, index) => ({ ...item, sort_order: index })),
      documents: documents.map((item, index) => ({ ...item, sort_order: index }))
    };
    setSubmitting(true);
    try {
      if (isEdit) {
        await eventApi.update(eventId!, payload);
      } else {
        await eventApi.create(vehicleId, payload);
      }
      router.push(`/v/${vehicleId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save event");
      setSubmitting(false);
    }
  }

  return (
    <form className="surface space-y-4 rounded-3xl p-6" onSubmit={submit}>
      <h1 className="text-2xl font-bold">{isEdit ? "Edit history event" : "Add history event"}</h1>
      <label className="block space-y-1 text-sm">
        <span>Type</span>
        <select
          className="input"
          value={form.eventType}
          onChange={(event) => setForm({ ...form, eventType: event.target.value })}
        >
          {EVENT_TYPES.map((type) => (
            <option value={type} key={type}>
              {eventTypeLabel(type)}
            </option>
          ))}
        </select>
      </label>
      {[
        ["title", "Title *"],
        ["eventDate", "Date *"],
        ["mileage", "Mileage"],
        ["shopName", "Shop/vendor"]
      ].map(([key, label]) => (
        <label className="block space-y-1 text-sm" key={key}>
          <span>{label}</span>
          <input
            className="input"
            type={key === "eventDate" ? "date" : "text"}
            value={form[key as keyof typeof form]}
            onChange={(event) => setForm({ ...form, [key]: event.target.value })}
          />
        </label>
      ))}
      <label className="block space-y-1 text-sm">
        <span>Cost</span>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
          <input
            className="input pl-7"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={form.cost}
            onChange={(event) =>
              setForm({ ...form, cost: event.target.value.replace(/[^\d.]/g, "") })
            }
          />
        </div>
      </label>
      <label className="block space-y-1 text-sm">
        <span>Location</span>
        <LocationInput value={form.location} onChange={(v) => setForm({ ...form, location: v })} />
      </label>
      <textarea
        className="input min-h-28"
        placeholder="Notes"
        value={form.description}
        onChange={(event) => setForm({ ...form, description: event.target.value })}
      />
      <div className="space-y-2">
        <span className="text-sm">Photos &amp; videos</span>
        {media.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {media.map((item, index) => (
              <div className="relative" key={item.url}>
                <img className="aspect-square w-full rounded-xl object-cover" src={item.thumbnail_url ?? item.url} alt="" />
                {item.media_type === "video" && <PlayBadge size="sm" />}
                <button
                  type="button"
                  aria-label="Remove media"
                  className="absolute right-1 top-1 rounded-full bg-black/60 px-2 text-sm font-bold leading-6 text-white"
                  onClick={() => setMedia((items) => items.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <ImageUploader purpose="vehicle_event_media" onUploaded={(item) => setMedia((items) => [...items, item])} />
          <VideoUploader onUploaded={(item) => setMedia((items) => [...items, item])} />
        </div>
      </div>
      <div className="space-y-2">
        <span className="text-sm">Documents (PDF)</span>
        {documents.length > 0 && (
          <ul className="space-y-1">
            {documents.map((doc, index) => (
              <li
                className="flex items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2 text-sm"
                key={`${doc.url}-${index}`}
              >
                <span className="truncate">📄 {doc.filename}</span>
                <button
                  type="button"
                  aria-label="Remove document"
                  className="shrink-0 rounded-full bg-black/60 px-2 text-sm font-bold leading-6 text-white"
                  onClick={() => setDocuments((items) => items.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <DocumentUploader onUploaded={(item) => setDocuments((items) => [...items, item])} />
      </div>
      <label className="block space-y-1 text-sm">
        <span>Visibility</span>
        <select
          className="input"
          value={form.visibility}
          onChange={(event) => setForm({ ...form, visibility: event.target.value })}
        >
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center justify-between gap-3">
        <button className="btn btn-primary px-5 py-3 disabled:opacity-60" disabled={submitting} type="submit">
          {submitting ? "Saving…" : isEdit ? "Save changes" : "Save event"}
        </button>
        {isEdit && (
          <button
            type="button"
            className="text-sm font-semibold text-red-600 hover:underline disabled:opacity-60"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (window.confirm("Delete this event? This cannot be undone.")) deleteMutation.mutate();
            }}
          >
            {deleteMutation.isPending ? "Deleting…" : "Delete event"}
          </button>
        )}
      </div>
    </form>
  );
}
