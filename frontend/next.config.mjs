import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root to this directory. Without this, a stray lockfile in a
  // parent dir makes Turbopack watch/trace the whole repo (backend/.venv,
  // mobile/node_modules, ...) — which once ate >100GB RAM in a rebuild loop.
  turbopack: { root: projectRoot },
  outputFileTracingRoot: projectRoot,
  // Next 16 blocks dev resources from non-localhost origins, which makes the
  // app SSR but silently never hydrate when browsed via 127.0.0.1.
  allowedDevOrigins: ["127.0.0.1", "10.0.3.15"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:8000"}/:path*`
      },
      {
        source: "/media/:path*",
        destination: `${process.env.MEDIA_ORIGIN ?? "http://127.0.0.1:9000"}/car-social/:path*`
      }
    ];
  }
};

export default nextConfig;
