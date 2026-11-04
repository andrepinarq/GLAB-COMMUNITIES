import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatDate } from "../../api";
import { Alert, Loading, Title } from "../../components/ui";
import AdminNav from "./AdminNav";

interface Row {
  id: string;
  email: string;
  status: string;
  is_admin: number;
  last_login_at: string | null;
  full_name: string;
  headline: string;
  hidden_by_admin: number;
  visibility: string;
  memberships: { name: string; status: string }[];
}

export default function AdminMembers() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [communities, setCommunities] = useState<{ id: number; name: string }[]>([]);
  const [q, setQ] = useState("");
  const [community, setCommunity] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ communities: { id: number; name: string }[] }>("/admin/catalog").then((r) => setCommunities(r.communities));
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      api<{ members: Row[] }>(`/admin/members?q=${encodeURIComponent(q)}&community=${community}`).then((r) => setRows(r.members)).catch((e) => setError(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [q, community]);

  return (
    <div className="page">
      <AdminNav />
      <Title>Membros</Title>
      <Alert error={error} />
      <div className="grid-2" style={{ maxWidth: 720 }}>
        <div className="field">
          <label htmlFor="q">Buscar por nome ou e-mail</label>
          <input id="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="c">Comunidade</label>
          <select id="c" value={community} onChange={(e) => setCommunity(Number(e.target.value))}>
            <option value={0}>Todas</option>
            {communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <div className="empty">Nenhum membro encontrado.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Membro</th><th>Comunidades</th><th>Conta</th><th>Último acesso</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/admin/membros/${r.id}`}><strong>{r.full_name}</strong></Link>
                    {r.is_admin === 1 && <span className="pill" style={{ marginLeft: 6 }}>Admin</span>}
                    <br />
                    <span className="hint">{r.email}</span>
                  </td>
                  <td>{r.memberships.map((m) => <span key={m.name} className={`pill ${m.status === "active" ? "" : m.status}`}>{m.name}{m.status !== "active" ? ` · ${m.status === "suspended" ? "suspensa" : "expirada"}` : ""}</span>)}</td>
                  <td>
                    <span className={`pill ${r.status}`}>{r.status === "active" ? "Ativa" : "Suspensa"}</span>
                    {(r.hidden_by_admin === 1 || r.visibility === "hidden") && <span className="pill">Perfil oculto</span>}
                  </td>
                  <td>{formatDate(r.last_login_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
