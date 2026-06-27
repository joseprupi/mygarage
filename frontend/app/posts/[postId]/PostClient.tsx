"use client";

import { useQuery } from "@tanstack/react-query";
import { use } from "react";

import { api } from "@/lib/api/client";
import type { Post } from "@/lib/types";
import { PostCard } from "@/components/PostCard";
import { Comments } from "@/components/Comments";
import { LoadErrorCard } from "@/components/LoadErrorCard";

export function PostClient({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = use(params);
  const post = useQuery({ queryKey: ["post", postId], queryFn: () => api<Post>(`/posts/${postId}`) });
  if (post.isLoading) return <div>Loading post...</div>;
  if (post.error) return <LoadErrorCard error={post.error} noun="post" />;
  if (!post.data) return <div>Post not found.</div>;
  return (
    <>
      <PostCard post={post.data} />
      <Comments postId={post.data.id} postAuthorId={post.data.author.id} />
    </>
  );
}
