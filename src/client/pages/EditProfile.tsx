import { useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, resizeImage, type Me, type Profile, type Tags } from "../api";
import { Alert, Avatar, Eyebrow, SectionLabel, TagInput, Title } from "../components/ui";
import { useSession } from "../session";

type Form = Omit<Profile, "id" | "email" | "photo_url" | "communities" | "badges" | "hidden_by_admin"> & { show_email: boolean; visibility: "members" | "hidden" };

function toForm(p: Profile): Form {
  return {
    full_name: p.full_name, headline: p.headline, organization: p.organization, city: p.city, bio: p.bio,
    can_help_text: p.can_help_text, looking_for_text: p.looking_for_text, linkedin_url: p.linkedin_url, website_url: p.website_url,
    show_email: !!p.show_email, visibility: p.visibility ?? "members", tags: p.tags,
  };
}

export default function EditProfile() {
  const { me, setMe } = useSession();
  const [params] = useSearchParams();
  const [form, setForm] = useState<Form>(() => toForm(me!.profile));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!me) return null;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: v }));
  };
  const setTags = (k: keyof Tags, v: string[]) => set("tags", { ...form.tags, [k]: v });
  const updateProfile = (profile: Profile) => setMe({ ...(me as Me), profile });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api<{ profile: Profile }>("/me/profile", { method: "PUT", body: form });
      updateProfile(r.profile);
      setSaved(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError((err as Error).message);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setBusy(false);
    }
  };

  const uploadPhoto = async (file: File) => {
    setError(null);
    setPhotoBusy(true);
    try {
      if (!file.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem.");
      const blob = await resizeImage(file);
      const fd = new FormData();
      fd.append("photo", blob, "foto.jpg");
      const r = await api<{ profile: Profile }>("/me/photo", { form: fd });
      updateProfile(r.profile);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const removePhoto = async () => {
    const r = await api<{ profile: Profile }>("/me/photo", { method: "DELETE" });
    updateProfile(r.profile);
  };

  const p = me.profile;
  return (
    <div className="page page-narrow">
      <Eyebrow>Meu perfil</Eyebrow>
      <Title>{params.get("boas-vindas") ? "Complete seu perfil" : "Editar perfil"}</Title>
      {params.get("boas-vindas") && <div className="notice">Acesso ativado. Complete seu perfil para que os outros membros conheçam você.</div>}
      {saved && <div className="notice">Perfil salvo.</div>}
      <Alert error={error} />

      <div className="profile-head" style={{ marginTop: 24 }}>
        <Avatar name={form.full_name || p.full_name} url={p.photo_url} large />
        <div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])} />
          <div className="actions" style={{ marginTop: 0 }}>
            <button type="button" className="button button-small" disabled={photoBusy} onClick={() => fileRef.current?.click()}>
              {photoBusy ? "Enviando…" : p.photo_url ? "Trocar foto" : "Enviar foto"}
            </button>
            {p.photo_url && (
              <button type="button" className="button button-small button-ghost" onClick={removePhoto}>
                Remover
              </button>
            )}
          </div>
          <p className="hint" style={{ marginTop: 8 }}>JPG, PNG ou WebP. A imagem é reduzida automaticamente antes do envio.</p>
        </div>
      </div>

      <form onSubmit={save}>
        <SectionLabel n="01">Apresentação</SectionLabel>
        <div className="field">
          <label htmlFor="full_name">Nome</label>
          <input id="full_name" type="text" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} maxLength={120} required />
        </div>
        <div className="field">
          <label htmlFor="headline">Atuação</label>
          <input id="headline" type="text" value={form.headline} onChange={(e) => set("headline", e.target.value)} maxLength={140} placeholder="Ex.: Fundadora e diretora clínica" />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="organization">Organização</label>
            <input id="organization" type="text" value={form.organization} onChange={(e) => set("organization", e.target.value)} maxLength={120} />
          </div>
          <div className="field">
            <label htmlFor="city">Cidade</label>
            <input id="city" type="text" value={form.city} onChange={(e) => set("city", e.target.value)} maxLength={80} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="bio">Sobre você</label>
          <textarea id="bio" value={form.bio} onChange={(e) => set("bio", e.target.value)} maxLength={1500} />
          <small>{form.bio.length}/1500</small>
        </div>
        <div className="field">
          <span className="field-label">Áreas de atuação</span>
          <TagInput value={form.tags.expertise} onChange={(v) => setTags("expertise", v)} placeholder="Digite e pressione Enter" />
        </div>

        <SectionLabel n="02">Posso ajudar com</SectionLabel>
        <div className="field">
          <span className="field-label">Temas</span>
          <TagInput variant="help" value={form.tags.can_help} onChange={(v) => setTags("can_help", v)} placeholder="Ex.: gestão de clínicas, captação de recursos" />
        </div>
        <div className="field">
          <label htmlFor="can_help_text">Detalhes (opcional)</label>
          <textarea id="can_help_text" value={form.can_help_text} onChange={(e) => set("can_help_text", e.target.value)} maxLength={600} style={{ minHeight: 80 }} />
        </div>

        <SectionLabel n="03">Estou procurando</SectionLabel>
        <div className="field">
          <span className="field-label">Temas</span>
          <TagInput variant="look" value={form.tags.looking_for} onChange={(v) => setTags("looking_for", v)} placeholder="Ex.: parcerias, mentoria, investidores" />
        </div>
        <div className="field">
          <label htmlFor="looking_for_text">Detalhes (opcional)</label>
          <textarea id="looking_for_text" value={form.looking_for_text} onChange={(e) => set("looking_for_text", e.target.value)} maxLength={600} style={{ minHeight: 80 }} />
        </div>

        <SectionLabel n="04">Contato e privacidade</SectionLabel>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="linkedin_url">LinkedIn</label>
            <input id="linkedin_url" type="url" value={form.linkedin_url} onChange={(e) => set("linkedin_url", e.target.value)} placeholder="https://www.linkedin.com/in/…" />
          </div>
          <div className="field">
            <label htmlFor="website_url">Site</label>
            <input id="website_url" type="url" value={form.website_url} onChange={(e) => set("website_url", e.target.value)} placeholder="https://…" />
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={form.show_email} onChange={(e) => set("show_email", e.target.checked)} />
          <span>Mostrar meu e-mail ({me.user.email}) para os membros das minhas comunidades.</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={form.visibility === "hidden"} onChange={(e) => set("visibility", e.target.checked ? "hidden" : "members")} />
          <span>Ocultar meu perfil dos outros membros por enquanto. A administração continua vendo.</span>
        </label>
        <p className="hint">Seu perfil só é visível para quem participa de pelo menos uma comunidade em comum com você. Ele nunca é público na internet.</p>

        <div className="actions">
          <button className="button button-gradient" disabled={busy}>
            {busy ? "Salvando…" : "Salvar perfil"} <span>→</span>
          </button>
          <Link className="text-link" to={`/membros/${me.user.id}`}>
            Ver como os membros veem <span>→</span>
          </Link>
        </div>
      </form>

      <ChangePassword />
    </div>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMsg(null);
    try {
      await api("/me/password", { body: { current_password: current, new_password: next } });
      setMsg("Senha alterada. As sessões em outros dispositivos foram encerradas.");
      setCurrent("");
      setNext("");
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <form onSubmit={submit}>
      <SectionLabel n="05">Senha</SectionLabel>
      {msg && <div className="notice">{msg}</div>}
      <Alert error={error} />
      <div className="grid-2">
        <div className="field">
          <label htmlFor="cur">Senha atual</label>
          <input id="cur" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        </div>
        <div className="field">
          <label htmlFor="new">Nova senha</label>
          <input id="new" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={10} required />
          <small>Pelo menos 10 caracteres.</small>
        </div>
      </div>
      <button className="button button-ghost">Trocar senha</button>
    </form>
  );
}
