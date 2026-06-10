/** @type {import('next').NextConfig} */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).host : "";

const csp = [
  "default-src 'self'",
  // Next.js App Router necesita unsafe-inline para la hidratación (sin nonce)
  "script-src 'self' 'unsafe-inline'",
  // Tailwind usa estilos inline en runtime
  "style-src 'self' 'unsafe-inline'",
  // Íconos PNG/SVG en base64 y blobs del PWA
  "img-src 'self' data: blob:",
  "font-src 'self'",
  // API routes propias + Supabase (REST y WebSocket para realtime)
  `connect-src 'self' https://${supabaseHost} wss://${supabaseHost}`,
  // Service worker del PWA
  "worker-src 'self'",
  // Anti-clickjacking (refuerza X-Frame-Options)
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "form-action 'self'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  serverExternalPackages: ['pdf-parse'],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
