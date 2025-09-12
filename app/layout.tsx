import './globals.css';
import Navbar from './components/Navbar';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Super Juampy',
  description:
    'Super Juampy ofrece panificados frescos, fiambrería y productos de supermercado en Charata, Chaco. Consultá stock por sucursal y registrá ventas con nuestro POS.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Navbar />
        <main id="page" className="container">
          {children}
        </main>
        <footer id="seo-footer" className="px-4 py-6 text-sm" style={{ color: 'var(--muted)' }}>
          Super Juampy es tu supermercado en Charata, Chaco: panificados frescos, fiambrería y productos de almacén.
          Consultá stock por sucursal y registrá ventas con nuestro POS.
        </footer>
      </body>
    </html>
  );
}


