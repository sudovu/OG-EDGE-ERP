import { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function InventoryPage() {
  const [stock, setStock] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [form, setForm] = useState({ product_id: "", warehouse_id: "", movement_type: "in", quantity: 1, unit_cost: 0 });
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const [s, w, p] = await Promise.all([api.get("/stock"), api.get("/warehouses"), api.get("/products")]);
      setStock(s.data.data);
      setWarehouses(w.data.data);
      setProducts(p.data.data);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? "Failed");
    }
  };

  useEffect(() => { load(); }, []);

  const adjust = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/stock/adjust", form);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? "Adjust failed");
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Inventory</h1>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      <form onSubmit={adjust} className="bg-white p-4 rounded shadow mb-6 grid grid-cols-2 md:grid-cols-6 gap-2">
        <select className="border p-2 rounded" value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })} required>
          <option value="">Product</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="border p-2 rounded" value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })} required>
          <option value="">Warehouse</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select className="border p-2 rounded" value={form.movement_type} onChange={(e) => setForm({ ...form, movement_type: e.target.value })}>
          <option value="in">In</option>
          <option value="out">Out</option>
          <option value="adjustment">Adjustment</option>
        </select>
        <input className="border p-2 rounded" type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
        <input className="border p-2 rounded" type="number" placeholder="Unit cost" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: Number(e.target.value) })} />
        <button className="bg-slate-900 text-white rounded px-4">Apply</button>
      </form>
      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-2 text-left">Product</th>
              <th className="p-2 text-left">SKU</th>
              <th className="p-2 text-left">Warehouse</th>
              <th className="p-2 text-left">On hand</th>
              <th className="p-2 text-left">Reserved</th>
            </tr>
          </thead>
          <tbody>
            {stock.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="p-2">{s.product_name}</td>
                <td className="p-2">{s.sku}</td>
                <td className="p-2">{s.warehouse_name}</td>
                <td className="p-2">{s.quantity_on_hand}</td>
                <td className="p-2">{s.quantity_reserved}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}