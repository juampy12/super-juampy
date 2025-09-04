import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  eslint: {
    // No frenar el build por errores de ESLint (warnings/errores)
    ignoreDuringBuilds: true,
  },
}

export default nextConfig
