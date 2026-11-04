import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { api, createUser, DUMMY, latestEmail, login, sessionCookie, tokenFrom } from "./helpers";

async function invite(adminCookie: string, email: string, community_ids = [1, 4]) {
  return api("/api/admin/invitations", { cookie: adminCookie, body: { email, full_name: "Ana Convidada", community_ids } });
}

describe("convites", () => {
  it("fluxo completo: convite → e-mail → aceite → conta com as comunidades certas", async () => {
    const admin = await createUser({ admin: true });
    const adminCookie = await login(admin.email);
    const r = await invite(adminCookie, "ana@exemplo.com");
    expect(r.status).toBe(200);
    expect(r.json.email_sent).toBe(true);

    const mail = await latestEmail("ana@exemplo.com");
    expect(mail!.text).toContain("Líderes da Estética");
    expect(mail!.text).toContain("Líderes em IA");
    const token = tokenFrom(mail!.text);

    // Só o hash do token fica no banco.
    const stored = await env.DB.prepare("SELECT token_hash FROM invitations WHERE email = 'ana@exemplo.com'").first<{ token_hash: string }>();
    expect(stored!.token_hash).not.toBe(token);

    const look = await api("/api/auth/invite/lookup", { body: { token } });
    expect(look.json).toEqual({ email: "ana@exemplo.com", full_name: "Ana Convidada", communities: ["Líderes da Estética", "Líderes em IA"] });

    const acc = await api("/api/auth/invite/accept", { body: { token, full_name: "Ana Souza", password: "senha-da-ana-123", accept_terms: true, turnstileToken: DUMMY } });
    expect(acc.status).toBe(200);
    const me = await api("/api/me", { cookie: sessionCookie(acc.headers) });
    expect(me.json.user.is_admin).toBe(false);
    expect(me.json.profile.full_name).toBe("Ana Souza");
    expect(me.json.profile.communities.map((c: any) => c.slug)).toEqual(["lideres-da-estetica", "lideres-em-ia"]);

    // O mesmo link não pode ser usado de novo.
    const again = await api("/api/auth/invite/accept", { body: { token, full_name: "Outra", password: "outra-senha-123", accept_terms: true, turnstileToken: DUMMY } });
    expect(again.status).toBe(404);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'ana@exemplo.com'").first<{ n: number }>())!.n).toBe(1);
  });

  it("convite revogado, expirado ou reenviado (link antigo) não funciona", async () => {
    const admin = await createUser({ admin: true });
    const adminCookie = await login(admin.email);

    const r1 = await invite(adminCookie, "revogado@exemplo.com");
    const t1 = tokenFrom((await latestEmail("revogado@exemplo.com"))!.text);
    await api(`/api/admin/invitations/${r1.json.invitation_id}/revoke`, { method: "POST", cookie: adminCookie });
    expect((await api("/api/auth/invite/lookup", { body: { token: t1 } })).status).toBe(404);

    await invite(adminCookie, "expirado@exemplo.com");
    const t2 = tokenFrom((await latestEmail("expirado@exemplo.com"))!.text);
    await env.DB.prepare("UPDATE invitations SET expires_at = '2000-01-01T00:00:00.000Z' WHERE email = 'expirado@exemplo.com'").run();
    expect((await api("/api/auth/invite/lookup", { body: { token: t2 } })).status).toBe(404);

    const r3 = await invite(adminCookie, "reenvio@exemplo.com");
    const t3 = tokenFrom((await latestEmail("reenvio@exemplo.com"))!.text);
    await api(`/api/admin/invitations/${r3.json.invitation_id}/resend`, { method: "POST", cookie: adminCookie });
    const t3b = tokenFrom((await latestEmail("reenvio@exemplo.com"))!.text);
    expect((await api("/api/auth/invite/lookup", { body: { token: t3 } })).status).toBe(404);
    expect((await api("/api/auth/invite/lookup", { body: { token: t3b } })).status).toBe(200);
  });

  it("exige aceite da Política de Privacidade e senha forte", async () => {
    const admin = await createUser({ admin: true });
    await invite(await login(admin.email), "termos@exemplo.com");
    const token = tokenFrom((await latestEmail("termos@exemplo.com"))!.text);
    expect((await api("/api/auth/invite/accept", { body: { token, full_name: "T", password: "senha-boa-123", accept_terms: false, turnstileToken: DUMMY } })).status).toBe(400);
    expect((await api("/api/auth/invite/accept", { body: { token, full_name: "Teste", password: "curta", accept_terms: true, turnstileToken: DUMMY } })).status).toBe(400);
  });

  it("e-mail que já tem conta é associado direto, sem novo convite", async () => {
    const admin = await createUser({ admin: true });
    const u = await createUser({ communities: [1] });
    const r = await invite(await login(admin.email), u.email, [2]);
    expect(r.json.existing_user).toBe(true);
    const { results } = await env.DB.prepare("SELECT community_id FROM memberships WHERE user_id = ? ORDER BY community_id").bind(u.id).all();
    expect(results.map((x: any) => x.community_id)).toEqual([1, 2]);
  });

  it("só a administração cria convites; não há cadastro público", async () => {
    const member = await createUser({ communities: [1] });
    const cookie = await login(member.email);
    expect((await invite(cookie, "x@exemplo.com")).status).toBe(403);
    expect((await api("/api/admin/invitations", { body: { email: "x@exemplo.com", full_name: "X", community_ids: [1] } })).status).toBe(401);
    expect((await api("/api/auth/signup", { body: { email: "x@exemplo.com" } })).status).toBe(404);
    expect((await api("/api/auth/invite/accept", { body: { token: "a".repeat(43), full_name: "Hacker", password: "senha-qualquer-1", accept_terms: true, turnstileToken: DUMMY } })).status).toBe(404);
  });

  it("convite feito pela administração nunca concede acesso de administrador", async () => {
    const admin = await createUser({ admin: true });
    const r = await api("/api/admin/invitations", { cookie: await login(admin.email), body: { email: "y@exemplo.com", full_name: "Yara", community_ids: [1], grant_admin: 1 } });
    expect(r.status).toBe(200);
    const row = await env.DB.prepare("SELECT grant_admin FROM invitations WHERE email = 'y@exemplo.com'").first<{ grant_admin: number }>();
    expect(row!.grant_admin).toBe(0);
  });
});
