"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

type Variant = "button" | "icon";

export function ShareButton({
  url,
  label = "Share",
  variant = "button",
  title = "Share link"
}: {
  url: string;
  label?: string;
  variant?: Variant;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    // Native share on mobile if available; otherwise copy to clipboard.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ url });
        return;
      } catch {
        // user cancelled or share failed — fall through to copy
      }
    }
    try {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — ignore
    }
  }

  const Icon = copied ? Check : Share2;

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleShare}
        title={title}
        className="flex items-center gap-1.5 rounded-full px-2 py-1 hover:bg-slate-100 hover:text-asphalt"
      >
        <Icon size={18} className={copied ? "text-green-600" : undefined} />
        {copied ? "Copied!" : null}
      </button>
    );
  }

  return (
    <button type="button" onClick={handleShare} title={title} className="btn btn-secondary shrink-0">
      <Icon size={15} className={copied ? "text-green-600" : undefined} />
      {copied ? "Copied!" : label}
    </button>
  );
}
