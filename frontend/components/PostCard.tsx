"use client";

import { InfiniteData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Heart, MessageCircle, Trash2 } from "lucide-react";

import { getToken, postApi } from "@/lib/api/client";
import { useMe } from "@/lib/useMe";
import { carAvatarUri } from "@/lib/avatar";
import { formatDateTime } from "@/lib/format";
import type { FeedPage, Post } from "@/lib/types";
import { ImageCarousel } from "@/components/ImageCarousel";
import { ShareButton } from "@/components/ShareButton";
import { UserListModal } from "@/components/UserListModal";

export function PostCard({ post }: { post: Post }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const me = useMe();
  const currentUser = me.data as { id: string } | undefined;
  const [hidden, setHidden] = useState(false);
  const [likersOpen, setLikersOpen] = useState(false);
  // Liked state + count are read straight off the `post` prop, which is the
  // cached value from whichever query rendered this card (feed/post/vehicle/
  // user lists). Driving the toggle through the query cache (below) keeps it
  // consistent when the virtualized feed unmounts and remounts a card.
  const liked = post.viewer_has_liked;
  const likeCount = post.like_count;
  const likers = useQuery({
    queryKey: ["post", post.id, "likers"],
    queryFn: () => postApi.likers(post.id),
    enabled: likersOpen
  });

  // Apply an optimistic like toggle to every cache that can hold this post.
  // The `apply` mapper is idempotent per target value (it no-ops once a post
  // already matches `nextLiked`), so the same call safely patches the post
  // wherever it appears and is reusable for rollback.
  function patchLike(nextLiked: boolean) {
    const apply = (p: Post): Post =>
      p.id !== post.id || p.viewer_has_liked === nextLiked
        ? p
        : { ...p, viewer_has_liked: nextLiked, like_count: Math.max(0, p.like_count + (nextLiked ? 1 : -1)) };
    queryClient.setQueryData<Post>(["post", post.id], (old) => (old ? apply(old) : old));
    queryClient.setQueryData<InfiniteData<FeedPage>>(["feed"], (old) =>
      old ? { ...old, pages: old.pages.map((page) => ({ ...page, items: page.items.map(apply) })) } : old
    );
    queryClient.setQueriesData<Post[]>({ queryKey: ["vehiclePosts"] }, (old) => (old ? old.map(apply) : old));
    queryClient.setQueriesData<Post[]>({ queryKey: ["userPosts"] }, (old) => (old ? old.map(apply) : old));
  }

  const likeMutation = useMutation({
    mutationFn: (nextLiked: boolean) => (nextLiked ? postApi.like(post.id) : postApi.unlike(post.id)),
    // Optimistic: write the new state to the cache up front (instant toggle),
    // remembering the previous flag so we can roll back if the request fails.
    onMutate: (nextLiked: boolean) => {
      const previous = post.viewer_has_liked;
      patchLike(nextLiked);
      return { previous };
    },
    onError: (_err, _nextLiked, context) => {
      if (context) patchLike(context.previous);
    }
  });

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

  function handleLike() {
    if (likeMutation.isPending) return;
    if (!currentUser) {
      // No token = guest: invite them to log in instead of firing a 401.
      // (Token present but ["me"] not resolved yet: ignore the click —
      // on the virtualized feed the query observer can report pending
      // right after a remount even when the user is known.)
      if (!getToken()) router.push("/auth");
      return;
    }
    likeMutation.mutate(!liked);
  }

  if (hidden) return null;

  return (
    <article className="surface hover-lift rounded-3xl p-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 overflow-hidden rounded-full bg-slate-200 ring-1 ring-slate-200">
            <img
              src={post.author.avatar_url || carAvatarUri(post.author.username)}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.src = carAvatarUri(post.author.username);
              }}
            />
          </div>
          <div>
            <Link className="font-semibold hover:text-petrol" href={`/u/${post.author.username}`}>
              @{post.author.username}
            </Link>
            <p className="text-xs text-slate-500">{formatDateTime(post.created_at)}</p>
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
            className="rounded-full bg-petrol/10 px-3 py-1 text-xs font-medium text-petrol ring-1 ring-petrol/15 hover:bg-petrol/15"
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

      <footer className="mt-4 flex items-center gap-2 text-sm text-slate-600">
        <div className="flex items-center rounded-full hover:bg-red-50">
          <button
            className="flex items-center rounded-full px-2 py-1 disabled:opacity-50"
            disabled={likeMutation.isPending}
            onClick={handleLike}
            aria-label={liked ? "Unlike" : "Like"}
            type="button"
          >
            <Heart
              size={18}
              className={`transition-transform ${liked ? "scale-110 fill-red-500 text-red-500" : "hover:text-red-500"}`}
            />
          </button>
          <button
            className="rounded-full py-1 pr-2 tabular-nums hover:underline disabled:cursor-default disabled:no-underline"
            disabled={likeCount === 0}
            onClick={() => setLikersOpen(true)}
            type="button"
          >
            {likeCount}
          </button>
        </div>
        <Link className="flex items-center gap-1.5 rounded-full px-2 py-1 hover:bg-slate-100 hover:text-asphalt" href={`/posts/${post.id}`}>
          <MessageCircle size={18} />
          {post.comment_count}
        </Link>
        <ShareButton
          variant="icon"
          title="Share post"
          url={typeof window !== "undefined" ? `${window.location.origin}/posts/${post.id}` : `/posts/${post.id}`}
        />
      </footer>

      {likersOpen && (
        <UserListModal
          title="Liked by"
          users={likers.data ?? []}
          loading={likers.isLoading}
          emptyText="No likes yet."
          onClose={() => setLikersOpen(false)}
        />
      )}
    </article>
  );
}
