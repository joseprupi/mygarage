"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { ImageUploader } from "@/components/ImageUploader";
import { eventApi } from "@/lib/api/client";
import { EVENT_TYPES, eventTypeLabel } from "@/lib/events";
import type { Media } from "@/lib/types";

const emptyForm = {
  eventType: "maintenance",
  title: "",
  description: "",
  eventDate: "",
  mileage: "",
  costCents: "",
  currency: "USD",
  shopName: "",
  location: "",
  visibility: "public"
};

export function VehicleEventForm({ vehicleId, eventId }: { vehicleId: string; eventId?: string }) {
  const router = useRouter();
  const isEdit = Boolean(eventId);
  const [media, setMedia] = useState<Media[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

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
      costCents: e.cost_cents != null ? String(e.cost_cents) : "",
      currency: e.currency ?? "USD",
      shopName: e.shop_name ?? "",
      location: e.location ?? "",
      visibility: e.visibility ?? "public"
    });
    setMedia(e.media ?? []);
  }, [eventQuery.data]);

  if (isEdit && eventQuery.isLoading) return <div className="p-6">Loading event...</div>;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    const payload = {
      ...form,
      eventDate: form.eventDate || null,
      mileage: form.mileage ? Number(form.mileage) : null,
      costCents: form.costCents ? Number(form.costCents) : null,
      media: media.map((item, index) => ({ ...item, sort_order: index }))
    };
    try {
      if (isEdit) {
        await eventApi.update(eventId!, payload);
      } else {
        await eventApi.create(vehicleId, payload);
      }
      router.push(`/v/${vehicleId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save event");
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
        ["title", "Title"],
        ["eventDate", "Date"],
        ["mileage", "Mileage"],
        ["costCents", "Cost in cents"],
        ["shopName", "Shop/vendor"],
        ["location", "Location"]
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
      <textarea
        className="input min-h-28"
        placeholder="Notes"
        value={form.description}
        onChange={(event) => setForm({ ...form, description: event.target.value })}
      />
      <div className="space-y-2">
        <span className="text-sm">Photos</span>
        {media.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {media.map((item, index) => (
              <div className="relative" key={item.url}>
                <img className="aspect-square w-full rounded-xl object-cover" src={item.thumbnail_url ?? item.url} alt="" />
                <button
                  type="button"
                  aria-label="Remove photo"
                  className="absolute right-1 top-1 rounded-full bg-black/60 px-2 text-sm font-bold leading-6 text-white"
                  onClick={() => setMedia((items) => items.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <ImageUploader purpose="vehicle_event_media" onUploaded={(item) => setMedia((items) => [...items, item])} />
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
      <button className="btn btn-primary px-5 py-3" type="submit">
        {isEdit ? "Save changes" : "Save event"}
      </button>
    </form>
  );
}
