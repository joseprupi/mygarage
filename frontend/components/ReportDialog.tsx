"use client";

import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";

import { reportApi } from "@/lib/api/client";
import { useDialogFocus } from "@/lib/useDialogFocus";

type ReportTarget = {
  type: "post" | "comment" | "user" | "vehicle" | "event";
  id: string;
  label?: string;
};

const REASONS: { value: "spam" | "harassment" | "inappropriate" | "privacy" | "other"; label: string }[] = [
  { value: "spam", label: "Spam or misleading" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "privacy", label: "Privacy violation" },
  { value: "other", label: "Other" }
];

export function ReportDialog({
  target,
  onClose
}: {
  target: ReportTarget;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialogRef = useDialogFocus<HTMLDivElement>();
  const [reason, setReason] = useState<"spam" | "harassment" | "inappropriate" | "privacy" | "other" | "">("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await reportApi.create({
        targetType: target.type,
        targetId: target.id,
        reason,
        details: details.trim() || undefined
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="surface flex max-h-[90vh] w-full max-w-sm flex-col rounded-3xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-base font-semibold">
            Report {target.label ?? target.type}
          </h2>
          <button
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-asphalt"
            onClick={onClose}
            aria-label="Close"
            type="button"
          >
            <X size={18} />
          </button>
        </header>

        {done ? (
          <div className="py-6 text-center">
            <p className="text-2xl">✓</p>
            <p className="mt-2 font-semibold">Thanks — we&apos;ll review it.</p>
            <p className="mt-1 text-sm text-slate-500">Your report has been submitted.</p>
            <button className="btn btn-secondary mt-4" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-slate-700">Reason</legend>
              {REASONS.map(({ value, label }) => (
                <label key={value} className="flex cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="radio"
                    name="reason"
                    value={value}
                    checked={reason === value}
                    onChange={() => setReason(value)}
                    className="accent-petrol"
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <label className="block space-y-1 text-sm">
              <span className="text-slate-600">Details (optional)</span>
              <textarea
                className="input min-h-20 text-sm"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Any additional context..."
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                className="btn btn-primary disabled:opacity-60"
                disabled={!reason || submitting}
              >
                {submitting ? "Submitting…" : "Submit report"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
