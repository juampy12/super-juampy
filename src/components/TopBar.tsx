'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function TopBar() {
  const router = useRouter()
  const [logged, setLogged] = useState<boolean | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setLogged(!!data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setLogged(!!session)
    })
    return () => sub.subscription?.unsubscribe()
  }, [])

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

        {logged ? (
          <>
            <nav className="topnav">
              <Link href="/pos">POS</Link>
              <Link href="/inventory">Inventario</Link>
              <Link href="/reports">Reportes</Link>
            </nav>
            <button className="logout" onClick={logout}>Cerrar sesión</button>
          </>
        ) : (
          <Link
            href="/login"
            className="logout"
            style={{ background:'#2563eb' }}
          >
            Login
          </Link>
        )}
      </div>
    </header>
  )
}
