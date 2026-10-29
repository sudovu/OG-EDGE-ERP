import { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function ProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", sku: "", item_type: "product", category_id: "", unit_id: "" });
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const [p, c] = await Promise.all([
        api.get("/products"),
        api.get("/categories"),
      ]);
      setProducts(p.data.data);
      setCategories(c.data.data);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? "Failed to load");
    }
  };

  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/products", {
        name: form.name,
        sku: form.sku || undefined,
        item_type: form.item_type,
        category_id: form.category_id || undefined,
        unit_id: form.unit_id || undefined,
      });
      setForm({ name: "", sku: "", item_type: "product", category_id: "", unit_id: "" });
      load();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? "Create failed");
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Catalog / Products</h1>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      <form onSubmit={create} className="bg-white p-4 rounded shadow mb-6 grid grid-cols-2 md:grid-cols-5 gap-2">
        <input className="border p-2 rounded" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input className="border p-2 rounded" placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        <select className="border p-2 rounded" value={form.item_type} onChange={(e) => setForm({ ...form, item_type: e.target.value })}>
          <option value="product">Product</option>
          <option value="service">Service</option>
          <option value="digital">Digital</option>
          <option value="rental">Rental</option>
          <option value="labor">Labor</option>
          <option value="composite">Composite</option>
        </select>
        <select className="border p-2 rounded" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
          <option value="">Category</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="bg-slate-900 text-white rounded px-4">Add</button>
      </form>
      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-2 text-left">Name</th>
              <th className="p-2 text-left">SKU</th>
              <th className="p-2 text-left">Type</th>
              <th className="p-2 text-left">Active</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-2">{p.name}</td>
                <td className="p-2">{p.sku}</td>
                <td className="p-2">{p.item_type}</td>
                <td className="p-2">{p.is_active ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}