const SITE_URL = "https://super-juampy.vercel.app";

export default function JsonLd() {
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "Super Juampy",
      "url": SITE_URL,
      "logo": `${SITE_URL}/logo-super-juampy.png`,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "Super Juampy",
      "url": SITE_URL,
    },
  ];
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
