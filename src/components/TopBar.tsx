'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabaseClient'

export default function TopBar() {
  const router = useRouter()
  const logout = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <header className="topbar">
      <div className="topbar__inner">
        <Link href="/" className="brand">
          <img src="/super-juampy-logo.png" alt="Super Juampy" />
          <span>Super Juampy</span>
        </Link>

        <nav className="topnav">
          <Link href="/pos">POS</Link>
          <Link href="/inventory">Inventario</Link>
          <Link href="/reports">Reportes</Link>
        </nav>

        <button className="logout" onClick={logout}>Cerrar sesión</button>
      </div>
    </header>
  )
}
