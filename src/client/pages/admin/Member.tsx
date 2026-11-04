import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, formatDate, type Profile } from "../../api";
import { Alert, Avatar, BadgePill, Loading, SectionLabel, Title } from "../../components/ui";
import { useSession } from "../../session";
import AdminNav from "./AdminNav";

interface Detail {
  user: { id: string; email: string; status: string; is_admin: number; created_at: string; last_login_at: string | null };
  memberships: { community_id: number; name: string; status: string; joined_at: string; renews_at: string | null }[];
  badges: { badge_id: number; name: string; community_id: number; community_name: string }[];
  profile: Profile;
}
interface Catalog {
  communities: { id: number; name: string }[];
  badges: { id: number; name: string }[];
}

const STATUS = { active: "Ativa", suspended: "Suspensa", expired: "Expirada" } as const;

export default function AdminMember() {
  const { id } = useParams();
  const { me } = useSession();
  const [d, setD] = useState<Detail | null>(null);
  const [cat, setCat] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addCommunity, setAddCommunity] = useState(0);
  const [badge, setBadge] = useState({ badge_id: 0, community_id: 0 });

  const load = useCallback(() => api<Detail>(`/admin/members/${id}`).then(setD).catch((e) => setError(e.message)), [id]);
  useEffect(() => {
    load();
    api<Catalog>("/admin/catalog").then(setCat);
  }, [load]);

  const run = async (fn: () => Promise<unknown>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!d || !cat) return <div className="page"><AdminNav /><Alert error={error} /><Loading /></div>;
  const p = d.profile;
  const notIn = cat.communities.filter((c) => !d.memberships.some((m) => m.community_id === c.id));
  const self = me?.user.id === d.user.id;

  return (
    <div className="page">
      <AdminNav />
      <div className="profile-head">
        <Avatar name={p.full_name} url={p.photo_url} large />
        <div>
          <Title>{p.full_name}</Title>
          <div className="profile-meta">{d.user.email}</div>
          <div className="profile-meta">Conta criada em {formatDate(d.user.created_at)} · último acesso {formatDate(d.user.last_login_at)}</div>
          <div className="chips" style={{ marginTop: 10 }}>
            <span className={`pill ${d.user.status}`}>Conta {d.user.status === "active" ? "ativa" : "suspensa"}</span>
            {d.user.is_admin === 1 && <span className="pill">Administração</span>}
            {p.hidden_by_admin && <span className="pill suspended">Oculto pela administração</span>}
            {p.visibility === "hidden" && <span className="pill">Oculto pela pessoa</span>}
          </div>
        </div>
      </div>
      <Alert error={error} />

      <SectionLabel n="01">Comunidades</SectionLabel>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Comunidade</th><th>Situação</th><th>Desde</th><th>Renovação</th><th></th></tr></thead>
          <tbody>
            {d.memberships.length === 0 && <tr><td colSpan={5} className="hint">Não participa de nenhuma comunidade.</td></tr>}
            {d.memberships.map((m) => (
              <tr key={m.community_id}>
                <td><strong>{m.name}</strong></td>
                <td>
                  <select
                    value={m.status}
                    aria-label={`Situação em ${m.name}`}
                    onChange={(e) => run(() => api(`/admin/members/${d.user.id}/memberships/${m.community_id}`, { method: "PUT", body: { status: e.target.value, renews_at: m.renews_at } }))}
                  >
                    {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td>{formatDate(m.joined_at)}</td>
                <td>
                  <input
                    type="date"
                    aria-label={`Renovação em ${m.name}`}
                    value={m.renews_at ?? ""}
                    onChange={(e) => run(() => api(`/admin/members/${d.user.id}/memberships/${m.community_id}`, { method: "PUT", body: { status: m.status, renews_at: e.target.value || null } }))}
                  />
                </td>
                <td>
                  <button className="button button-small button-danger" onClick={() => run(() => api(`/admin/members/${d.user.id}/memberships/${m.community_id}`, { method: "DELETE" }), `Remover ${p.full_name} de ${m.name}? Os selos desta comunidade também serão removidos.`)}>
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {notIn.length > 0 && (
        <div className="actions">
          <select value={addCommunity} onChange={(e) => setAddCommunity(Number(e.target.value))} style={{ maxWidth: 320 }} aria-label="Comunidade para associar">
            <option value={0}>Associar a outra comunidade…</option>
            {notIn.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="button button-small" disabled={!addCommunity} onClick={() => run(async () => { await api(`/admin/members/${d.user.id}/memberships/${addCommunity}`, { method: "PUT", body: { status: "active" } }); setAddCommunity(0); })}>
            Associar
          </button>
        </div>
      )}

      <SectionLabel n="02">Selos</SectionLabel>
      <div className="chips" style={{ marginBottom: 16 }}>
        {d.badges.length === 0 && <span className="hint">Nenhum selo.</span>}
        {d.badges.map((b) => (
          <span key={`${b.badge_id}-${b.community_id}`} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <BadgePill name={`${b.name} · ${b.community_name}`} />
            <button className="button button-small button-danger" style={{ padding: "4px 8px" }} aria-label={`Remover selo ${b.name} de ${b.community_name}`} onClick={() => run(() => api(`/admin/members/${d.user.id}/badges`, { method: "DELETE", body: { badge_id: b.badge_id, community_id: b.community_id } }))}>×</button>
          </span>
        ))}
      </div>
      {d.memberships.length > 0 && (
        <div className="actions" style={{ marginTop: 0 }}>
          <select value={badge.badge_id} onChange={(e) => setBadge({ ...badge, badge_id: Number(e.target.value) })} style={{ maxWidth: 240 }} aria-label="Selo">
            <option value={0}>Selo…</option>
            {cat.badges.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={badge.community_id} onChange={(e) => setBadge({ ...badge, community_id: Number(e.target.value) })} style={{ maxWidth: 300 }} aria-label="Comunidade do selo">
            <option value={0}>Na comunidade…</option>
            {d.memberships.map((m) => <option key={m.community_id} value={m.community_id}>{m.name}</option>)}
          </select>
          <button className="button button-small" disabled={!badge.badge_id || !badge.community_id} onClick={() => run(async () => { await api(`/admin/members/${d.user.id}/badges`, { body: badge }); setBadge({ badge_id: 0, community_id: 0 }); })}>
            Conceder selo
          </button>
        </div>
      )}

      <SectionLabel n="03">Moderação</SectionLabel>
      <div className="actions" style={{ marginTop: 0 }}>
        <Link className="button button-small button-ghost" to={`/membros/${d.user.id}`}>Ver perfil</Link>
        <button className="button button-small button-ghost" onClick={() => run(() => api(`/admin/members/${d.user.id}/profile-visibility`, { body: { hidden_by_admin: !p.hidden_by_admin } }))}>
          {p.hidden_by_admin ? "Voltar a mostrar o perfil" : "Ocultar perfil dos membros"}
        </button>
        {!self && (
          <button
            className="button button-small button-danger"
            onClick={() => run(() => api(`/admin/members/${d.user.id}/status`, { body: { status: d.user.status === "active" ? "suspended" : "active" } }), d.user.status === "active" ? `Suspender a conta de ${p.full_name}? A pessoa perde o acesso imediatamente.` : undefined)}
          >
            {d.user.status === "active" ? "Suspender conta" : "Reativar conta"}
          </button>
        )}
      </div>
    </div>
  );
}
