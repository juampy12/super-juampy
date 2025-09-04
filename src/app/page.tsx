export default function Home() {
  return (
    <main className="p-6 grid gap-4">
      <h1 className="text-2xl font-bold">Super Juampy</h1>
      <p className="text-sm text-gray-600">
        Elegí una sección. Si no estás logueado, te pedirá iniciar sesión.
      </p>
      <div className="grid gap-3">
        <a className="inline-block rounded-lg px-4 py-2 bg-black text-white" href="/login">Login</a>
        <a className="inline-block rounded-lg px-4 py-2 bg-black text-white" href="/pos">Ir al POS</a>
        <a className="inline-block rounded-lg px-4 py-2 bg-black text-white" href="/inventory">Inventario</a>
        <a className="inline-block rounded-lg px-4 py-2 bg-black text-white" href="/reports">Reportes</a>
      </div>
    </main>
  )
}
