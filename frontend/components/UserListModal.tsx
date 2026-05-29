"use client";

import { useEffect } from "react";
import Link from "next/link";
import { X } from "lucide-react";

import { carAvatarUri } from "@/lib/avatar";
import type { PublicUser } from "@/lib/types";

export function UserListModal({
  title,
  users,
  loading = false,
  emptyText = "Nobody here yet.",
  onClose
}: {
  title: string;
  users: PublicUser[];
  loading?: boolean;
  emptyText?: string;
  onClose: () => void;
}) {
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="surface flex max-h-[80vh] w-full max-w-sm flex-col rounded-3xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-asphalt"
            onClick={onClose}
            aria-label="Close"
            type="button"
          >
            <X size={18} />
          </button>
        </header>

        <div className="-mx-1 overflow-y-auto px-1">
          {loading ? (
            <p className="py-6 text-center text-sm text-slate-500">Loading…</p>
          ) : users.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">{emptyText}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {users.map((user) => (
                <li key={user.id}>
                  <Link
                    className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-slate-100"
                    href={`/u/${user.username}`}
                    onClick={onClose}
                  >
                    <div className="h-9 w-9 overflow-hidden rounded-full bg-slate-200 ring-1 ring-slate-200">
                      <img
                        src={user.avatar_url || carAvatarUri(user.username)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">@{user.username}</p>
                      {user.display_name && (
                        <p className="truncate text-xs text-slate-500">{user.display_name}</p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
