import type { Profile } from "../api";
import { Avatar, BadgePill, Eyebrow, Title } from "./ui";

export function ProfileView({ profile: p }: { profile: Profile }) {
  const meta = [p.organization, p.city].filter(Boolean).join(" · ");
  return (
    <>
      <div className="profile-head">
        <Avatar name={p.full_name} url={p.photo_url} large />
        <div>
          <Eyebrow>{p.communities.map((c) => c.name).join(" · ") || "Membro"}</Eyebrow>
          <Title>{p.full_name}</Title>
          {p.headline && <div className="profile-meta" style={{ fontWeight: 600, color: "var(--plum)" }}>{p.headline}</div>}
          {meta && <div className="profile-meta">{meta}</div>}
          {p.badges.length > 0 && (
            <div className="chips" style={{ marginTop: 12 }}>
              {p.badges.map((b) => (
                <BadgePill key={`${b.slug}-${b.community_id}`} name={p.communities.length > 1 ? `${b.name} · ${b.community_name}` : b.name} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="profile-cols">
        <div>
          {p.bio && (
            <div className="panel">
              <h3>Sobre</h3>
              <p style={{ whiteSpace: "pre-line" }}>{p.bio}</p>
            </div>
          )}
          {p.tags.expertise.length > 0 && (
            <div className="panel">
              <h3>Áreas de atuação</h3>
              <div className="chips">{p.tags.expertise.map((t) => <span key={t} className="chip">{t}</span>)}</div>
            </div>
          )}
          {(p.email || p.linkedin_url || p.website_url) && (
            <div className="panel">
              <h3>Contato</h3>
              {p.email && <p style={{ margin: "0 0 6px" }}><a href={`mailto:${p.email}`}>{p.email}</a></p>}
              {p.linkedin_url && <p style={{ margin: "0 0 6px" }}><a href={p.linkedin_url} target="_blank" rel="noreferrer noopener">LinkedIn ↗</a></p>}
              {p.website_url && <p style={{ margin: 0 }}><a href={p.website_url} target="_blank" rel="noreferrer noopener">Site ↗</a></p>}
            </div>
          )}
        </div>
        <div>
          <div className="panel help">
            <h3>Posso ajudar com</h3>
            {p.tags.can_help.length > 0 && <div className="chips" style={{ marginBottom: 10 }}>{p.tags.can_help.map((t) => <span key={t} className="chip chip-help">{t}</span>)}</div>}
            {p.can_help_text ? <p style={{ whiteSpace: "pre-line", margin: 0 }}>{p.can_help_text}</p> : !p.tags.can_help.length && <p className="hint" style={{ margin: 0 }}>Ainda não preenchido.</p>}
          </div>
          <div className="panel look">
            <h3>Estou procurando</h3>
            {p.tags.looking_for.length > 0 && <div className="chips" style={{ marginBottom: 10 }}>{p.tags.looking_for.map((t) => <span key={t} className="chip chip-look">{t}</span>)}</div>}
            {p.looking_for_text ? <p style={{ whiteSpace: "pre-line", margin: 0 }}>{p.looking_for_text}</p> : !p.tags.looking_for.length && <p className="hint" style={{ margin: 0 }}>Ainda não preenchido.</p>}
          </div>
        </div>
      </div>
    </>
  );
}
