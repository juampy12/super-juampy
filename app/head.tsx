export default function Head() {
  const site = 'https://super-juampy.vercel.app/';
  return (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Super Juampy - POS, Productos y Reportes</title>
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

