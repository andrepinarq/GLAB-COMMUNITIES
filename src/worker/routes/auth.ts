import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { burnPasswordTime, hashPassword, needsRehash, randomId, randomToken, sha256Hex, verifyPassword } from "../lib/crypto";
import { resetMail, sendMail } from "../lib/email";
import { clientIp, fail, isoIn, nowIso, parseJson } from "../lib/http";
import { hitRateLimit, LIMITS } from "../lib/rate-limit";
import { createSession, destroyAllSessions, destroySession } from "../lib/session";
import { turnstileDevBypass, verifyTurnstile } from "../lib/turnstile";

export const emailSchema = z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(254);
export const passwordSchema = z
  .string()
  .min(10, "A senha precisa ter pelo menos 10 caracteres.")
  .max(128, "A senha pode ter no máximo 128 caracteres.");
const tokenSchema = z.string().min(20).max(100);

const auth = new Hono<AppEnv>();
const iterations = (env: AppEnv["Bindings"]) => Number(env.PASSWORD_PBKDF2_ITERATIONS);

auth.get("/config", (c) =>
  c.json({ turnstileSiteKey: c.env.TURNSTILE_SITE_KEY, turnstileDevBypass: turnstileDevBypass(c.env) }),
);

// ── Login ──────────────────────────────────────────────────────────────────
auth.post("/login", async (c) => {
  const body = await parseJson(c, z.object({ email: emailSchema, password: z.string().min(1).max(128), turnstileToken: z.string().optional() }));
  const ip = clientIp(c);
  await hitRateLimit(c.env.DB, `login:ip:${ip}`, LIMITS.loginPerIp.max, LIMITS.loginPerIp.window);
  await hitRateLimit(c.env.DB, `login:email:${body.email}`, LIMITS.loginPerEmail.max, LIMITS.loginPerEmail.window);
  await verifyTurnstile(c.env, body.turnstileToken, ip);

  const user = await c.env.DB.prepare("SELECT id, password_hash, status FROM users WHERE email = ?")
    .bind(body.email)
    .first<{ id: string; password_hash: string; status: string }>();

  // Mesma mensagem e mesmo custo de processamento para e-mail inexistente, senha errada ou conta suspensa.
  const invalid = (): never => fail(401, "E-mail ou senha incorretos.");
  if (!user) {
    await burnPasswordTime(body.password, iterations(c.env));
    return invalid();
  }
  const ok = await verifyPassword(body.password, user.password_hash);
  if (!ok || user.status !== "active") invalid();

  if (needsRehash(user.password_hash, iterations(c.env))) {
    await c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(body.password, iterations(c.env)), user.id).run();
  }
  await createSession(c, user.id);
  return c.json({ ok: true });
});

auth.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

// ── Recuperação de senha ───────────────────────────────────────────────────
auth.post("/forgot", async (c) => {
  const body = await parseJson(c, z.object({ email: emailSchema, turnstileToken: z.string().optional() }));
  const ip = clientIp(c);
  await hitRateLimit(c.env.DB, `forgot:ip:${ip}`, LIMITS.forgotPerIp.max, LIMITS.forgotPerIp.window);
  await verifyTurnstile(c.env, body.turnstileToken, ip);

  // A resposta é sempre a mesma, exista ou não a conta.
  const response = c.json({ ok: true, message: "Se houver uma conta com este e-mail, enviaremos um link para criar uma nova senha." });
  try {
    await hitRateLimit(c.env.DB, `forgot:email:${body.email}`, LIMITS.forgotPerEmail.max, LIMITS.forgotPerEmail.window);
  } catch {
    return response; // limite por e-mail atingido: não revela nada, apenas não envia de novo
  }
  const user = await c.env.DB.prepare("SELECT id FROM users WHERE email = ? AND status = 'active'").bind(body.email).first<{ id: string }>();
  if (user) {
    const token = randomToken();
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL").bind(nowIso(), user.id),
      c.env.DB.prepare("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)").bind(await sha256Hex(token), user.id, isoIn(3600)),
    ]);
    await sendMail(c.env, resetMail(c.env, body.email, token));
  }
  return response;
});

auth.post("/reset", async (c) => {
  const body = await parseJson(c, z.object({ token: tokenSchema, password: passwordSchema, turnstileToken: z.string().optional() }));
  const ip = clientIp(c);
  await hitRateLimit(c.env.DB, `token:ip:${ip}`, LIMITS.tokenPerIp.max, LIMITS.tokenPerIp.window);
  await verifyTurnstile(c.env, body.turnstileToken, ip);

  const hash = await sha256Hex(body.token);
  const reset = await c.env.DB.prepare(
    `SELECT r.user_id, u.email FROM password_resets r JOIN users u ON u.id = r.user_id
      WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > ? AND u.status = 'active'`,
  ).bind(hash, nowIso()).first<{ user_id: string; email: string }>();
  if (!reset) fail(400, "Este link é inválido ou expirou. Peça um novo.");
  if (body.password.toLowerCase() === reset.email.toLowerCase()) fail(400, "A senha não pode ser igual ao e-mail.");

  const pw = await hashPassword(body.password, iterations(c.env));
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE password_resets SET used_at = ? WHERE token_hash = ?").bind(nowIso(), hash),
    c.env.DB.prepare("UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?").bind(pw, nowIso(), reset.user_id),
  ]);
  await destroyAllSessions(c.env.DB, reset.user_id);
  await audit(c.env.DB, reset.user_id, "password.reset", "user", reset.user_id);
  await createSession(c, reset.user_id);
  return c.json({ ok: true });
});

// ── Convites ───────────────────────────────────────────────────────────────
async function findInvitation(db: D1Database, token: string) {
  return db
    .prepare(
      `SELECT id, email, full_name, grant_admin FROM invitations
        WHERE token_hash = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
    )
    .bind(await sha256Hex(token), nowIso())
    .first<{ id: string; email: string; full_name: string; grant_admin: number }>();
}

auth.post("/invite/lookup", async (c) => {
  const body = await parseJson(c, z.object({ token: tokenSchema }));
  await hitRateLimit(c.env.DB, `token:ip:${clientIp(c)}`, LIMITS.tokenPerIp.max, LIMITS.tokenPerIp.window);
  const inv = await findInvitation(c.env.DB, body.token);
  if (!inv) fail(404, "Este convite é inválido, já foi usado ou expirou.");
  const { results } = await c.env.DB.prepare(
    `SELECT c.name FROM invitation_communities ic JOIN communities c ON c.id = ic.community_id
      WHERE ic.invitation_id = ? ORDER BY c.sort_order`,
  ).bind(inv.id).all<{ name: string }>();
  return c.json({ email: inv.email, full_name: inv.full_name, communities: results.map((r) => r.name) });
});

auth.post("/invite/accept", async (c) => {
  const body = await parseJson(
    c,
    z.object({
      token: tokenSchema,
      full_name: z.string().trim().min(2, "Informe seu nome.").max(120),
      password: passwordSchema,
      accept_terms: z.literal(true, { errorMap: () => ({ message: "É preciso aceitar a Política de Privacidade." }) }),
      turnstileToken: z.string().optional(),
    }),
  );
  const ip = clientIp(c);
  await hitRateLimit(c.env.DB, `token:ip:${ip}`, LIMITS.tokenPerIp.max, LIMITS.tokenPerIp.window);
  await verifyTurnstile(c.env, body.turnstileToken, ip);

  const inv = await findInvitation(c.env.DB, body.token);
  if (!inv) fail(404, "Este convite é inválido, já foi usado ou expirou.");
  if (body.password.toLowerCase() === inv.email.toLowerCase()) fail(400, "A senha não pode ser igual ao e-mail.");
  const existing = await c.env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(inv.email).first();
  if (existing) fail(409, "Já existe uma conta com este e-mail. Entre com sua senha.");

  const userId = randomId();
  const pw = await hashPassword(body.password, iterations(c.env));
  const now = nowIso();
  // Tudo numa única transação: conta, perfil, participações e baixa do convite.
  // A condição "accepted_at IS NULL" impede o uso duplo do mesmo convite em pedidos simultâneos.
  const results = await c.env.DB.batch([
    c.env.DB.prepare("UPDATE invitations SET accepted_at = ?, accepted_user_id = NULL WHERE id = ? AND accepted_at IS NULL").bind(now, inv.id),
    c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, is_admin)
       SELECT ?, ?, ?, ? WHERE changes() = 1`,
    ).bind(userId, inv.email, pw, inv.grant_admin),
    c.env.DB.prepare("INSERT INTO profiles (user_id, full_name) SELECT ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)").bind(userId, body.full_name, userId),
    c.env.DB.prepare(
      `INSERT INTO memberships (user_id, community_id, added_by)
       SELECT ?, community_id, (SELECT invited_by FROM invitations WHERE id = ?) FROM invitation_communities
        WHERE invitation_id = ? AND EXISTS (SELECT 1 FROM users WHERE id = ?)`,
    ).bind(userId, inv.id, inv.id, userId),
    c.env.DB.prepare("UPDATE invitations SET accepted_user_id = ? WHERE id = ? AND EXISTS (SELECT 1 FROM users WHERE id = ?)").bind(userId, inv.id, userId),
  ]);
  if ((results[1].meta.changes ?? 0) !== 1) fail(409, "Este convite já foi usado.");

  await audit(c.env.DB, userId, "invite.accept", "invitation", inv.id);
  await createSession(c, userId);
  return c.json({ ok: true });
});

export default auth;
