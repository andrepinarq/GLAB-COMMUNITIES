import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Alert, BadgePill, Eyebrow, Loading, SectionLabel, Title } from "../components/ui";
import { useSession } from "../session";

interface CommunityItem {
  id: number;
  slug: string;
  name: string;
  description: string;
  status: string;
  member_count: number;
  my_status: string | null;
}

function completeness(p: NonNullable<ReturnType<typeof useSession>["me"]>["profile"]) {
  const checks = [
    { ok: !!p.photo_url, label: "foto" },
    { ok: !!p.headline, label: "atuação" },
    { ok: !!p.bio, label: "bio" },
    { ok: p.tags.expertise.length > 0, label: "áreas de atuação" },
    { ok: p.tags.can_help.length > 0 || !!p.can_help_text, label: "“Posso ajudar com”" },
    { ok: p.tags.looking_for.length > 0 || !!p.looking_for_text, label: "“Estou procurando”" },
  ];
  return { pct: Math.round((checks.filter((c) => c.ok).length / checks.length) * 100), missing: checks.filter((c) => !c.ok).map((c) => c.label) };
}

export default function Home() {
  const { me } = useSession();
  const [communities, setCommunities] = useState<CommunityItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ communities: CommunityItem[] }>("/communities").then((r) => setCommunities(r.communities)).catch((e) => setError(e.message));
  }, []);
  if (!me) return null;
  const first = me.profile.full_name.split(" ")[0];
  const c = completeness(me.profile);

  return (
    <div className="page">
      <Eyebrow>Área de membros</Eyebrow>
      <Title>Olá, {first}</Title>
      <p className="lead">Conexões, conhecimento e oportunidades entre pessoas que ajudam a transformar seus setores.</p>

      {me.profile.badges.length > 0 && (
        <div className="chips" style={{ marginTop: 16 }}>
          {me.profile.badges.map((b) => (
            <span key={`${b.slug}-${b.community_id}`} title={b.community_name}>
              <BadgePill name={`${b.name} · ${b.community_name}`} />
            </span>
          ))}
        </div>
      )}

      {c.pct < 100 && (
        <div className="panel" style={{ marginTop: 32, maxWidth: 720 }}>
          <h3>Seu perfil está {c.pct}% completo</h3>
          <p className="hint">Falta: {c.missing.join(", ")}. Perfis completos ajudam os outros membros a encontrar você.</p>
          <Link className="text-link" to="/perfil">
            Completar perfil <span>→</span>
          </Link>
        </div>
      )}

      <SectionLabel n="01">{me.user.is_admin ? "Todas as comunidades" : "Minhas comunidades"}</SectionLabel>
      <Alert error={error} />
      {!communities ? (
        <Loading />
      ) : communities.length === 0 ? (
        <div className="empty">Você ainda não participa de nenhuma comunidade ativa.</div>
      ) : (
        <div className="community-grid">
          {communities.map((cm) => (
            <Link key={cm.id} to={`/comunidades/${cm.slug}`} className="community-card">
              <span className="status">
                <i />
                {cm.status === "active" ? "Ativa" : "Em formação"}
              </span>
              <h3>
                <small>GáveaLab |</small>
                {cm.name}
              </h3>
              <p>{cm.description}</p>
              <span className="meta">
                {cm.member_count} {cm.member_count === 1 ? "membro" : "membros"} →
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
