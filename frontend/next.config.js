/** @type {import('next').NextConfig} */
const nextConfig = {
  // Skip ESLint during build (will still run in development)
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Skip TypeScript errors during build (for faster builds)
  typescript: {
    ignoreBuildErrors: false,
  },
}

module.exports = nextConfig
