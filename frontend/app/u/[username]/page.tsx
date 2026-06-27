"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { use } from "react";

import { api } from "@/lib/api/client";
import { carAvatarUri } from "@/lib/avatar";
import type { Post, Vehicle } from "@/lib/types";
import { PostCard } from "@/components/PostCard";
import { LoadErrorCard } from "@/components/LoadErrorCard";

export default function UserProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const userQuery = useQuery({
    queryKey: ["user", username],
    queryFn: () => api<{ id: string; username: string; bio?: string; avatar_url?: string }>(`/users/by-username/${username}`)
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

  if (userQuery.isLoading) return <div>Loading user...</div>;
  if (userQuery.error) return <LoadErrorCard error={userQuery.error} noun="profile" />;
  if (!userQuery.data) return <div>User not found.</div>;

  return (
    <section className="space-y-6">
      <div className="surface rounded-3xl p-6">
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 overflow-hidden rounded-full bg-slate-200">
            <img
              src={userQuery.data.avatar_url || carAvatarUri(userQuery.data.username)}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.src = carAvatarUri(username);
              }}
            />
          </div>
          <h1 className="text-3xl font-bold">@{userQuery.data.username}</h1>
        </div>
        {userQuery.data.bio && <p className="mt-3 text-slate-600">{userQuery.data.bio}</p>}
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
    </section>
  );
}
