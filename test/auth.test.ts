import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/worker/lib/crypto";
import { api, createUser, DUMMY, latestEmail, login, PASSWORD, sessionCookie, tokenFrom } from "./helpers";

describe("senhas", () => {
  it("usa PBKDF2-SHA256 com 600.000 iterações e sal aleatório", async () => {
    const a = await hashPassword("uma senha qualquer", 600000);
    const b = await hashPassword("uma senha qualquer", 600000);
    expect(a.startsWith("pbkdf2-sha256$600000$")).toBe(true);
    expect(a).not.toBe(b); // sal diferente a cada vez
    expect(await verifyPassword("uma senha qualquer", a)).toBe(true);
    expect(await verifyPassword("outra senha", a)).toBe(false);
    expect(await verifyPassword("uma senha qualquer", "formato-invalido")).toBe(false);
  });

  it("nunca guarda a senha em texto no banco", async () => {
    const u = await createUser();
    const row = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(u.id).first<{ password_hash: string }>();
    expect(row!.password_hash).not.toContain(PASSWORD);
  });
});

describe("login", () => {
  it("cria sessão com cookie HttpOnly, Secure, SameSite=Lax e prefixo __Host-", async () => {
    const u = await createUser();
    const r = await api("/api/auth/login", { body: { email: u.email, password: PASSWORD, turnstileToken: DUMMY } });
    expect(r.status).toBe(200);
    const sc = r.headers.get("Set-Cookie")!;
    expect(sc).toMatch(/^__Host-gl_session=/);
    expect(sc).toMatch(/HttpOnly/i);
    expect(sc).toMatch(/Secure/i);
    expect(sc).toMatch(/SameSite=Lax/i);
    expect(sc).toMatch(/Path=\//);
    expect(sc).not.toMatch(/Domain=/i);
    const me = await api("/api/me", { cookie: sessionCookie(r.headers) });
    expect(me.status).toBe(200);
    expect(me.json.user.email).toBe(u.email);
  });

  it("guarda no banco só o hash do token de sessão", async () => {
    const u = await createUser();
    const cookie = await login(u.email);
    const token = cookie.split("=")[1];
    const row = await env.DB.prepare("SELECT id FROM sessions WHERE user_id = ?").bind(u.id).first<{ id: string }>();
    expect(row!.id).not.toBe(token);
    expect(row!.id).toMatch(/^[0-9a-f]{64}$/);
  });

  it("responde igual para e-mail inexistente e senha errada", async () => {
    const u = await createUser();
    const wrong = await api("/api/auth/login", { body: { email: u.email, password: "senha-errada-123", turnstileToken: DUMMY } });
    const unknown = await api("/api/auth/login", { body: { email: "ninguem@exemplo.com", password: "senha-errada-123", turnstileToken: DUMMY } });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.json.error).toBe(unknown.json.error);
  });

  it("exige o Turnstile", async () => {
    const u = await createUser();
    const none = await api("/api/auth/login", { body: { email: u.email, password: PASSWORD } });
    const bad = await api("/api/auth/login", { body: { email: u.email, password: PASSWORD, turnstileToken: "token-falso" } });
    expect(none.status).toBe(400);
    expect(bad.status).toBe(400);
  });

  it("bloqueia depois de 8 tentativas por e-mail em 15 minutos", async () => {
    const u = await createUser();
    const statuses: number[] = [];
    for (let i = 0; i < 9; i++) {
      statuses.push((await api("/api/auth/login", { body: { email: u.email, password: "errada-errada", turnstileToken: DUMMY } })).status);
    }
    expect(statuses.slice(0, 8).every((s) => s === 401)).toBe(true);
    expect(statuses[8]).toBe(429);
    // Nem a senha certa passa enquanto o bloqueio vale.
    const ok = await api("/api/auth/login", { body: { email: u.email, password: PASSWORD, turnstileToken: DUMMY } });
    expect(ok.status).toBe(429);
  });

  it("conta suspensa não entra e perde as sessões abertas", async () => {
    const admin = await createUser({ admin: true });
    const u = await createUser();
    const userCookie = await login(u.email);
    const adminCookie = await login(admin.email);
    expect((await api(`/api/admin/members/${u.id}/status`, { cookie: adminCookie, body: { status: "suspended" } })).status).toBe(200);
    expect((await api("/api/me", { cookie: userCookie })).status).toBe(401);
    expect((await api("/api/auth/login", { body: { email: u.email, password: PASSWORD, turnstileToken: DUMMY } })).status).toBe(401);
  });

  it("logout encerra a sessão no servidor", async () => {
    const u = await createUser();
    const cookie = await login(u.email);
    await api("/api/auth/logout", { method: "POST", cookie });
    expect((await api("/api/me", { cookie })).status).toBe(401);
  });

  it("rejeita cookie forjado", async () => {
    expect((await api("/api/me", { cookie: "__Host-gl_session=inventado" })).status).toBe(401);
  });
});

describe("proteção contra CSRF", () => {
  it("recusa pedidos que alteram dados sem Origin ou vindos de outro site", async () => {
    const u = await createUser();
    const cookie = await login(u.email);
    expect((await api("/api/auth/logout", { method: "POST", cookie, origin: null })).status).toBe(403);
    expect((await api("/api/auth/logout", { method: "POST", cookie, origin: "https://site-malicioso.com" })).status).toBe(403);
    expect((await api("/api/me", { cookie })).status).toBe(200); // sessão continua válida
  });
});

describe("recuperação de senha", () => {
  it("não revela se o e-mail existe", async () => {
    const u = await createUser();
    const a = await api("/api/auth/forgot", { body: { email: u.email, turnstileToken: DUMMY } });
    const b = await api("/api/auth/forgot", { body: { email: "nao-existe@exemplo.com", turnstileToken: DUMMY } });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.json).toEqual(b.json);
    expect(await latestEmail("nao-existe@exemplo.com")).toBeNull();
  });

  it("link de uso único: troca a senha e encerra as sessões antigas", async () => {
    const u = await createUser();
    const oldSession = await login(u.email);
    await api("/api/auth/forgot", { body: { email: u.email, turnstileToken: DUMMY } });
    const mail = await latestEmail(u.email);
    const token = tokenFrom(mail!.text);

    const r = await api("/api/auth/reset", { body: { token, password: "nova-senha-segura", turnstileToken: DUMMY } });
    expect(r.status).toBe(200);
    expect((await api("/api/me", { cookie: oldSession })).status).toBe(401);
    expect((await api("/api/auth/reset", { body: { token, password: "outra-senha-segura", turnstileToken: DUMMY } })).status).toBe(400);
    await login(u.email, "nova-senha-segura");
    await expect(login(u.email)).rejects.toThrow();
  });

  it("um novo pedido invalida o link anterior", async () => {
    const u = await createUser();
    await api("/api/auth/forgot", { body: { email: u.email, turnstileToken: DUMMY } });
    const first = tokenFrom((await latestEmail(u.email))!.text);
    await api("/api/auth/forgot", { body: { email: u.email, turnstileToken: DUMMY } });
    expect((await api("/api/auth/reset", { body: { token: first, password: "nova-senha-segura", turnstileToken: DUMMY } })).status).toBe(400);
  });

  it("link expirado não funciona", async () => {
    const u = await createUser();
    await api("/api/auth/forgot", { body: { email: u.email, turnstileToken: DUMMY } });
    const token = tokenFrom((await latestEmail(u.email))!.text);
    await env.DB.prepare("UPDATE password_resets SET expires_at = '2000-01-01T00:00:00.000Z'").run();
    expect((await api("/api/auth/reset", { body: { token, password: "nova-senha-segura", turnstileToken: DUMMY } })).status).toBe(400);
  });

  it("exige senha com pelo menos 10 caracteres", async () => {
    const u = await createUser();
    await api("/api/auth/forgot", { body: { email: u.email, turnstileToken: DUMMY } });
    const token = tokenFrom((await latestEmail(u.email))!.text);
    const r = await api("/api/auth/reset", { body: { token, password: "curta", turnstileToken: DUMMY } });
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("10 caracteres");
  });
});
