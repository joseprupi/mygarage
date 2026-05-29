import Link from "next/link";
import { Car, Home, PlusSquare, Search, UserRound } from "lucide-react";

const items = [
  { href: "/", label: "Home", icon: Home },
  { href: "/search", label: "Search", icon: Search },
  { href: "/posts/new", label: "Create", icon: PlusSquare },
  { href: "/garage", label: "Garage", icon: Car },
  { href: "/profile", label: "Profile", icon: UserRound }
];

export function Nav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 border-t bg-white/95 backdrop-blur md:top-0 md:bottom-auto">
      <div className="mx-auto flex max-w-3xl items-center px-2 py-2">
        <Link href="/" className="mr-auto hidden items-center gap-2 px-2 md:flex">
          <span className="block h-8 w-8 overflow-hidden rounded-lg">
            <img src="/logo.svg" alt="" className="h-full w-full object-cover" />
          </span>
          <span className="font-bold text-asphalt">Car Social</span>
        </Link>
        <div className="flex flex-1 items-center justify-around md:flex-none md:gap-6">
          {items.map((item) => (
            <Link
              className="flex flex-col items-center gap-1 rounded-xl px-3 py-1 text-xs text-slate-600 hover:text-petrol"
              href={item.href}
              key={item.href}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
