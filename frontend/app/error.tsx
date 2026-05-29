"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="surface flex min-h-[60vh] flex-col items-center justify-center gap-4 rounded-3xl p-8 text-center">
      <h2 className="text-xl font-bold">Something went wrong</h2>
      <p className="text-sm text-slate-500">{error.message || "An unexpected error occurred."}</p>
      <button className="btn btn-primary px-5 py-2" onClick={reset} type="button">
        Try again
      </button>
    </div>
  );
}
