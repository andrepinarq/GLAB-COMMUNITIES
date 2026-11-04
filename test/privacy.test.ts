import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { runMaintenance } from "../src/worker/index";
import { api, createUser, login } from "./helpers";

// Comunidades: 1 Estética, 2 Arquitetura, 3 Imobiliário, 4 IA.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function photoForm(bytes: Uint8Array, type = "image/png") {
  const f = new FormData();
  f.append("photo", new File([bytes], "foto.png", { type }));
  return f;
}

describe("regras de acesso entre membros", () => {
  it("vê o perfil só de quem tem comunidade ativa em comum", async () => {
    const a = await createUser({ communities: [1] });
    const b = await createUser({ communities: [1, 2] });
    const c = await createUser({ communities: [2] });
    const cookie = await login(a.email);

    const pb = await api(`/api/members/${b.id}`, { cookie });
    expect(pb.status).toBe(200);
    // De B, A só enxerga a comunidade em comum (1), nunca a 2.
    expect(pb.json.profile.communities.map((x: any) => x.id)).toEqual([1]);
    expect(pb.json.profile.email).toBeNull();
    expect(pb.json.profile.visibility).toBeUndefined();

    expect((await api(`/api/members/${c.id}`, { cookie })).status).toBe(404);
    expect((await api(`/api/members/inexistente`, { cookie })).status).toBe(404);
  });

  it("não lista membros de comunidade da qual não participa", async () => {
    const a = await createUser({ communities: [1] });
    const cookie = await login(a.email);
    expect((await api("/api/communities/lideres-da-estetica/members", { cookie })).status).toBe(200);
    expect((await api("/api/communities/lideres-da-arquitetura/members", { cookie })).status).toBe(404);
    const mine = await api("/api/communities", { cookie });
    expect(mine.json.communities.map((x: any) => x.slug)).toEqual(["lideres-da-estetica"]);
  });

  it("perfil oculto (pela pessoa ou pela administração) some para os outros membros", async () => {
    const a = await createUser({ communities: [1] });
    const b = await createUser({ communities: [1] });
    const cookie = await login(a.email);
    await env.DB.prepare("UPDATE profiles SET visibility = 'hidden' WHERE user_id = ?").bind(b.id).run();
    expect((await api(`/api/members/${b.id}`, { cookie })).status).toBe(404);
    const list = await api("/api/communities/lideres-da-estetica/members", { cookie });
    expect(list.json.members.map((m: any) => m.id)).not.toContain(b.id);

    await env.DB.prepare("UPDATE profiles SET visibility = 'members', hidden_by_admin = 1 WHERE user_id = ?").bind(b.id).run();
    expect((await api(`/api/members/${b.id}`, { cookie })).status).toBe(404);
  });

  it("participação suspensa ou expirada corta o acesso àquela comunidade", async () => {
    const a = await createUser({ communities: [1] });
    const b = await createUser({ communities: [1] });
    const cookie = await login(a.email);
    await env.DB.prepare("UPDATE memberships SET status = 'expired' WHERE user_id = ?").bind(a.id).run();
    expect((await api(`/api/members/${b.id}`, { cookie })).status).toBe(404);
    expect((await api("/api/communities/lideres-da-estetica/members", { cookie })).status).toBe(404);
  });

  it("e-mail só aparece quando a pessoa escolhe mostrar", async () => {
    const a = await createUser({ communities: [1] });
    const b = await createUser({ communities: [1] });
    const cookie = await login(a.email);
    await env.DB.prepare("UPDATE profiles SET show_email = 1 WHERE user_id = ?").bind(b.id).run();
    expect((await api(`/api/members/${b.id}`, { cookie })).json.profile.email).toBe(b.email);
  });

  it("selos de outras comunidades não aparecem", async () => {
    const a = await createUser({ communities: [1] });
    const b = await createUser({ communities: [1, 2] });
    await env.DB.batch([
      env.DB.prepare("INSERT INTO member_badges (user_id, badge_id, community_id) VALUES (?, 1, 1)").bind(b.id),
      env.DB.prepare("INSERT INTO member_badges (user_id, badge_id, community_id) VALUES (?, 2, 2)").bind(b.id),
    ]);
    const p = await api(`/api/members/${b.id}`, { cookie: await login(a.email) });
    expect(p.json.profile.badges.map((x: any) => `${x.slug}@${x.community_id}`)).toEqual(["membro-fundador@1"]);
  });

  it("toda rota de dados exige sessão", async () => {
    for (const path of ["/api/me", "/api/communities", "/api/communities/lideres-em-ia/members", "/api/members/x", "/api/photos/x", "/api/admin/overview"]) {
      expect((await api(path)).status, path).toBe(401);
    }
  });
});

describe("perfil e tags", () => {
  const base = {
    full_name: "Ana Souza", headline: "Diretora", organization: "Clínica X", city: "Rio de Janeiro", bio: "Bio",
    can_help_text: "", looking_for_text: "", linkedin_url: "", website_url: "", show_email: false, visibility: "members",
  };

  it("salva perfil com tags nas três listas, normalizando duplicadas", async () => {
    const a = await createUser({ communities: [1] });
    const cookie = await login(a.email);
    const r = await api("/api/me/profile", {
      method: "PUT", cookie,
      body: { ...base, tags: { expertise: ["Gestão", "gestao", " Gestão "], can_help: ["Inteligência Artificial"], looking_for: ["Parcerias", "Investimento"] } },
    });
    expect(r.status).toBe(200);
    expect(r.json.profile.tags).toEqual({ expertise: ["Gestão"], can_help: ["Inteligência Artificial"], looking_for: ["Investimento", "Parcerias"] });
  });

  it("valida links e limites", async () => {
    const a = await createUser({ communities: [1] });
    const cookie = await login(a.email);
    const tags = { expertise: [], can_help: [], looking_for: [] };
    expect((await api("/api/me/profile", { method: "PUT", cookie, body: { ...base, tags, website_url: "javascript:alert(1)" } })).status).toBe(400);
    expect((await api("/api/me/profile", { method: "PUT", cookie, body: { ...base, tags, linkedin_url: "https://exemplo.com/eu" } })).status).toBe(400);
    expect((await api("/api/me/profile", { method: "PUT", cookie, body: { ...base, tags, bio: "x".repeat(1501) } })).status).toBe(400);
    expect((await api("/api/me/profile", { method: "PUT", cookie, body: { ...base, tags: { ...tags, expertise: Array.from({ length: 13 }, (_, i) => `tag ${i}`) } } })).status).toBe(400);
  });

  it("não deixa o membro mudar campos protegidos (admin, ocultação pela administração)", async () => {
    const a = await createUser({ communities: [1] });
    const cookie = await login(a.email);
    await api("/api/me/profile", { method: "PUT", cookie, body: { ...base, tags: { expertise: [], can_help: [], looking_for: [] }, is_admin: 1, hidden_by_admin: 0 } });
    const u = await env.DB.prepare("SELECT is_admin FROM users WHERE id = ?").bind(a.id).first<{ is_admin: number }>();
    expect(u!.is_admin).toBe(0);
  });
});

describe("fotos", () => {
  it("aceita imagem real, recusa outros arquivos e tamanho excessivo", async () => {
    const a = await createUser({ communities: [1] });
    const cookie = await login(a.email);
    const ok = await api("/api/me/photo", { cookie, form: photoForm(PNG) });
    expect(ok.status).toBe(200);
    expect(ok.json.profile.photo_url).toMatch(new RegExp(`^/api/photos/${a.id}\\?v=`));

    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    expect((await api("/api/me/photo", { cookie, form: photoForm(html, "image/png") })).status).toBe(415);
    const big = new Uint8Array(2 * 1024 * 1024 + 10);
    big.set(PNG);
    expect((await api("/api/me/photo", { cookie, form: photoForm(big) })).status).toBe(413);
  });

  it("foto só é entregue a quem pode ver o perfil, e a antiga é apagada na troca", async () => {
    const a = await createUser({ communities: [1] });
    const b = await createUser({ communities: [1] });
    const c = await createUser({ communities: [2] });
    const cookieA = await login(a.email);
    await api("/api/me/photo", { cookie: cookieA, form: photoForm(PNG) });
    const first = await env.DB.prepare("SELECT photo_key FROM profiles WHERE user_id = ?").bind(a.id).first<{ photo_key: string }>();

    const asB = await api(`/api/photos/${a.id}`, { cookie: await login(b.email) });
    expect(asB.status).toBe(200);
    expect(asB.headers.get("Content-Type")).toBe("image/png");
    expect(asB.headers.get("Cache-Control")).toContain("private");
    expect((await api(`/api/photos/${a.id}`, { cookie: await login(c.email) })).status).toBe(404);

    await api("/api/me/photo", { cookie: cookieA, form: photoForm(PNG) });
    expect(await env.PHOTOS.get(first!.photo_key)).toBeNull();
  });
});

describe("administração", () => {
  it("membro comum não acessa nenhuma rota de administração", async () => {
    const a = await createUser({ communities: [1] });
    const cookie = await login(a.email);
    for (const path of ["/api/admin/overview", "/api/admin/members", "/api/admin/invitations", "/api/admin/audit"]) {
      expect((await api(path, { cookie })).status, path).toBe(403);
    }
    expect((await api(`/api/admin/members/${a.id}/badges`, { cookie, body: { badge_id: 1, community_id: 1 } })).status).toBe(403);
  });

  it("concede e remove selos (só para quem participa da comunidade) e registra tudo", async () => {
    const admin = await createUser({ admin: true });
    const a = await createUser({ communities: [1] });
    const cookie = await login(admin.email);
    expect((await api(`/api/admin/members/${a.id}/badges`, { cookie, body: { badge_id: 2, community_id: 2 } })).status).toBe(400);
    expect((await api(`/api/admin/members/${a.id}/badges`, { cookie, body: { badge_id: 2, community_id: 1 } })).status).toBe(200);
    const detail = await api(`/api/admin/members/${a.id}`, { cookie });
    expect(detail.json.badges.map((b: any) => b.name)).toEqual(["Conselho Curador"]);
    const log = await api("/api/admin/audit", { cookie });
    expect(log.json.entries[0].action).toBe("badge.award");
  });

  it("associa a novas comunidades e remove (removendo também os selos daquela comunidade)", async () => {
    const admin = await createUser({ admin: true });
    const a = await createUser({ communities: [1] });
    const cookie = await login(admin.email);
    expect((await api(`/api/admin/members/${a.id}/memberships/3`, { method: "PUT", cookie, body: { status: "active" } })).status).toBe(200);
    await api(`/api/admin/members/${a.id}/badges`, { cookie, body: { badge_id: 1, community_id: 3 } });
    await api(`/api/admin/members/${a.id}/memberships/3`, { method: "DELETE", cookie });
    const detail = await api(`/api/admin/members/${a.id}`, { cookie });
    expect(detail.json.memberships.map((m: any) => m.community_id)).toEqual([1]);
    expect(detail.json.badges).toEqual([]);
  });

  it("administração não suspende a própria conta", async () => {
    const admin = await createUser({ admin: true });
    expect((await api(`/api/admin/members/${admin.id}/status`, { cookie: await login(admin.email), body: { status: "suspended" } })).status).toBe(400);
  });
});

describe("infraestrutura", () => {
  it("envia cabeçalhos de segurança e não guarda respostas em cache", async () => {
    const r = await api("/api/auth/config");
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(r.headers.get("X-Frame-Options")).toBe("DENY");
    expect(r.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });

  it("backup semanal grava o banco no R2 e limpa sessões vencidas", async () => {
    const a = await createUser();
    await env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES ('velha', ?, '2000-01-01T00:00:00.000Z')").bind(a.id).run();
    const key = await runMaintenance(env);
    const obj = await env.PHOTOS.get(key);
    const data = (await obj!.json()) as any;
    expect(data.tables.communities).toHaveLength(4);
    expect(data.tables.users.some((u: any) => u.id === a.id)).toBe(true);
    expect(await env.DB.prepare("SELECT 1 FROM sessions WHERE id = 'velha'").first()).toBeNull();
  });

  it("as quatro comunidades e os dois selos estão cadastrados", async () => {
    const { results } = await env.DB.prepare("SELECT slug FROM communities ORDER BY sort_order").all();
    expect(results.map((r: any) => r.slug)).toEqual(["lideres-da-estetica", "lideres-da-arquitetura", "lideres-do-mercado-imobiliario", "lideres-em-ia"]);
    const badges = await env.DB.prepare("SELECT name FROM badges ORDER BY id").all();
    expect(badges.results.map((r: any) => r.name)).toEqual(["Membro Fundador", "Conselho Curador"]);
  });
});
