export default function Home() {
  return (
    <main className="min-h-screen bg-white text-gray-900">
      <section className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-extrabold tracking-tight">Super Juampy</h1>
        <p className="mt-2 text-sm text-gray-600">
          Elegí una sección. Si no estás logueado, te pedirá iniciar sesión.
        </p>

        <div className="mt-6 grid gap-3">
          <a href="/login" className="rounded-lg px-4 py-3 bg-gray-900 text-white hover:opacity-90 transition">
            Login
          </a>
          <a href="/pos" className="rounded-lg px-4 py-3 bg-emerald-600 text-white hover:bg-emerald-700 transition">
            Ir al POS
          </a>
          <a href="/inventory" className="rounded-lg px-4 py-3 bg-indigo-600 text-white hover:bg-indigo-700 transition">
            Inventario
          </a>
          <a href="/reports" className="rounded-lg px-4 py-3 bg-sky-600 text-white hover:bg-sky-700 transition">
            Reportes
          </a>
        </div>
      </section>
    </main>
  )
}
