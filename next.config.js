/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Disable image optimization for local images when using custom server
    // This avoids ECONNREFUSED errors during SSR
    unoptimized: true,
  },
};

module.exports = nextConfig;
