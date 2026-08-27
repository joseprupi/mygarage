import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Support — CarFable" };

export default function SupportPage() {
  return (
    <div className="surface rounded-3xl p-8 mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">CarFable Support</h1>
      <p>
        CarFable keeps your car&apos;s full story — service history, mods, fuel, photos — in one
        place you can share or export.
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Questions or problems:</strong> email <a className="text-petrol underline" href="mailto:hello@carfable.com">hello@carfable.com</a> — we usually answer within a day.</li>
        <li><strong>Account deletion:</strong> you can delete your account and all data at any time from Settings (Profile → Danger zone). You can also email us from your account address and we will do it.</li>
        <li><strong>Privacy:</strong> see our <Link href="/privacy" className="text-petrol underline">privacy policy</Link>.</li>
      </ul>
    </div>
  );
}
