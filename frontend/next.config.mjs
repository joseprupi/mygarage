/** @type {import('next').NextConfig} */
const nextConfig = {
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
  },
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "**" }
    ]
  }
};

export default nextConfig;
