import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const host = 'https://super-juampy.vercel.app';
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: host + '/sitemap.xml',
    host,
  };
}

