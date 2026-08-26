"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, use } from "react";

import { api, blockApi } from "@/lib/api/client";
import { useMe } from "@/lib/useMe";
import { carAvatarUri } from "@/lib/avatar";
import type { Post, PublicUser, Vehicle } from "@/lib/types";
import { PostCard } from "@/components/PostCard";
import { LoadErrorCard } from "@/components/LoadErrorCard";
import { ReportDialog } from "@/components/ReportDialog";

export function UserClient({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const queryClient = useQueryClient();
  const me = useMe();
  const currentUser = me.data as { id: string } | undefined;

  const userQuery = useQuery({
    queryKey: ["user", username],
    queryFn: () => api<PublicUser & { id: string }>(`/users/by-username/${username}`)
  });
  const vehiclesQuery = useQuery({
    queryKey: ["userVehicles", userQuery.data?.id],
    enabled: Boolean(userQuery.data?.id),
    queryFn: () => api<Vehicle[]>(`/users/${userQuery.data!.id}/vehicles`)
  });
  const postsQuery = useQuery({
    queryKey: ["userPosts", userQuery.data?.id],
    enabled: Boolean(userQuery.data?.id),
    queryFn: () => api<Post[]>(`/users/${userQuery.data!.id}/posts`)
  });

  const [reporting, setReporting] = useState(false);

  const isOwnProfile = currentUser && userQuery.data && currentUser.id === userQuery.data.id;
  const viewerHasBlocked = userQuery.data?.viewerHasBlocked ?? false;

  const blockMutation = useMutation({
    mutationFn: () => viewerHasBlocked
      ? blockApi.unblock(userQuery.data!.id)
      : blockApi.block(userQuery.data!.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user", username] });
      void queryClient.invalidateQueries({ queryKey: ["feed"] });
      void queryClient.invalidateQueries({ queryKey: ["userPosts", userQuery.data?.id] });
    }
  });

  if (userQuery.isLoading) return <div>Loading user...</div>;
  if (userQuery.error) return <LoadErrorCard error={userQuery.error} noun="profile" />;
  if (!userQuery.data) return <div>User not found.</div>;

  const user = userQuery.data;

  return (
    <section className="space-y-6">
      <div className="surface rounded-3xl p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 overflow-hidden rounded-full bg-slate-200">
              <img
                src={user.avatar_url || carAvatarUri(user.username)}
                alt=""
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.src = carAvatarUri(username);
                }}
              />
            </div>
            <h1 className="text-3xl font-bold">@{user.username}</h1>
          </div>
          {!isOwnProfile && currentUser && (
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={blockMutation.isPending}
                onClick={() => {
                  const msg = viewerHasBlocked
                    ? `Unblock @${user.username}?`
                    : `Block @${user.username}? Their posts and comments will be hidden.`;
                  if (window.confirm(msg)) blockMutation.mutate();
                }}
              >
                {blockMutation.isPending ? "…" : viewerHasBlocked ? "Unblock" : "Block"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setReporting(true)}
              >
                Report
              </button>
            </div>
          )}
        </div>
        {viewerHasBlocked && (
          <p className="mt-3 rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-500">
            You&apos;ve blocked @{user.username}.{" "}
            <button
              type="button"
              className="font-semibold text-petrol hover:underline"
              onClick={() => blockMutation.mutate()}
              disabled={blockMutation.isPending}
            >
              Unblock
            </button>
          </p>
        )}
        {user.bio && <p className="mt-3 text-slate-600">{user.bio}</p>}
      </div>
      <div>
        <h2 className="mb-3 text-xl font-bold">Vehicles</h2>
        {vehiclesQuery.error && <p className="text-sm text-red-600">Failed to load vehicles.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {vehiclesQuery.data?.map((vehicle) => (
            <Link className="surface hover-lift rounded-2xl p-4" href={`/v/${vehicle.id}`} key={vehicle.id}>
              <p className="font-semibold">
                {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")}
              </p>
              <p className="text-sm text-slate-500">{vehicle.nickname}</p>
            </Link>
          ))}
        </div>
      </div>
      <div>
        <h2 className="mb-3 text-xl font-bold">Posts</h2>
        {postsQuery.error && <p className="text-sm text-red-600">Failed to load posts.</p>}
        <div className="space-y-5">
          {postsQuery.data?.map((post) => <PostCard post={post} key={post.id} />)}
        </div>
      </div>
      {reporting && userQuery.data && (
        <ReportDialog
          target={{ type: "user", id: userQuery.data.id, label: `@${userQuery.data.username}` }}
          onClose={() => setReporting(false)}
        />
      )}
    </section>
  );
}
