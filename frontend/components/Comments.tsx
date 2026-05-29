"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Heart, Trash2 } from "lucide-react";

import { authApi, postApi } from "@/lib/api/client";
import type { Comment } from "@/lib/types";

function CommentRow({
  comment,
  currentUserId,
  postAuthorId,
  postId
}: {
  comment: Comment;
  currentUserId?: string;
  postAuthorId: string;
  postId: string;
}) {
  const queryClient = useQueryClient();
  const [liked, setLiked] = useState(comment.viewer_has_liked);
  const [likeCount, setLikeCount] = useState(comment.like_count);
  const likeMutation = useMutation({
    mutationFn: () => (liked ? postApi.unlikeComment(comment.id) : postApi.likeComment(comment.id)),
    onMutate: () => {
      setLiked((value) => !value);
      setLikeCount((value) => (liked ? Math.max(0, value - 1) : value + 1));
    },
    onError: () => {
      setLiked(comment.viewer_has_liked);
      setLikeCount(comment.like_count);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["comments", postId] });
    }
  });
  const deleteMutation = useMutation({
    mutationFn: () => postApi.deleteComment(comment.id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["comments", postId] }),
        queryClient.invalidateQueries({ queryKey: ["post", postId] }),
        queryClient.invalidateQueries({ queryKey: ["feed"] })
      ]);
    }
  });
  const canDelete = currentUserId === comment.author_user_id || currentUserId === postAuthorId;

  return (
    <article className="rounded-2xl bg-slate-50 p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-700">
            {comment.author?.username ? `@${comment.author.username}` : "Driver"}
          </p>
          <p className="mt-1 whitespace-pre-wrap">{comment.body}</p>
          <p className="mt-1 text-xs text-slate-500">{new Date(comment.created_at).toLocaleString()}</p>
        </div>
        {canDelete && (
          <button
            className="rounded-full p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
            title="Delete comment"
            type="button"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
      <button
        className="mt-2 flex items-center gap-1 text-xs text-slate-500 disabled:opacity-50"
        disabled={!currentUserId || likeMutation.isPending}
        onClick={() => likeMutation.mutate()}
        type="button"
      >
        <Heart size={14} className={liked ? "fill-red-500 text-red-500" : ""} />
        {likeCount}
      </button>
    </article>
  );
}

export function Comments({ postId, postAuthorId }: { postId: string; postAuthorId: string }) {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: authApi.me, retry: false });
  const currentUser = me.data as { id: string } | undefined;
  const [body, setBody] = useState("");
  const comments = useQuery({ queryKey: ["comments", postId], queryFn: () => postApi.comments(postId) });
  const mutation = useMutation({
    mutationFn: () => postApi.comment(postId, body),
    onSuccess: async () => {
      setBody("");
      await queryClient.invalidateQueries({ queryKey: ["comments", postId] });
    }
  });

  return (
    <section className="mt-5 rounded-3xl bg-white p-5 shadow-sm">
      <h2 className="font-bold">Comments</h2>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (body.trim()) mutation.mutate();
        }}
      >
        <input
          className="flex-1 rounded-xl border px-3 py-2"
          placeholder="Add a comment"
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <button className="rounded-xl bg-asphalt px-4 py-2 text-white" type="submit">
          Post
        </button>
      </form>
      <div className="mt-4 space-y-3">
        {comments.isLoading && <p className="text-sm text-slate-500">Loading comments...</p>}
        {comments.error && <p className="text-sm text-red-600">Unable to load comments.</p>}
        {comments.data?.map((comment) => (
          <CommentRow
            comment={comment}
            currentUserId={currentUser?.id}
            key={comment.id}
            postAuthorId={postAuthorId}
            postId={postId}
          />
        ))}
        {comments.data?.length === 0 && <p className="text-sm text-slate-500">No comments yet.</p>}
      </div>
    </section>
  );
}
