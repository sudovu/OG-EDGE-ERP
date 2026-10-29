import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, setAuth } from "../lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const r = await api.post("/auth/login", { email, password });
      const d = r.data.data;
      setAuth(d.token, d.memberships?.[0]?.organization_id);
      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? "Login failed");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <form onSubmit={submit} className="bg-white p-8 rounded shadow w-96 space-y-4">
        <h1 className="text-2xl font-bold">OG-EDGE ERP</h1>
        <p className="text-slate-500">Sign in to your account</p>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <input className="w-full border p-2 rounded" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="w-full border p-2 rounded" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="w-full bg-slate-900 text-white p-2 rounded">Sign in</button>
        <div className="text-sm text-center">
          No account? <Link to="/register" className="text-blue-600">Register</Link>
        </div>
      </form>
    </div>
  );
}