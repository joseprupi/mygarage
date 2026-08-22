import type { Metadata } from "next";

import type { Post } from "@/lib/types";
import { absoluteMediaUrl, serverFetch } from "@/lib/api/serverBase";
import { PostClient } from "./PostClient";

function truncate(text: string, max = 70): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ postId: string }>;
}): Promise<Metadata> {
  const { postId } = await params;
  const post = await serverFetch<Post>(`/posts/${postId}`);
  if (!post) return { title: "CarFable" };

  const username = post.author?.username ? `@${post.author.username}` : "@someone";
  const caption = post.caption?.trim();
  const title = caption ? `${truncate(caption)} — CarFable` : `Post by ${username} — CarFable`;
  const description = caption || `A post by ${username} on CarFable.`;
  const image = absoluteMediaUrl(post.media?.[0]?.url) ?? absoluteMediaUrl(post.author?.avatar_url);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      url: `/posts/${post.id}`,
      images: image ? [{ url: image }] : undefined
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined
    }
  };
}

export default function PostPage(props: { params: Promise<{ postId: string }> }) {
  return <PostClient {...props} />;
}
