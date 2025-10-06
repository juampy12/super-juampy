import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.alias = { 
      ...(config.resolve.alias || {, "@": path.resolve(__dirname), "@supabase/supabase-js": path.resolve(__dirname,"vendor/supabase-js.ts"), "date-fns": path.resolve(__dirname,"vendor/date-fns.ts"), "date-fns/locale": path.resolve(__dirname,"vendor/date-fns-locale.ts"), "recharts": path.resolve(__dirname,"vendor/recharts.tsx"), "react-day-picker": path.resolve(__dirname,"vendor/react-day-picker.tsx") }),
      "@": path.resolve(__dirname),
    };
    // Asegurar extensiones TS/TSX
    config.resolve.extensions = [
      ".tsx", ".ts", ".jsx", ".js", ".mjs", ".json",
      ...(config.resolve.extensions || []),
    ];
    return config;
  },
};
export default nextConfig;

