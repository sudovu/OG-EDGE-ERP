import { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function IntegrationsPage() {
  const [keys, setKeys] = useState<any[]>([]);
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [newKey, setNewKey] = useState("");
  const [newWh, setNewWh] = useState({ url: "", events: "invoice.created" });
  const [revealedKey, setRevealedKey] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const [k, w, j] = await Promise.all([api.get("/api-keys"), api.get("/webhooks"), api.get("/jobs")]);
      setKeys(k.data.data);
      setWebhooks(w.data.data);
      setJobs(j.data.data);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? "Failed");
    }
  };

  useEffect(() => { load(); }, []);

  const createKey = async () => {
    try {
      const r = await api.post("/api-keys", { name: newKey || "Default", scopes: "read,write" });
      setRevealedKey(r.data.data.apiKey);
      setNewKey("");
      load();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? "Failed");
    }
  };

  const createWh = async () => {
    try {
      await api.post("/webhooks", newWh);
      setNewWh({ url: "", events: "invoice.created" });
      load();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? "Failed");
    }
  };

  const revokeKey = async (id: string) => {
    try { await api.delete(`/api-keys/${id}`); load(); } catch (e: any) { setError(e?.response?.data?.error?.message ?? "Failed"); }
  };

  const deleteWh = async (id: string) => {
    try { await api.delete(`/webhooks/${id}`); load(); } catch (e: any) { setError(e?.response?.data?.error?.message ?? "Failed"); }
  };

  const processJobs = async () => {
    try { await api.post("/jobs/process"); load(); } catch (e: any) { setError(e?.response?.data?.error?.message ?? "Failed"); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Integrations</h1>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      {revealedKey && <div className="bg-yellow-100 p-3 rounded mb-4 text-sm">New API key (shown once): <code>{revealedKey}</code></div>}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white p-4 rounded shadow">
          <h2 className="font-semibold mb-2">API Keys</h2>
          <div className="flex gap-2 mb-3">
            <input className="border p-2 rounded flex-1" placeholder="Name" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
            <button onClick={createKey} className="bg-slate-900 text-white rounded px-4">Create</button>
          </div>
          <ul className="text-sm space-y-1">
            {keys.map((k) => (
              <li key={k.id} className="flex justify-between">
                <span>{k.name} ({k.key_prefix}…) {k.is_active ? "" : "revoked"}</span>
                {k.is_active === 1 && <button onClick={() => revokeKey(k.id)} className="text-red-600 text-xs">Revoke</button>}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <h2 className="font-semibold mb-2">Webhooks</h2>
          <div className="flex gap-2 mb-3">
            <input className="border p-2 rounded flex-1" placeholder="URL" value={newWh.url} onChange={(e) => setNewWh({ ...newWh, url: e.target.value })} />
            <input className="border p-2 rounded" placeholder="events" value={newWh.events} onChange={(e) => setNewWh({ ...newWh, events: e.target.value })} />
            <button onClick={createWh} className="bg-slate-900 text-white rounded px-4">Add</button>
          </div>
          <ul className="text-sm space-y-1">
            {webhooks.map((w) => (
              <li key={w.id} className="flex justify-between">
                <span>{w.url} — {w.events}</span>
                <button onClick={() => deleteWh(w.id)} className="text-red-600 text-xs">Delete</button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="bg-white p-4 rounded shadow">
        <div className="flex justify-between items-center mb-2">
          <h2 className="font-semibold">Background Jobs</h2>
          <button onClick={processJobs} className="bg-slate-900 text-white rounded px-4 py-1 text-sm">Process pending</button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-100"><tr><th className="p-2 text-left">Type</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Run at</th></tr></thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} className="border-t">
                <td className="p-2">{j.job_type}</td><td className="p-2">{j.status}</td><td className="p-2">{j.run_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}