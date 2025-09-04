import './globals.css'
import TopBar from '../components/TopBar'   // ⬅️ ruta correcta desde /app

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-white text-gray-900">
        <TopBar />                          {/* ⬅️ se renderiza aquí */}
        <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  )
}
