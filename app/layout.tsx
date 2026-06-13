import { headers } from "next/headers";
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
  robots: { index: false, follow: false },
  alternates: { canonical: "https://super-juampy.vercel.app" },
};

export const viewport: Viewport = {
  themeColor: "#CC2020",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") ?? "";

  return (
    <html lang="es">
      <body className={`${inter.className} min-h-dvh bg-[#f8fafc] text-[#111]`}>
        <BrandTheme />
        <HeaderNav />

        <div className="mx-auto max-w-6xl px-4 pb-4">
          <div className="max-w-7xl mx-auto">{children}</div>

          <Toaster position="bottom-center" containerStyle={{ bottom: 80 }} />
          <JsonLd nonce={nonce} />
        </div>

        <AIChat />
        <ServiceWorker />
      </body>
    </html>
  );
}
