import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Alert, Loading, Title } from "../../components/ui";
import AdminNav from "./AdminNav";

interface Entry {
  id: number;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_name: string | null;
  details: string | null;
  created_at: string;
  actor_name: string | null;
}

const ACTIONS: Record<string, string> = {
  "invite.create": "Criou convite",
  "invite.resend": "Reenviou convite",
  "invite.revoke": "Revogou convite",
  "invite.accept": "Aceitou convite",
  "membership.add_existing": "Associou conta existente",
  "membership.set": "Alterou participação",
  "membership.remove": "Removeu de comunidade",
  "badge.award": "Concedeu selo",
  "badge.revoke": "Removeu selo",
  "user.suspend": "Suspendeu conta",
  "user.activate": "Reativou conta",
  "profile.hide": "Ocultou perfil",
  "profile.show": "Voltou a mostrar perfil",
  "password.reset": "Redefiniu a senha",
};

export default function AdminAudit() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ entries: Entry[] }>("/admin/audit").then((r) => setEntries(r.entries)).catch((e) => setError(e.message));
  }, []);
  return (
    <div className="page">
      <AdminNav />
      <Title>Registro de ações</Title>
      <p className="lead">Tudo o que é feito na administração, e eventos de conta importantes, fica registrado aqui.</p>
      <Alert error={error} />
      {!entries ? (
        <Loading />
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Sobre</th></tr></thead>
            <tbody>
              {entries.map((e) => {
                const details = e.details ? JSON.parse(e.details) : {};
                return (
                  <tr key={e.id}>
                    <td>{new Date(e.created_at).toLocaleString("pt-BR")}</td>
                    <td>{e.actor_name ?? "—"}</td>
                    <td>{ACTIONS[e.action] ?? e.action}</td>
                    <td>
                      {e.target_type === "user" && e.target_id ? <Link to={`/admin/membros/${e.target_id}`}>{e.target_name ?? "membro"}</Link> : details.email ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
