export default function Home() {
  return (
    <main className="min-h-screen bg-white text-gray-900">
      <section className="max-w-3xl mx-auto px-4 py-8 grid gap-4">
        <div className="flex items-center gap-3">
          <img src="/super-juampy-logo.png" alt="Super Juampy" width={64} height={64} />
          <h1 className="text-3xl font-extrabold tracking-tight">Super Juampy</h1>
        </div>

        <p className="text-sm text-gray-600">
          Elegí una sección. Si no estás logueado, te pedirá iniciar sesión.
        </p>

        <div className="grid gap-3">
          <a href="/pos"       className="rounded-lg px-4 py-3 bg-green-700  text-white hover:bg-green-800  transition">Ir al POS</a>
          <a href="/inventory" className="rounded-lg px-4 py-3 bg-indigo-600 text-white hover:bg-indigo-700 transition">Inventario</a>
          <a href="/reports"   className="rounded-lg px-4 py-3 bg-yellow-400 text-gray-900 hover:bg-yellow-500 transition">Reportes</a>
          <a href="/login"     className="rounded-lg px-4 py-3 bg-gray-900  text-white hover:opacity-90    transition">Login</a>
        </div>
      </section>
    </main>
  );
}
