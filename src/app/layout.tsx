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
      <body>
        <TopBar />
        <main className="container autostyle">{children}</main>
      </body>
    </html>
  )
}
