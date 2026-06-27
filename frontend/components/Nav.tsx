"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Car, Home, LogIn, PlusSquare, Search, UserRound } from "lucide-react";

import { useMe } from "@/lib/useMe";

const items = [
  { href: "/", label: "Home", icon: Home },
  { href: "/search", label: "Search", icon: Search },
  { href: "/posts/new", label: "Create", icon: PlusSquare },
  { href: "/garage", label: "Garage", icon: Car },
  { href: "/profile", label: "Profile", icon: UserRound }
];

export function Nav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  // Show a subtle "Log in" affordance only to guests (once the query has settled,
  // so it doesn't flash for logged-in users on first paint).
  const { data, error, isPending } = useMe();
  const isGuest = !isPending && (!data || !!error);

  return (
    <>
      {/* Desktop: Instagram-style left rail, icons-only, expands on hover. */}
      <aside className="group fixed inset-y-0 left-0 z-30 hidden w-16 flex-col overflow-hidden bg-white p-2 transition-[width] duration-200 ease-out hover:w-60 md:flex">
        <Link href="/" className="flex items-center rounded-xl p-1.5">
          <span className="block h-9 w-9 shrink-0 overflow-hidden rounded-lg ring-1 ring-slate-200">
            <img src="/logo.svg" alt="CeCeCar" className="h-full w-full object-cover" />
          </span>
        </Link>
        {isGuest && (
          <Link
            href="/auth"
            className="mt-1 flex items-center gap-3 rounded-xl p-2.5 text-petrol hover:bg-petrol/10"
          >
            <LogIn size={22} strokeWidth={2} className="shrink-0" />
            <span className="whitespace-nowrap text-sm font-medium opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              Log in
            </span>
          </Link>
        )}
        <div className="flex flex-1 flex-col gap-1 pt-[18vh]">
          {items.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl p-2.5 ${
                  active ? "bg-petrol/10 text-petrol" : "text-slate-600 hover:bg-slate-100 hover:text-asphalt"
                }`}
              >
                <item.icon size={22} strokeWidth={active ? 2.4 : 2} className="shrink-0" />
                <span className="whitespace-nowrap text-sm font-medium opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </aside>

      {/* Mobile: bottom tab bar. */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white/90 backdrop-blur-xl md:hidden">
        <div className="flex items-center justify-around px-2 py-2">
          {items.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium ${
                  active ? "bg-petrol/10 text-petrol" : "text-slate-500 hover:bg-slate-100 hover:text-asphalt"
                }`}
              >
                <item.icon size={20} strokeWidth={active ? 2.4 : 2} />
                <span>{item.label}</span>
              </Link>
            );
          })}
          {isGuest && (
            <Link
              href="/auth"
              className="flex flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium text-petrol"
            >
              <LogIn size={20} strokeWidth={2} />
              <span>Log in</span>
            </Link>
          )}
        </div>
      </nav>
    </>
  );
}
