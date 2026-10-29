import { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function SettingsPage() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [newBranch, setNewBranch] = useState("");
  const [error, setError] = useState("");

  const orgId = localStorage.getItem("orgId");

  const load = async () => {
    try {
      const [o, b, l, u] = await Promise.all([
        api.get("/organizations"),
        api.get("/branches"),
        api.get("/locations"),
        api.get("/users"),
      ]);
      setOrgs(o.data.data);
      setBranches(b.data.data);
      setLocations(l.data.data);
      setUsers(u.data.data);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? "Failed");
    }
  };

  useEffect(() => { load(); }, []);

  const createBranch = async () => {
    if (!newBranch) return;
    try {
      await api.post("/branches", { name: newBranch });
      setNewBranch("");
      load();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? "Failed");
    }
  };

  const currentOrg = orgs.find((o) => o.id === orgId) ?? orgs[0];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Settings</h1>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      {currentOrg && (
        <div className="bg-white p-4 rounded shadow mb-6">
          <h2 className="font-semibold mb-2">Organization</h2>
          <div className="text-sm space-y-1">
            <div><b>Name:</b> {currentOrg.name}</div>
            <div><b>Slug:</b> {currentOrg.slug}</div>
            <div><b>Currency:</b> {currentOrg.base_currency}</div>
            <div><b>Timezone:</b> {currentOrg.timezone}</div>
            <div><b>Plan:</b> {currentOrg.plan}</div>
          </div>
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded shadow">
          <h2 className="font-semibold mb-2">Branches</h2>
          <div className="flex gap-2 mb-3">
            <input className="border p-2 rounded flex-1" placeholder="New branch" value={newBranch} onChange={(e) => setNewBranch(e.target.value)} />
            <button onClick={createBranch} className="bg-slate-900 text-white rounded px-4">Add</button>
          </div>
          <ul className="text-sm space-y-1">
            {branches.map((b) => <li key={b.id}>{b.name} {b.code ? `(${b.code})` : ""}</li>)}
          </ul>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <h2 className="font-semibold mb-2">Locations</h2>
          <ul className="text-sm space-y-1">
            {locations.map((l) => <li key={l.id}>{l.name} — {l.type}</li>)}
          </ul>
        </div>
      </div>
      <div className="bg-white p-4 rounded shadow mt-6">
        <h2 className="font-semibold mb-2">Users</h2>
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-2 text-left">Name</th>
              <th className="p-2 text-left">Email</th>
              <th className="p-2 text-left">Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="p-2">{u.full_name}</td>
                <td className="p-2">{u.email}</td>
                <td className="p-2">{u.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}