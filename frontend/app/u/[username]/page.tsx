import type { Metadata } from "next";

import type { PublicUser } from "@/lib/types";
import { absoluteMediaUrl, serverFetch } from "@/lib/api/serverBase";
import { UserClient } from "./UserClient";

export async function generateMetadata({
  params
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const user = await serverFetch<PublicUser>(`/users/by-username/${username}`);
  if (!user) return { title: "CarFable" };

  const handle = `@${user.username}`;
  const label = user.display_name?.trim() ? `${user.display_name} (${handle})` : handle;
  const title = `${label} — CarFable`;
  const description = user.bio?.trim() || `${handle}'s garage and vehicle history on CarFable.`;
  const image = absoluteMediaUrl(user.avatar_url);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
      url: `/u/${user.username}`,
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

export default function UserProfilePage(props: { params: Promise<{ username: string }> }) {
  return <UserClient {...props} />;
}
