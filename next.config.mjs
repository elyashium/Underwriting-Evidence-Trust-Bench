/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The bench reads and writes one JSON file (`data/reviews.json`) through
  // `node:fs`, so every page that touches it has to render on the server. That
  // is the default here; nothing in this app is statically exported.
  experimental: {},
};

export default nextConfig;
