import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    // Sistema POS interno: bloquear toda indexación
    rules: [{ userAgent: '*', disallow: '/' }],
  };
}
