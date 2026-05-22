import withPWA from "next-pwa";

const pwaConfig = withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/products.*/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "products-cache",
        expiration: {
          maxEntries: 500,
          maxAgeSeconds: 60 * 60 * 24, // 24 horas
        },
      },
    },
    {
      urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/stores.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "stores-cache",
        expiration: {
          maxEntries: 10,
          maxAgeSeconds: 60 * 60 * 24 * 7, // 7 días
        },
      },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
};

export default pwaConfig(nextConfig);
