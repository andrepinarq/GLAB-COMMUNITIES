import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Alert, Loading, SectionLabel, Title } from "../../components/ui";
import AdminNav from "./AdminNav";

interface Overview {
  active_members: number;
  pending_invitations: number;
  communities: { id: number; slug: string; name: string; status: string; active_members: number }[];
}

type InviteResult = { existing_user: true; user_id: string } | { existing_user: false; invite_url: string; email_sent: boolean };

export default function AdminOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => api<Overview>("/admin/overview").then(setData).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="page">
      <AdminNav />
      <Title>Visão geral</Title>
      <Alert error={error} />
      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="stats">
            <div className="stat"><b>{data.active_members}</b><span>contas ativas</span></div>
            <div className="stat"><b>{data.pending_invitations}</b><span>convites pendentes</span></div>
            {data.communities.map((c) => (
              <div className="stat" key={c.id}>
                <b>{c.active_members}</b>
                <span>{c.name}</span>
              </div>
            ))}
          </div>
          <InviteForm communities={data.communities} onDone={load} />
        </>
      )}
    </div>
  );
}

function InviteForm({ communities, onDone }: { communities: Overview["communities"]; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const r = await api<InviteResult>("/admin/invitations", { body: { email, full_name: name, community_ids: selected } });
      setResult(r);
      setEmail("");
      setName("");
      setSelected([]);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ maxWidth: 720 }}>
      <SectionLabel n="01">Convidar membro</SectionLabel>
      {result && result.existing_user && (
        <div className="notice">
          Esta pessoa já tinha conta e foi associada às comunidades escolhidas. <Link to={`/admin/membros/${result.user_id}`}>Ver membro</Link>
        </div>
      )}
      {result && !result.existing_user && (
        <div className="notice">
          {result.email_sent ? "Convite enviado por e-mail." : "Convite criado, mas o e-mail não pôde ser enviado. Envie o link abaixo por outro canal."}
          <div className="copy-box">
            <input type="text" readOnly value={result.invite_url} onFocus={(e) => e.target.select()} aria-label="Link do convite" />
            <button
              type="button"
              className="button button-small"
              onClick={() => navigator.clipboard.writeText(result.invite_url).then(() => setCopied(true))}
            >
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
          <small>O link é pessoal, vale por 7 dias e aparece só agora. Para gerar outro, use “Reenviar” em Convites enviados.</small>
        </div>
      )}
      <Alert error={error} />
      <div className="grid-2">
        <div className="field">
          <label htmlFor="inv-name">Nome</label>
          <input id="inv-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor="inv-email">E-mail</label>
          <input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
      </div>
      <div className="field">
        <span className="field-label">Comunidades</span>
        <div className="community-checks">
          {communities.map((c) => (
            <label key={c.id} className="check" style={{ margin: 0 }}>
              <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
              <span>{c.name}</span>
            </label>
          ))}
        </div>
      </div>
      <button className="button button-gradient" disabled={busy || selected.length === 0}>
        {busy ? "Enviando…" : "Enviar convite"} <span>→</span>
      </button>
    </form>
  );
}
