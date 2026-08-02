"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { getPosEmployee } from "@/lib/posSession";

type Supplier = {
  id: string;
  name: string;
  active: boolean;
  product_count: number;
};

export default function ProveedoresPage() {
  const router = useRouter();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  useEffect(() => {
    const emp = getPosEmployee();
    if (emp?.role !== "supervisor") router.replace("/ventas");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/suppliers?include_inactive=1");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Error al cargar proveedores");
      setSuppliers((json.suppliers ?? []) as Supplier[]);
    } catch (e: any) {
      toast.error(`Error cargando proveedores: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createSupplier() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Error creando proveedor");
      toast.success(`Proveedor "${name}" creado`);
      setNewName("");
      await load();
    } catch (e: any) {
      toast.error(`Error: ${e?.message ?? e}`);
    } finally {
      setCreating(false);
    }
  }

  function startRename(s: Supplier) {
    setEditingId(s.id);
    setEditingName(s.name);
  }

  function cancelRename() {
    setEditingId(null);
    setEditingName("");
  }

  async function saveRename(id: string) {
    const name = editingName.trim();
    if (!name) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/suppliers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Error renombrando proveedor");
      toast.success("Proveedor renombrado");
      setEditingId(null);
      setEditingName("");
      await load();
    } catch (e: any) {
      toast.error(`Error: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(s: Supplier) {
    const nextActive = !s.active;
    if (!nextActive && s.product_count > 0) {
      const ok = window.confirm(
        `"${s.name}" tiene ${s.product_count} producto(s) asignados. Desactivarlo no les quita el proveedor — solo lo saca de los dropdowns para asignar. ¿Continuar?`
      );
      if (!ok) return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/suppliers/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Error actualizando proveedor");
      toast.success(nextActive ? "Proveedor activado" : "Proveedor desactivado");
      await load();
    } catch (e: any) {
      toast.error(`Error: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      <Link href="/products" className="mb-2 inline-block text-sm text-gray-600 underline">
        ← Volver
      </Link>
      <h1 className="text-2xl font-semibold mb-1">Proveedores</h1>
      <p className="text-gray-500 text-sm mb-6">
        Administrá los proveedores usados en /importar-precios y en el filtro de /products.
        Desactivar un proveedor no le quita el proveedor asignado a sus productos, solo lo
        saca de los dropdowns para nuevas asignaciones.
      </p>

      <div className="border rounded-lg p-4 bg-white mb-6 flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">Nuevo proveedor</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createSupplier(); }}
            placeholder="Nombre del proveedor"
            className="border rounded px-3 py-2 w-full text-sm"
          />
        </div>
        <button
          onClick={createSupplier}
          disabled={creating || !newName.trim()}
          className="bg-blue-700 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {creating ? "Creando..." : "Crear"}
        </button>
      </div>

      <div className="border rounded bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600 border-b">
            <tr>
              <th className="p-2 text-left">Nombre</th>
              <th className="p-2 text-right">Productos</th>
              <th className="p-2 text-center">Estado</th>
              <th className="p-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} className={`border-t ${!s.active ? "bg-gray-50 text-gray-400" : ""}`}>
                <td className="p-2">
                  {editingId === s.id ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename(s.id);
                        if (e.key === "Escape") cancelRename();
                      }}
                      autoFocus
                      className="border rounded px-2 py-1 text-sm w-full"
                    />
                  ) : (
                    <span className="font-medium">{s.name}</span>
                  )}
                </td>
                <td className="p-2 text-right">{s.product_count}</td>
                <td className="p-2 text-center">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      s.active ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {s.active ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="p-2 text-right whitespace-nowrap">
                  {editingId === s.id ? (
                    <>
                      <button
                        onClick={() => saveRename(s.id)}
                        disabled={loading || !editingName.trim()}
                        className="text-emerald-700 text-xs font-medium mr-3 disabled:opacity-50"
                      >
                        Guardar
                      </button>
                      <button onClick={cancelRename} className="text-gray-500 text-xs font-medium">
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startRename(s)}
                        disabled={loading}
                        className="text-blue-700 text-xs font-medium mr-3 disabled:opacity-50"
                      >
                        Renombrar
                      </button>
                      <button
                        onClick={() => toggleActive(s)}
                        disabled={loading}
                        className={`text-xs font-medium disabled:opacity-50 ${s.active ? "text-red-600" : "text-emerald-700"}`}
                      >
                        {s.active ? "Desactivar" : "Activar"}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {suppliers.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-gray-500">
                  No hay proveedores todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
