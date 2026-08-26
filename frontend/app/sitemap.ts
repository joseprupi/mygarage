import type { MetadataRoute } from "next";
import { SITE_ORIGIN, serverApiBase } from "@/lib/api/serverBase";

interface SitemapVehicleEntry {
  id: string;
  updatedAt: string;
}
interface SitemapPostEntry {
  id: string;
  updatedAt: string;
}
interface SitemapUserEntry {
  username: string;
  updatedAt: string;
}
interface SitemapEntriesResponse {
  vehicles: SitemapVehicleEntry[];
  posts: SitemapPostEntry[];
  users: SitemapUserEntry[];
}

const staticRoutes: MetadataRoute.Sitemap = [
  {
    url: `${SITE_ORIGIN}/`,
    changeFrequency: "daily",
    priority: 1,
  },
  {
    url: `${SITE_ORIGIN}/privacy`,
    changeFrequency: "monthly",
    priority: 0.3,
  },
  {
    url: `${SITE_ORIGIN}/support`,
    changeFrequency: "monthly",
    priority: 0.3,
  },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let dynamic: MetadataRoute.Sitemap = [];

  try {
    const res = await fetch(`${serverApiBase()}/sitemap/entries`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data: SitemapEntriesResponse = await res.json();

      const vehicleEntries: MetadataRoute.Sitemap = (data.vehicles ?? []).map((v) => ({
        url: `${SITE_ORIGIN}/v/${v.id}`,
        lastModified: v.updatedAt,
        changeFrequency: "weekly",
        priority: 0.8,
      }));

      const postEntries: MetadataRoute.Sitemap = (data.posts ?? []).map((p) => ({
        url: `${SITE_ORIGIN}/posts/${p.id}`,
        lastModified: p.updatedAt,
        changeFrequency: "weekly",
        priority: 0.6,
      }));

      const userEntries: MetadataRoute.Sitemap = (data.users ?? []).map((u) => ({
        url: `${SITE_ORIGIN}/u/${u.username}`,
        lastModified: u.updatedAt,
        changeFrequency: "weekly",
        priority: 0.5,
      }));

      dynamic = [...vehicleEntries, ...postEntries, ...userEntries];
    }
  } catch {
    // Fail soft: sitemap still returns static entries
  }

  return [...staticRoutes, ...dynamic];
}
