import JsonLd from "./seo-jsonld";
import "./globals.css";
import AIChat from "@/app/_components/AIChat";
import ServiceWorker from "@/app/_components/ServiceWorker";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import HeaderNav from "./_components/HeaderNav";
import BrandTheme from "./_components/BrandTheme";
import { Toaster } from "react-hot-toast";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  manifest: "/manifest.json",
  title: "Super Juampy",
  description: "POS y reportes — Super Juampy",
};

export const viewport: Viewport = {
  themeColor: "#CC2020",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css" />
        <meta
          name="description"
          content="Super Juampy ofrece panificados frescos, fiambrería y productos de supermercado en Charata, Chaco."
        />
        <link rel="canonical" href="https://super-juampy.vercel.app" />
        <meta name="robots" content="index,follow" />
        <meta charSet="utf-8" />
      </head>
      <body className={`${inter.className} min-h-dvh bg-[#f8fafc] text-[#111]`}>

        <div className="mx-auto max-w-6xl px-4 py-4">
          <BrandTheme />
          <HeaderNav />

          <div className="max-w-7xl mx-auto">{children}</div>

          <Toaster position="bottom-center" containerStyle={{ bottom: 80 }} />
          <JsonLd />


        </div>
        <AIChat />
        <ServiceWorker />
    </body>
    </html>
  );
}
