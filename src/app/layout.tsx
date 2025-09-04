import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Super Juampy",
  description: "Sistema de gestión para supermercados",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body className="bg-white text-gray-900">
        <main className="mx-auto max-w-6xl p-4">
          {children}
        </main>
      </body>
    </html>
  );
}
