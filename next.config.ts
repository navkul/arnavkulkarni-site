import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  ...(process.env.CATAN_BUILD_LOCAL === '1' ? { output: 'standalone' as const } : {}),
};

export default nextConfig;
