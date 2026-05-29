"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Heart, MessageCircle, Trash2 } from "lucide-react";

import { authApi, postApi } from "@/lib/api/client";
import { carAvatarUri } from "@/lib/avatar";
import type { Post } from "@/lib/types";
import { ImageCarousel } from "@/components/ImageCarousel";

export function PostCard({ post }: { post: Post }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const me = useQuery({ queryKey: ["me"], queryFn: authApi.me, retry: false });
  const currentUser = me.data as { id: string } | undefined;
  const [liked, setLiked] = useState(post.viewer_has_liked);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [liking, setLiking] = useState(false);
  const [hidden, setHidden] = useState(false);
  const deleteMutation = useMutation({
    mutationFn: () => postApi.delete(post.id),
    onSuccess: async () => {
      setHidden(true);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["feed"] }),
        queryClient.invalidateQueries({ queryKey: ["post", post.id] }),
        queryClient.invalidateQueries({ queryKey: ["vehiclePosts"] })
      ]);
      if (pathname === `/posts/${post.id}`) router.push("/feed");
    }
  });

  async function handleLike() {
    if (liking) return;
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount(wasLiked ? likeCount - 1 : likeCount + 1);
    setLiking(true);
    try {
      if (wasLiked) {
        await postApi.unlike(post.id);
      } else {
        await postApi.like(post.id);
      }
    } catch {
      setLiked(wasLiked);
      setLikeCount(likeCount);
    } finally {
      setLiking(false);
    }
  }

  if (hidden) return null;

  return (
    <article className="rounded-3xl border bg-white p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 overflow-hidden rounded-full bg-slate-200">
            <img
              src={post.author.avatar_url || carAvatarUri(post.author.username)}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
          <div>
            <Link className="font-semibold" href={`/u/${post.author.username}`}>
              @{post.author.username}
            </Link>
            <p className="text-xs text-slate-500">{new Date(post.created_at).toLocaleString()}</p>
          </div>
        </div>
        {currentUser?.id === post.author.id && (
          <button
            className="rounded-full p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (window.confirm("Delete this post?")) deleteMutation.mutate();
            }}
            title="Delete post"
            type="button"
          >
            <Trash2 size={17} />
          </button>
        )}
      </header>

      <div className="mb-3 flex flex-wrap gap-2">
        {post.vehicles.map((vehicle) => (
          <Link
            className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700"
            href={`/v/${vehicle.id}`}
            key={vehicle.id}
          >
            {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")}
            {vehicle.nickname ? ` · ${vehicle.nickname}` : ""}
          </Link>
        ))}
      </div>

      <ImageCarousel media={post.media} />

      {post.caption && <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{post.caption}</p>}

      <footer className="mt-4 flex items-center gap-4 text-sm text-slate-600">
        <button
          className="flex items-center gap-1 disabled:opacity-50"
          disabled={liking}
          onClick={handleLike}
          type="button"
        >
          <Heart size={18} className={liked ? "fill-red-500 text-red-500" : ""} />
          {likeCount}
        </button>
        <Link className="flex items-center gap-1" href={`/posts/${post.id}`}>
          <MessageCircle size={18} />
          {post.comment_count}
        </Link>
      </footer>
    </article>
  );
}
