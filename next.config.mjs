/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  serverExternalPackages: ['pdf-parse'],
  async headers() {
    return [
      {
        // Headers de seguridad para todos los paths
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // Impide que este documento comparta contexto de navegación con popups/iframes
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // Impide que otros orígenes embeben recursos de este sitio (fetch, iframe, etc.)
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          // CSP se inyecta por request en middleware.ts (con nonce único por request)
        ],
      },
      {
        // API routes: CORP same-origin impide que otros orígenes embeben o lean
        // respuestas de estas rutas. No se emite Access-Control-Allow-Origin
        // porque este es un sistema interno sin acceso cross-origin autorizado;
        // la ausencia del header es la restricción correcta (el browser deniega por defecto).
        source: "/api/(.*)",
        headers: [
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
