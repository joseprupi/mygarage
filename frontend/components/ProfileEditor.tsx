"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { authApi, mediaApi, setToken } from "@/lib/api/client";
import { carAvatarUri } from "@/lib/avatar";

export function ProfileEditor() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function logOut() {
    setToken(null);
    queryClient.invalidateQueries({ queryKey: ["me"] });
    queryClient.invalidateQueries({ queryKey: ["feed"] });
    router.push("/auth");
  }

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ["me"],
    queryFn: authApi.me,
    retry: false
  });
  const user = data as
    | {
        id: string;
        username: string;
        display_name?: string;
        bio?: string;
        avatar_url?: string;
        location?: string;
      }
    | undefined;

  const changePhoto = useMutation({
    mutationFn: async (file: File) => {
      const { url } = await mediaApi.upload(file, "avatar");
      await authApi.updateProfile({ avatar_url: url });
      return url;
    },
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not update photo")
  });

  if (isLoading) return <div className="surface rounded-3xl p-6">Loading profile...</div>;
  if (loadError || !user) {
    return (
      <div className="surface rounded-3xl p-6">
        <p className="mb-4">Log in to manage your garage.</p>
        <Link className="btn btn-primary" href="/auth">
          Log in
        </Link>
      </div>
    );
  }

  const busy = changePhoto.isPending;

  return (
    <section className="space-y-6">
      <div className="surface rounded-3xl p-6">
        <div className="flex items-start gap-4">
          <div className="relative h-20 w-20 shrink-0">
            <div className="h-20 w-20 overflow-hidden rounded-full bg-slate-200">
              <img
                src={user.avatar_url || carAvatarUri(user.username)}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 rounded-full bg-asphalt px-2 py-1 text-xs font-semibold text-white shadow disabled:opacity-60"
              aria-label="Change profile photo"
            >
              {busy ? "..." : "Edit"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) changePhoto.mutate(file);
                event.target.value = "";
              }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">@{user.username}</h1>
            <p className="text-slate-600">{user.display_name}</p>
            <p className="text-sm text-slate-500">{user.location}</p>
          </div>
          <button type="button" className="btn btn-secondary shrink-0" onClick={logOut}>
            Log out
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {user.bio && <p className="mt-4 text-sm leading-6">{user.bio}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link className="hover-lift flex items-center justify-center rounded-2xl bg-asphalt p-4 font-semibold text-white" href="/vehicles/new">
          Add a vehicle
        </Link>
        <Link className="surface hover-lift flex items-center justify-center rounded-2xl p-4 font-semibold" href="/posts/new">
          Create a post
        </Link>
      </div>
    </section>
  );
}
