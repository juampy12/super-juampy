export default function Head() {
  const site = 'https://super-juampy.vercel.app';
  return (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="description" content="Super Juampy ofrece panificados frescos, fiambrería y productos de supermercado en Charata, Chaco." />
      {desc}      <meta property="og:image" content="https://super-juampy.vercel.app/logo.png" />
      <meta name="twitter:image" content="https://super-juampy.vercel.app/logo.png" /><link rel="canonical" href={site} />
      <meta name="robots" content="index,follow" />

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Super Juampy" />
      <meta property="og:title" content="Super Juampy - Tu supermercado en Charata" />
      <meta property="og:description" content="Panificados, fiambrería y más en Charata, Chaco." />
      <meta property="og:url" content={site} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="Super Juampy - Tu supermercado en Charata" />
      <meta name="twitter:description" content="Panificados, fiambrería y más en Charata, Chaco." />
      <title>Super Juampy - Tu supermercado en Charata</title>
    </>
  );
}

