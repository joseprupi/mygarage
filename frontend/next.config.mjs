/** @type {import('next').NextConfig} */
const nextConfig = {
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
