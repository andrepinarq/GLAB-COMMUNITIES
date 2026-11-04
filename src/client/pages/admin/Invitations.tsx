import { useEffect, useState } from "react";
import { api, formatDate } from "../../api";
import { Alert, Loading, Title } from "../../components/ui";
import AdminNav from "./AdminNav";

interface Invitation {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  invited_by_name: string | null;
  communities: string[];
  status: "pending" | "accepted" | "revoked" | "expired";
}

const LABEL = { pending: "Pendente", accepted: "Aceito", revoked: "Revogado", expired: "Expirado" };

export default function AdminInvitations() {
  const [list, setList] = useState<Invitation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ email: string; url: string; sent: boolean } | null>(null);
  const load = () => api<{ invitations: Invitation[] }>("/admin/invitations").then((r) => setList(r.invitations)).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const act = async (inv: Invitation, action: "revoke" | "resend") => {
    if (action === "revoke" && !confirm(`Revogar o convite de ${inv.email}?`)) return;
    setError(null);
    try {
      const r = await api<{ invite_url?: string; email_sent?: boolean }>(`/admin/invitations/${inv.id}/${action}`, { method: "POST" });
      if (action === "resend" && r.invite_url) setNotice({ email: inv.email, url: r.invite_url, sent: !!r.email_sent });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="page">
      <AdminNav />
      <Title>Convites enviados</Title>
      <Alert error={error} />
      {notice && (
        <div className="notice">
          {notice.sent ? `Novo convite enviado para ${notice.email}. O link anterior deixou de funcionar.` : `Novo link gerado para ${notice.email}, mas o e-mail falhou.`}
          <div className="copy-box">
            <input type="text" readOnly value={notice.url} onFocus={(e) => e.target.select()} aria-label="Link do convite" />
          </div>
        </div>
      )}
      {!list ? (
        <Loading />
      ) : list.length === 0 ? (
        <div className="empty">Nenhum convite ainda.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>Comunidades</th>
                <th>Situação</th>
                <th>Enviado</th>
                <th>Validade</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id}>
                  <td>
                    <strong>{i.full_name}</strong>
                    <br />
                    <span className="hint">{i.email}</span>
                  </td>
                  <td>{i.communities.map((c) => <span key={c} className="pill">{c}</span>)}</td>
                  <td><span className={`pill ${i.status}`}>{LABEL[i.status]}</span></td>
                  <td>{formatDate(i.created_at)}<br /><span className="hint">{i.invited_by_name ?? "—"}</span></td>
                  <td>{i.status === "accepted" ? `Aceito em ${formatDate(i.accepted_at)}` : formatDate(i.expires_at)}</td>
                  <td>
                    {(i.status === "pending" || i.status === "expired") && (
                      <div className="row-actions">
                        <button className="button button-small button-ghost" onClick={() => act(i, "resend")}>Reenviar</button>
                        {i.status === "pending" && <button className="button button-small button-danger" onClick={() => act(i, "revoke")}>Revogar</button>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
