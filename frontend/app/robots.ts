import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/api/serverBase";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dev.html", "/feed", "/garage", "/profile", "/auth", "/search", "/vehicles/new", "/posts/new"],
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
