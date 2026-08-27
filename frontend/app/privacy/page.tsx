import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy — CarFable" };

const EFFECTIVE = "August 25, 2026";

export default function PrivacyPage() {
  return (
    <div className="surface rounded-3xl p-8 prose-sm mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Privacy Policy</h1>
      <p className="text-sm text-slate-500">Effective {EFFECTIVE}</p>

      <p>
        CarFable (&quot;we&quot;) is a service for keeping and sharing the history of your vehicles.
        This policy describes what we collect and how we use it, for the CarFable website
        (carfable.com) and the CarFable mobile app.
      </p>

      <h2 className="text-lg font-semibold">What we collect</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Account data:</strong> email address, username, display name, and optional profile details (bio, location). If you sign in with Google or Apple, we receive your email and name from them; we never see your password for those services.</li>
        <li><strong>Content you add:</strong> vehicles (including optional VIN, mileage, purchase date), history events, mods, posts, comments, likes, and the photos or documents you upload. Receipts or fuel-pump photos you choose to scan are sent to an AI provider (Google Gemini) solely to extract the event details, and are not used to train models.</li>
        <li><strong>Technical data:</strong> standard server logs (IP address, timestamps) kept for security and debugging.</li>
      </ul>
      <p>We do not collect precise device location; location fields are free text you type. We do not sell your data, and we show no ads.</p>

      <h2 className="text-lg font-semibold">Visibility</h2>
      <p>
        Vehicles and posts have visibility settings you control. Public content (including your
        username and vehicle history you make public) is visible to anyone with the link. Your VIN
        is masked for everyone except you.
      </p>

      <h2 className="text-lg font-semibold">Where it lives</h2>
      <p>
        Data is stored on Google Cloud (US). We use it only to run the service. It is shared with
        processors strictly needed to operate: Google Cloud (hosting, storage), Google Gemini
        (receipt scanning, only for images you scan).
      </p>

      <h2 className="text-lg font-semibold">Your rights</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>Export: your vehicle history can be exported (CSV + photos) at any time.</li>
        <li>Deletion: deleting a vehicle or post removes its data. You can delete your account and all data at any time from Settings (Profile → Danger zone). You can also contact us and we will do it promptly.</li>
        <li>Access/correction: edit your data directly in the app, or contact us.</li>
      </ul>

      <h2 className="text-lg font-semibold">Contact</h2>
      <p>
        Questions or requests: <a className="text-petrol underline" href="mailto:hello@carfable.com">hello@carfable.com</a>
      </p>
      <p className="text-sm text-slate-500">We will update this page if our practices change.</p>
    </div>
  );
}
