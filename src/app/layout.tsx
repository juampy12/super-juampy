import './globals.css'
import type { Metadata } from 'next'
import TopBar from '../components/TopBar'

export const metadata: Metadata = {
  title: 'Super Juampy',
  description: 'Gestión de POS, inventario y reportes',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-white text-gray-900">
        <TopBar />
        <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  )
}
