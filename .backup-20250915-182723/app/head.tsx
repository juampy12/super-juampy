export default function Head() {
  const site = 'https://super-juampy.vercel.app/';
  return (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      {vp}      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet" />
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" /><title>Super Juampy - POS, Productos y Reportes</title>
      <meta name="description" content="Super Juampy ofrece panificados frescos, fiambrería y productos de supermercado en Charata, Chaco. Consultá stock por sucursal y registrá ventas con nuestro POS." />
      <link rel="canonical" href={site} />
      <meta name="robots" content="index,follow" />

      {/* Open Graph / Twitter */}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Super Juampy" />
      <meta property="og:title" content="Super Juampy - POS, Productos y Reportes" />
      <meta property="og:description" content="Panificados, fiambrería y productos de almacén en Charata, Chaco." />
      <meta property="og:url" content={site} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="Super Juampy - POS, Productos y Reportes" />
      <meta name="twitter:description" content="Panificados, fiambrería y productos de almacén en Charata, Chaco." />
    </>
  );
}



