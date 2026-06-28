"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { ImageUploader } from "@/components/ImageUploader";
import { modApi } from "@/lib/api/client";
import type { Media, VehicleMod } from "@/lib/types";

const OTHER = "__other__";

// Suggested mod categories. Free-text "Other…" escape hatch lets owners
// record anything not in the list (mirrors VehicleForm's make/model pattern).
const CATEGORIES = [
  "Engine",
  "Intake",
  "Exhaust",
  "Forced Induction",
  "Drivetrain",
  "Suspension",
  "Brakes",
  "Wheels & Tires",
  "Exterior",
  "Interior",
  "Electronics",
  "Other"
];

function initialForm(mod?: VehicleMod) {
  return {
    category: mod?.category ?? "Suspension",
    name: mod?.name ?? "",
    brand: mod?.brand ?? "",
    cost: mod?.cost_cents != null ? String(mod.cost_cents / 100) : "",
    link: mod?.link ?? "",
    installedDate: mod?.installed_date ?? "",
    mileage: mod?.mileage != null ? String(mod.mileage) : "",
    notes: mod?.notes ?? ""
  };
}

export function VehicleModForm({
  vehicleId,
  mod,
  onClose
}: {
  vehicleId: string;
  mod?: VehicleMod;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(mod);
  const [form, setForm] = useState(() => initialForm(mod));
  const [media, setMedia] = useState<Media[]>(mod?.media ?? []);
  // "Other" free-text mode for category: on when editing a mod whose category
  // isn't one of the suggestions.
  const [categoryOther, setCategoryOther] = useState(
    Boolean(mod?.category && !CATEGORIES.includes(mod.category))
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    if (!form.category.trim()) {
      setError("Category is required.");
      return;
    }
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    const payload = {
      category: form.category.trim(),
      name: form.name.trim(),
      brand: form.brand.trim() || null,
      costCents: form.cost ? Math.round(Number(form.cost) * 100) : null,
      link: form.link.trim() || null,
      installedDate: form.installedDate || null,
      mileage: form.mileage ? Number(form.mileage) : null,
      notes: form.notes.trim() || null,
      media: media.map((item, index) => ({ ...item, sort_order: index }))
    };
    setSubmitting(true);
    try {
      if (isEdit) {
        await modApi.update(mod!.id, payload);
      } else {
        await modApi.create(vehicleId, payload);
      }
      await queryClient.invalidateQueries({ queryKey: ["vehicleMods", vehicleId] });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save mod");
      setSubmitting(false);
    }
  }

  return (
    <form className="surface space-y-4 rounded-2xl p-4" onSubmit={submit}>
      <h2 className="text-lg font-bold">{isEdit ? "Edit mod" : "Add mod"}</h2>

      <label className="block space-y-1 text-sm">
        <span>Category *</span>
        {categoryOther ? (
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="Enter category"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
            <button
              type="button"
              className="shrink-0 rounded-xl border px-3 text-xs"
              onClick={() => {
                setCategoryOther(false);
                setForm({ ...form, category: "Suspension" });
              }}
            >
              List
            </button>
          </div>
        ) : (
          <select
            className="input"
            value={CATEGORIES.includes(form.category) ? form.category : ""}
            onChange={(e) => {
              const v = e.target.value;
              if (v === OTHER) {
                setCategoryOther(true);
                setForm({ ...form, category: "" });
              } else {
                setForm({ ...form, category: v });
              }
            }}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value={OTHER}>Other…</option>
          </select>
        )}
      </label>

      <label className="block space-y-1 text-sm">
        <span>Name *</span>
        <input
          className="input"
          placeholder="e.g. Ohlins Road & Track coilovers"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span>Brand</span>
        <input
          className="input"
          placeholder="e.g. Ohlins"
          value={form.brand}
          onChange={(e) => setForm({ ...form, brand: e.target.value })}
        />
      </label>

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
            onChange={(e) => setForm({ ...form, cost: e.target.value.replace(/[^\d.]/g, "") })}
          />
        </div>
      </label>

      <label className="block space-y-1 text-sm">
        <span>Link</span>
        <input
          className="input"
          type="url"
          placeholder="https://…"
          value={form.link}
          onChange={(e) => setForm({ ...form, link: e.target.value })}
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span>Installed date</span>
        <input
          className="input"
          type="date"
          value={form.installedDate}
          onChange={(e) => setForm({ ...form, installedDate: e.target.value })}
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span>Mileage</span>
        <input
          className="input"
          type="text"
          inputMode="numeric"
          placeholder="e.g. 42000"
          value={form.mileage}
          onChange={(e) => setForm({ ...form, mileage: e.target.value.replace(/[^\d]/g, "") })}
        />
      </label>

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
        <ImageUploader purpose="vehicle_mod_media" onUploaded={(item) => setMedia((items) => [...items, item])} />
      </div>

      <label className="block space-y-1 text-sm">
        <span>Notes</span>
        <textarea
          className="input min-h-24"
          placeholder="Setup, part numbers, install notes…"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button className="btn btn-primary px-5 py-2.5 disabled:opacity-60" disabled={submitting} type="submit">
          {submitting ? "Saving…" : isEdit ? "Save changes" : "Add mod"}
        </button>
        <button
          type="button"
          className="text-sm font-semibold text-slate-500 hover:text-slate-800"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
