import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, setAuth } from "../lib/api";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const r = await api.post("/auth/register", { email, password, fullName, organizationName: orgName || undefined });
      const d = r.data.data;
      setAuth(d.token, d.organizationId);
      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? "Registration failed");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <form onSubmit={submit} className="bg-white p-8 rounded shadow w-96 space-y-4">
        <h1 className="text-2xl font-bold">Create account</h1>
        <input className="w-full border p-2 rounded" placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <input className="w-full border p-2 rounded" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="w-full border p-2 rounded" type="password" placeholder="Password (min 8)" value={password} onChange={(e) => setPassword(e.target.value)} />
        <input className="w-full border p-2 rounded" placeholder="Organization name (optional)" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <button className="w-full bg-slate-900 text-white p-2 rounded">Register</button>
        <div className="text-sm text-center">
          Have account? <Link to="/login" className="text-blue-600">Sign in</Link>
        </div>
      </form>
    </div>
  );
}