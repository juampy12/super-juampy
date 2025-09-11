import Navbar from './components/Navbar';
import JsonLd from './seo-jsonld';
import "./globals.css"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import HeaderNav from "./_components/HeaderNav"
import BrandTheme from "./_components/BrandTheme"
import { Toaster } from "react-hot-toast"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Super Juampy",
  description: "POS y reportes — Super Juampy",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
    <meta name="description" content="Super Juampy ofrece panificados frescos, fiambrería y productos de supermercado en Charata, Chaco." />
    <link rel="canonical" href="https://super-juampy.vercel.app" />
    <meta name="robots" content="index,follow" />
    
    
    <meta charSet="utf-8" /></head>
      <body className={`${inter.className} min-h-dvh bg-[#f8fafc] text-[#111]`}>
    <Navbar /><BrandTheme />
        <HeaderNav />
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
        <Toaster position="top-right" />
        <JsonLd />
  <footer id="seo-footer" className="px-4 py-6 text-sm">
    Super Juampy es tu supermercado en Charata, Chaco. Panificados frescos, fiambrería y productos de almacén.
    Consultá stock por sucursal, registrá ventas con nuestro POS y mirá reportes diarios.
  </footer>
    </div>

    </html>
  )
}








