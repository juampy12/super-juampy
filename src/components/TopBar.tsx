'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabaseClient'

export default function TopBar() {
  const router = useRouter()
  const logout = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <header className="w-full bg-primary text-primary-foreground shadow-card">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/super-juampy-logo.png"   // ⬅️ ruta EXACTA (empieza con /)
            alt="Super Juampy"
            width={28}
            height={28}
            priority
          />
          <span className="font-semibold tracking-tight">Super Juampy</span>
        </Link>
        <nav className="ml-6 flex items-center gap-3 text-sm">
          <Link href="/pos" className="hover:underline">POS</Link>
          <Link href="/inventory" className="hover:underline">Inventario</Link>
          <Link href="/reports" className="hover:underline">Reportes</Link>
        </nav>
        <button onClick={logout} className="ml-auto underline text-sm">Cerrar sesión</button>
      </div>
    </header>
  )
}
