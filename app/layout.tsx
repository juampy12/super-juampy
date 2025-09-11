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
      <head><meta charSet="utf-8" /></head>
      <body className={`${inter.className} min-h-dvh bg-[#f8fafc] text-[#111]`}>
        <BrandTheme />
        <HeaderNav />
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
        <Toaster position="top-right" />
        <JsonLd />
</body>
    </html>
  )
}


