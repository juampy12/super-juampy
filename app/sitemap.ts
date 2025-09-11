import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const host = 'https://super-juampy.vercel.app';
  return [
    { url: host + '/',               lastModified: new Date(), changeFrequency: 'daily',  priority: 1.0 },
    { url: host + '/products',       lastModified: new Date(), changeFrequency: 'daily',  priority: 0.9 },
    { url: host + '/reports',        lastModified: new Date(), changeFrequency: 'daily',  priority: 0.9 },
    { url: host + '/reports/top-products', lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
  ];
}
