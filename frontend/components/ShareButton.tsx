"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";

type Variant = "button" | "icon";

export function ShareButton({
  url,
  label = "Copy link",
  variant = "button",
  title = "Copy link"
}: {
  url: string;
  label?: string;
  variant?: Variant;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — ignore
    }
  }

  const Icon = copied ? Check : Link2;

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleCopy}
        title={title}
        className="flex items-center gap-1.5 rounded-full px-2 py-1 hover:bg-slate-100 hover:text-asphalt"
      >
        <Icon size={18} className={copied ? "text-green-600" : undefined} />
        {copied ? "Copied!" : null}
      </button>
    );
  }

  return (
    <button type="button" onClick={handleCopy} title={title} className="btn btn-secondary shrink-0">
      <Icon size={15} className={copied ? "text-green-600" : undefined} />
      {copied ? "Copied!" : label}
    </button>
  );
}
