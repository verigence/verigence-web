import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Cloudflare Pages: use @cloudflare/next-on-pages adapter
  // output: 'edge' is set via wrangler.toml / CF adapter
}

export default nextConfig
