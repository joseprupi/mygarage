"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { LocationInput } from "@/components/LocationInput";
import { authApi, mediaApi, setToken } from "@/lib/api/client";
import { useMe } from "@/lib/useMe";
import { carAvatarUri } from "@/lib/avatar";
import type { PublicUser } from "@/lib/types";

type MeUser = PublicUser & {
  id: string;
  email?: string;
  created_at?: string;
};

export function ProfileEditor() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState({ display_name: "", bio: "", location: "" });

  function logOut() {
    setToken(null);
    queryClient.invalidateQueries({ queryKey: ["me"] });
    queryClient.invalidateQueries({ queryKey: ["feed"] });
    router.push("/auth");
  }

  const { data, isLoading, error: loadError } = useMe();
  const user = data as MeUser | undefined;

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

  const saveProfile = useMutation({
    mutationFn: () => authApi.updateProfile(fields),
    onSuccess: () => {
      setError(null);
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not update profile")
  });

  const saveSetting = useMutation({
    mutationFn: (patch: { detectMissedFillups?: boolean; includeEstimatedFuel?: boolean }) =>
      authApi.updateProfile({ settings: patch }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not save setting")
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
                onError={(e) => {
                  e.currentTarget.src = carAvatarUri(user.username);
                }}
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
          <div className="flex shrink-0 gap-2">
            {!editing && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setFields({
                    display_name: user.display_name ?? "",
                    bio: user.bio ?? "",
                    location: user.location ?? ""
                  });
                  setError(null);
                  setEditing(true);
                }}
              >
                Edit profile
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={logOut}>
              Log out
            </button>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {editing ? (
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!saveProfile.isPending) saveProfile.mutate();
            }}
          >
            <label className="block space-y-1 text-sm">
              <span>Display name</span>
              <input
                className="input"
                value={fields.display_name}
                onChange={(event) => setFields({ ...fields, display_name: event.target.value })}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span>Bio</span>
              <textarea
                className="input min-h-24"
                value={fields.bio}
                onChange={(event) => setFields({ ...fields, bio: event.target.value })}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span>Location</span>
              <LocationInput value={fields.location} onChange={(v) => setFields({ ...fields, location: v })} />
            </label>
            <div className="flex gap-2">
              <button className="btn btn-primary disabled:opacity-60" disabled={saveProfile.isPending} type="submit">
                {saveProfile.isPending ? "Saving…" : "Save profile"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          user.bio && <p className="mt-4 text-sm leading-6">{user.bio}</p>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link className="hover-lift flex items-center justify-center rounded-2xl bg-asphalt p-4 font-semibold text-white" href="/vehicles/new">
          Add a vehicle
        </Link>
        <Link className="surface hover-lift flex items-center justify-center rounded-2xl p-4 font-semibold" href="/posts/new">
          Create a post
        </Link>
      </div>
      <div className="surface rounded-3xl p-6">
        <h2 className="mb-4 text-lg font-bold">Settings</h2>
        <div className="space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-300 accent-petrol"
              checked={user?.settings?.detectMissedFillups ?? true}
              onChange={(e) => saveSetting.mutate({ detectMissedFillups: e.target.checked })}
            />
            <span className="space-y-0.5">
              <span className="block text-sm font-semibold">Detect missed fill-ups</span>
              <span className="block text-xs text-slate-500">
                Flags tanks whose MPG is far above your usual and estimates the missing fill-up
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-300 accent-petrol"
              checked={user?.settings?.includeEstimatedFuel ?? true}
              onChange={(e) => saveSetting.mutate({ includeEstimatedFuel: e.target.checked })}
            />
            <span className="space-y-0.5">
              <span className="block text-sm font-semibold">Include estimates in fuel totals</span>
            </span>
          </label>
        </div>
      </div>
    </section>
  );
}
