"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { catalogApi, vehicleApi } from "@/lib/api/client";
import type { Vehicle } from "@/lib/types";

const OTHER = "__other__";

const emptyVehicle = {
  make: "",
  model: "",
  year: "",
  trim: "",
  nickname: "",
  mileage: "",
  color: "",
  transmission: "",
  engine: "",
  drivetrain: "",
  description: "",
  cover_image_url: "",
  visibility: "public"
};

// Free-text fields rendered as plain inputs (make/model/year handled separately).
const textFields: [keyof typeof emptyVehicle, string][] = [
  ["trim", "Trim"],
  ["nickname", "Nickname"],
  ["mileage", "Mileage"],
  ["color", "Color"],
  ["transmission", "Transmission"],
  ["engine", "Engine"],
  ["drivetrain", "Drivetrain"],
  ["cover_image_url", "Cover image URL"]
];

export function VehicleForm({ vehicleId }: { vehicleId?: string }) {
  const router = useRouter();
  const [form, setForm] = useState(emptyVehicle);
  const [error, setError] = useState<string | null>(null);

  // "Other" (free-text) mode per field.
  const [makeOther, setMakeOther] = useState(false);
  const [modelOther, setModelOther] = useState(false);
  const [yearOther, setYearOther] = useState(false);

  const vehicleQuery = useQuery({
    queryKey: ["vehicle", vehicleId],
    queryFn: () => vehicleApi.get(vehicleId!),
    enabled: Boolean(vehicleId)
  });

  const makesQuery = useQuery({ queryKey: ["catalog-makes"], queryFn: catalogApi.makes });
  const yearsQuery = useQuery({ queryKey: ["catalog-years"], queryFn: catalogApi.years });
  const makes = makesQuery.data ?? [];
  const years = yearsQuery.data ?? [];

  const canLookupModels = Boolean(form.make && form.year) && !makeOther && !yearOther;
  const modelsQuery = useQuery({
    queryKey: ["catalog-models", form.make, form.year],
    queryFn: () => catalogApi.models(form.make, Number(form.year)),
    enabled: canLookupModels
  });
  const models = modelsQuery.data ?? [];

  // Load existing vehicle into the form.
  useEffect(() => {
    const v = vehicleQuery.data;
    if (!v) return;
    setForm({
      make: v.make ?? "",
      model: v.model ?? "",
      year: v.year != null ? String(v.year) : "",
      trim: v.trim ?? "",
      nickname: v.nickname ?? "",
      mileage: v.mileage != null ? String(v.mileage) : "",
      color: v.color ?? "",
      transmission: v.transmission ?? "",
      engine: v.engine ?? "",
      drivetrain: v.drivetrain ?? "",
      description: v.description ?? "",
      cover_image_url: v.cover_image_url ?? "",
      visibility: v.visibility ?? "public"
    });
  }, [vehicleQuery.data]);

  // Backward compat: if a saved value isn't in the catalog, drop into "Other" mode.
  useEffect(() => {
    if (makes.length && form.make && !makes.includes(form.make)) {
      setMakeOther(true);
      setModelOther(true);
    }
  }, [makes, form.make]);
  useEffect(() => {
    if (years.length && form.year && !years.includes(Number(form.year))) {
      setYearOther(true);
    }
  }, [years, form.year]);
  useEffect(() => {
    if (canLookupModels && modelsQuery.data && form.model && !modelsQuery.data.includes(form.model)) {
      setModelOther(true);
    }
  }, [modelsQuery.data, canLookupModels, form.model]);

  if (vehicleId && vehicleQuery.isLoading) return <div className="p-6">Loading vehicle...</div>;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!form.make || !form.model) {
      setError("Make and model are required.");
      return;
    }
    const body: Partial<Vehicle> = {
      ...form,
      year: form.year ? Number(form.year) : null,
      mileage: form.mileage ? Number(form.mileage) : null,
      visibility: form.visibility as Vehicle["visibility"]
    };
    try {
      const vehicle = vehicleId ? await vehicleApi.update(vehicleId, body) : await vehicleApi.create(body);
      router.push(`/v/${vehicle.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save vehicle");
    }
  }

  const selectClass = "w-full rounded-xl border px-3 py-2 disabled:bg-slate-100 disabled:text-slate-400";
  const inputClass = "w-full rounded-xl border px-3 py-2";

  return (
    <form className="space-y-4 rounded-3xl bg-white p-6 shadow-sm" onSubmit={submit}>
      <h1 className="text-2xl font-bold">{vehicleId ? "Edit vehicle" : "Create vehicle"}</h1>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Make */}
        <label className="space-y-1 text-sm">
          <span>Make</span>
          {makeOther ? (
            <div className="flex gap-2">
              <input
                className={inputClass}
                placeholder="Enter make"
                value={form.make}
                onChange={(e) => setForm({ ...form, make: e.target.value })}
              />
              <button
                type="button"
                className="shrink-0 rounded-xl border px-3 text-xs"
                onClick={() => {
                  setMakeOther(false);
                  setModelOther(false);
                  setForm({ ...form, make: "", model: "" });
                }}
              >
                List
              </button>
            </div>
          ) : (
            <select
              className={selectClass}
              value={makes.includes(form.make) ? form.make : ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === OTHER) {
                  setMakeOther(true);
                  setModelOther(true);
                  setForm({ ...form, make: "", model: "" });
                } else {
                  setModelOther(false);
                  setForm({ ...form, make: v, model: "" });
                }
              }}
            >
              <option value="">Select make…</option>
              {makes.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value={OTHER}>Other…</option>
            </select>
          )}
        </label>

        {/* Year */}
        <label className="space-y-1 text-sm">
          <span>Year</span>
          {yearOther ? (
            <div className="flex gap-2">
              <input
                className={inputClass}
                inputMode="numeric"
                placeholder="Enter year"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value.replace(/\D/g, "") })}
              />
              <button
                type="button"
                className="shrink-0 rounded-xl border px-3 text-xs"
                onClick={() => {
                  setYearOther(false);
                  setForm({ ...form, year: "", model: "" });
                }}
              >
                List
              </button>
            </div>
          ) : (
            <select
              className={selectClass}
              value={years.includes(Number(form.year)) ? form.year : ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === OTHER) {
                  setYearOther(true);
                  setForm({ ...form, year: "", model: "" });
                } else {
                  setModelOther(false);
                  setForm({ ...form, year: v, model: "" });
                }
              }}
            >
              <option value="">Select year…</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
              <option value={OTHER}>Other…</option>
            </select>
          )}
        </label>

        {/* Model */}
        <label className="space-y-1 text-sm sm:col-span-2">
          <span>Model</span>
          {makeOther || yearOther || modelOther ? (
            <div className="flex gap-2">
              <input
                className={inputClass}
                placeholder="Enter model"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              />
              {!makeOther && !yearOther && (
                <button
                  type="button"
                  className="shrink-0 rounded-xl border px-3 text-xs"
                  onClick={() => {
                    setModelOther(false);
                    setForm({ ...form, model: "" });
                  }}
                >
                  List
                </button>
              )}
            </div>
          ) : (
            <select
              className={selectClass}
              disabled={!canLookupModels || modelsQuery.isLoading}
              value={models.includes(form.model) ? form.model : ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === OTHER) {
                  setModelOther(true);
                  setForm({ ...form, model: "" });
                } else {
                  setForm({ ...form, model: v });
                }
              }}
            >
              <option value="">
                {!form.make || !form.year
                  ? "Pick make & year first…"
                  : modelsQuery.isLoading
                    ? "Loading models…"
                    : "Select model…"}
              </option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value={OTHER}>Other…</option>
            </select>
          )}
        </label>

        {/* Remaining free-text fields */}
        {textFields.map(([key, label]) => (
          <label className="space-y-1 text-sm" key={key}>
            <span>{label}</span>
            <input
              className={inputClass}
              value={form[key]}
              onChange={(event) => setForm({ ...form, [key]: event.target.value })}
            />
          </label>
        ))}
      </div>

      <label className="block space-y-1 text-sm">
        <span>Description</span>
        <textarea
          className="min-h-28 w-full rounded-xl border px-3 py-2"
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
        />
      </label>
      <select
        className="rounded-xl border px-3 py-2"
        value={form.visibility}
        onChange={(event) => setForm({ ...form, visibility: event.target.value })}
      >
        <option value="public">Public</option>
        <option value="private">Private</option>
        <option value="unlisted">Unlisted</option>
      </select>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="rounded-xl bg-asphalt px-5 py-3 font-semibold text-white" type="submit">
        Save vehicle
      </button>
    </form>
  );
}
