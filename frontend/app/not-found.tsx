import Link from "next/link";

export default function NotFound() {
  return (
    <div className="surface rounded-3xl p-8 text-center">
      <h1 className="text-xl font-bold">This page doesn&apos;t exist.</h1>
      <p className="mt-2 text-sm text-slate-500">
        The link may be broken, or the page may have been moved or removed.
      </p>
      <Link href="/" className="btn btn-primary mt-5">
        Back to the feed
      </Link>
    </div>
  );
}
