import JsonLd from "./seo-jsonld";
import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import HeaderNav from "./_components/HeaderNav";
import BrandTheme from "./_components/BrandTheme";
import { Toaster } from "react-hot-toast";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  manifest: "/manifest.json",
  themeColor: "#c1674a",
  title: "Super Juampy",
  description: "POS y reportes — Super Juampy",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta
          name="description"
          content="Super Juampy ofrece panificados frescos, fiambrería y productos de supermercado en Charata, Chaco."
        />
        <link rel="canonical" href="https://super-juampy.vercel.app" />
        <meta name="robots" content="index,follow" />
        <meta charSet="utf-8" />
      </head>
      <body className={`${inter.className} min-h-dvh bg-[#f8fafc] text-[#111]`}>

        <div className="mx-auto max-w-6xl px-4 py-6">
          <BrandTheme />
          <HeaderNav />

          <div className="max-w-7xl mx-auto">{children}</div>

          <Toaster position="top-right" />
          <JsonLd />


        </div>
      </body>
    </html>
  );
}
