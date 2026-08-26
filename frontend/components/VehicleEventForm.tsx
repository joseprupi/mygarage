"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ImageUploader } from "@/components/ImageUploader";
import { VideoUploader } from "@/components/VideoUploader";
import { PlayBadge } from "@/components/VideoPlayer";
import { DocumentUploader } from "@/components/DocumentUploader";
import { LocationInput } from "@/components/LocationInput";
import { aiApi, eventApi, mediaApi, type ReceiptScan } from "@/lib/api/client";
import { EVENT_TYPES, SERVICE_TAGS, eventTypeLabel, tagLabel } from "@/lib/events";
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

type FuelToggles = { fuelFullTank: boolean; fuelMissedPrevious: boolean };

export function VehicleEventForm({ vehicleId, eventId }: { vehicleId: string; eventId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = Boolean(eventId);
  const [media, setMedia] = useState<Media[]>([]);
  const [documents, setDocuments] = useState<EventDocument[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [fuelToggles, setFuelToggles] = useState<FuelToggles>({ fuelFullTank: true, fuelMissedPrevious: false });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  // The raw scan result — sent as scanSnapshot when creating an event from a receipt.
  const [scanSnapshot, setScanSnapshot] = useState<ReceiptScan | null>(null);
  // Track local preview URLs so we can revoke them on unmount.
  const localPreviewUrlsRef = useRef<string[]>([]);

  // Revoke all local object URLs when the form unmounts.
  useEffect(() => {
    return () => {
      for (const u of localPreviewUrlsRef.current) {
        URL.revokeObjectURL(u);
      }
    };
  }, []);

  function trackLocalUrl(url: string) {
    localPreviewUrlsRef.current.push(url);
    return url;
  }

  async function scanReceipt(files: File[]) {
    if (files.length === 0 || scanning) return;
    setScanning(true);
    setScanNote(null);
    setError(null);
    try {
      // All selected files are pages of ONE bill. Extract fields and attach the
      // pages (images -> event media, PDFs -> event documents) in parallel.
      const uploads = files.map(async (file) => {
        if (file.type === "application/pdf") {
          const { url } = await mediaApi.upload(file, "vehicle_event_document");
          setDocuments((items) => [
            ...items,
            { url, filename: file.name, content_type: file.type }
          ]);
        } else {
          // Create a local preview URL before the upload so we can show the
          // image immediately — the returned `url` is a private bucket path and
          // is NOT displayable in the browser.
          const localPreviewUrl = trackLocalUrl(URL.createObjectURL(file));
          const { url } = await mediaApi.upload(file, "vehicle_event_media");
          setMedia((items) => [...items, { url, media_type: "image", localPreviewUrl }]);
        }
      });
      const [scan] = await Promise.all([aiApi.scanReceipt(files), ...uploads]);
      setScanSnapshot(scan);
      setForm((prev) => ({
        ...prev,
        eventType: scan.eventType || prev.eventType,
        title: scan.title || prev.title,
        eventDate: scan.eventDate ?? prev.eventDate,
        mileage: scan.mileage != null ? String(scan.mileage) : prev.mileage,
        cost: scan.costCents != null ? String(scan.costCents / 100) : prev.cost,
        shopName: scan.shopName ?? prev.shopName,
        location: scan.location ?? prev.location,
        description: scan.description ?? prev.description
      }));
      if (scan.tags?.length) setTags((prev) => Array.from(new Set([...prev, ...scan.tags])));
      setScanNote(
        scan.confidence === "high"
          ? "Receipt read — double-check the fields below, then save."
          : `Receipt was hard to read (confidence: ${scan.confidence}${scan.notes ? ` — ${scan.notes}` : ""}). Check every field.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Receipt scan failed");
    } finally {
      setScanning(false);
    }
  }

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
    // Map EventMedia[] → Media[] for the form state.
    // The owner always has canView=true, so url should be non-null.
    setMedia(
      (e.media ?? []).map((m) => ({
        id: m.id,
        url: m.url ?? "",
        media_type: m.mediaType,
        thumbnail_url: m.thumbnailUrl ?? undefined,
        // Use thumbnailUrl as form preview; for private items this is the presigned URL.
        localPreviewUrl: m.thumbnailUrl ?? m.url ?? undefined,
        sort_order: m.sortOrder
      }))
    );
    // Map EventDocumentRead[] → EventDocument[] for the form state.
    setDocuments(
      (e.documents ?? []).map((d) => ({
        id: d.id,
        url: d.url ?? "",
        filename: d.filename,
        content_type: d.contentType,
        sort_order: d.sortOrder
      }))
    );
    setTags(e.tags ?? []);
    setFuelToggles({
      fuelFullTank: e.fuel_full_tank !== false,
      fuelMissedPrevious: e.fuel_missed_previous === true,
    });
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
    const isFuel = form.eventType === "fuel";
    const payload: Record<string, unknown> = {
      ...form,
      eventDate: form.eventDate || null,
      mileage: form.mileage ? Number(form.mileage) : null,
      costCents: form.cost ? Math.round(Number(form.cost) * 100) : null,
      // Send storage path (url) not the local preview URL.
      media: media.map((item, index) => ({
        id: item.id,
        url: item.url,
        media_type: item.media_type,
        thumbnail_url: item.thumbnail_url,
        sort_order: index
      })),
      documents: documents.map((item, index) => ({ ...item, sort_order: index })),
      tags,
      ...(isFuel && {
        fuelFullTank: fuelToggles.fuelFullTank,
        fuelMissedPrevious: fuelToggles.fuelMissedPrevious ? true : null,
      }),
    };
    // Provenance: only set source/scanSnapshot on create (not edit).
    if (!isEdit) {
      payload.source = scanSnapshot ? "scan" : "manual";
      if (scanSnapshot) payload.scanSnapshot = scanSnapshot;
    }
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
      {!isEdit && (
        <div className="space-y-2 rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-semibold text-blue-700">✨ Scan a receipt</p>
          <p className="text-sm text-slate-600">
            Upload photos or a PDF of the bill (select all pages of the same bill at once) — the
            form fills itself and the files are attached. You review before saving.
          </p>
          <label className="btn btn-secondary inline-flex cursor-pointer items-center gap-2 text-sm">
            {scanning ? "Reading…" : "Choose files"}
            <input
              type="file"
              className="hidden"
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf"
              disabled={scanning}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []).slice(0, 5);
                event.target.value = "";
                void scanReceipt(files);
              }}
            />
          </label>
          {scanNote && <p className="text-sm font-semibold text-blue-700">{scanNote}</p>}
        </div>
      )}
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
              <div className="relative" key={item.url || index}>
                {/* Use localPreviewUrl for preview when the bucket URL is private. */}
                <img
                  className="aspect-square w-full rounded-xl object-cover"
                  src={item.localPreviewUrl ?? item.thumbnail_url ?? item.url}
                  alt=""
                />
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
      <div className="space-y-2">
        <span className="text-sm">What was worked on</span>
        <div className="flex flex-wrap gap-2">
          {SERVICE_TAGS.map((tag) => {
            const on = tags.includes(tag);
            return (
              <button
                type="button"
                key={tag}
                onClick={() => setTags((prev) => (on ? prev.filter((t) => t !== tag) : [...prev, tag]))}
                className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition ${
                  on ? "border-petrol bg-petrol text-white" : "border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {tagLabel(tag)}
              </button>
            );
          })}
        </div>
      </div>
      {form.eventType === "fuel" && (
        <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fuel accuracy</p>
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span className="text-sm">
              <span className="font-medium">Filled the tank</span>
              <span className="ml-1 text-slate-400">(uncheck for partial top-up)</span>
            </span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-petrol"
              checked={fuelToggles.fuelFullTank}
              onChange={(e) => setFuelToggles((p) => ({ ...p, fuelFullTank: e.target.checked }))}
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span className="text-sm">
              <span className="font-medium">Skipped a fill-up since last time</span>
              <span className="ml-1 text-slate-400">(helps keep MPG accurate)</span>
            </span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-amber-500"
              checked={fuelToggles.fuelMissedPrevious}
              onChange={(e) => setFuelToggles((p) => ({ ...p, fuelMissedPrevious: e.target.checked }))}
            />
          </label>
        </div>
      )}
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
