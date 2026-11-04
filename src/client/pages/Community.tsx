import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { Alert, Avatar, BadgePill, Eyebrow, Loading, SectionLabel, Title } from "../components/ui";

interface MemberItem {
  id: string;
  full_name: string;
  headline: string;
  organization: string;
  city: string;
  photo_url: string | null;
  badges: string[];
}

export default function Community() {
  const { slug } = useParams();
  const [data, setData] = useState<{ community: { name: string; description: string }; members: MemberItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    api(`/communities/${slug}/members`).then(setData).catch((e) => setError(e.message));
  }, [slug]);

  if (error) return <div className="page"><Alert error={error} /></div>;
  if (!data) return <div className="page"><Loading /></div>;
  const needle = q.trim().toLowerCase();
  const list = needle ? data.members.filter((m) => [m.full_name, m.headline, m.organization, m.city].join(" ").toLowerCase().includes(needle)) : data.members;

  return (
    <div className="page">
      <Eyebrow>
        <Link to="/">Comunidades</Link>
      </Eyebrow>
      <Title>{data.community.name}</Title>
      <p className="lead">{data.community.description}</p>
      <SectionLabel n={String(data.members.length).padStart(2, "0")}>Membros</SectionLabel>
      <div className="field" style={{ maxWidth: 420 }}>
        <label htmlFor="q">Filtrar por nome, atuação ou cidade</label>
        <input id="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        <small>Busca completa e filtros por tags chegam na Fase 2 (diretório).</small>
      </div>
      {list.length === 0 ? (
        <div className="empty">Nenhum membro encontrado.</div>
      ) : (
        <div className="member-grid">
          {list.map((m) => (
            <Link key={m.id} to={`/membros/${m.id}`} className="member-card">
              <Avatar name={m.full_name} url={m.photo_url} />
              <div>
                <strong>{m.full_name}</strong>
                {m.headline && <span>{m.headline}</span>}
                {(m.organization || m.city) && <span>{[m.organization, m.city].filter(Boolean).join(" · ")}</span>}
                {m.badges.length > 0 && (
                  <div className="chips">
                    {m.badges.map((b) => (
                      <BadgePill key={b} name={b} />
                    ))}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
