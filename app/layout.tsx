import "./globals.css";
import type { Metadata } from "next";
import ForceLight from "@/app/components/ForceLight";
import Navbar from "@/app/components/Navbar";

export const metadata: Metadata = {
  title: "Super Juampy",
  description: "POS y stock por sucursal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="light">
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
      <body>
        <ForceLight />
        <Navbar />
        <main id="page" className="container">
          {children}
        </main>
      </body>
    </html>
  );
}


