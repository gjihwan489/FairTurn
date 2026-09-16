/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typescript: {
    ignoreBuildErrors: false
  },
  turbopack: {
    root: process.cwd()
  }
};

export default nextConfig;
