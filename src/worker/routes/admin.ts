import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { randomId, randomToken, sha256Hex } from "../lib/crypto";
import { inviteMail, sendMail } from "../lib/email";
import { fail, isoIn, nowIso, parseJson } from "../lib/http";
import { buildProfile } from "../lib/profile";
import { destroyAllSessions } from "../lib/session";
import { emailSchema } from "./auth";

const admin = new Hono<AppEnv>();
const INVITE_TTL = 7 * 24 * 3600;

admin.get("/overview", async (c) => {
  const [members, pending, communities] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'active'"),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM invitations WHERE accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?").bind(nowIso()),
    c.env.DB.prepare(
      `SELECT c.id, c.slug, c.name, c.status,
              (SELECT COUNT(*) FROM memberships m WHERE m.community_id = c.id AND m.status = 'active') AS active_members
         FROM communities c ORDER BY c.sort_order`,
    ),
  ]);
  return c.json({
    active_members: (members.results[0] as { n: number }).n,
    pending_invitations: (pending.results[0] as { n: number }).n,
    communities: communities.results,
  });
});

admin.get("/catalog", async (c) => {
  const [communities, badges] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT id, slug, name, status FROM communities ORDER BY sort_order"),
    c.env.DB.prepare("SELECT id, slug, name FROM badges ORDER BY id"),
  ]);
  return c.json({ communities: communities.results, badges: badges.results });
});

async function communityNames(db: D1Database, ids: number[]): Promise<string[]> {
  if (!ids.length) return [];
  const { results } = await db.prepare(`SELECT name FROM communities WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY sort_order`).bind(...ids).all<{ name: string }>();
  return results.map((r) => r.name);
}

async function assertCommunities(db: D1Database, ids: number[]) {
  const names = await communityNames(db, ids);
  if (names.length !== new Set(ids).size) fail(400, "Comunidade inválida.");
}

// ── Convites ───────────────────────────────────────────────────────────────
admin.post("/invitations", async (c) => {
  const actor = c.get("user");
  const b = await parseJson(
    c,
    z.object({
      email: emailSchema,
      full_name: z.string().trim().min(2, "Informe o nome.").max(120),
      community_ids: z.array(z.number().int().positive()).min(1, "Escolha pelo menos uma comunidade.").max(20),
    }),
  );
  const ids = [...new Set(b.community_ids)];
  await assertCommunities(c.env.DB, ids);

  // Se a pessoa já tem conta, não há convite: ela é associada diretamente às comunidades.
  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(b.email).first<{ id: string }>();
  if (existing) {
    await c.env.DB.batch(
      ids.map((cid) =>
        c.env.DB.prepare(
          `INSERT INTO memberships (user_id, community_id, added_by) VALUES (?, ?, ?)
           ON CONFLICT (user_id, community_id) DO UPDATE SET status = 'active'`,
        ).bind(existing.id, cid, actor.id),
      ),
    );
    await audit(c.env.DB, actor.id, "membership.add_existing", "user", existing.id, { community_ids: ids });
    return c.json({ existing_user: true, user_id: existing.id });
  }

  const id = randomId();
  const token = randomToken();
  await c.env.DB.batch([
    // Um novo convite para o mesmo e-mail invalida os anteriores ainda pendentes.
    c.env.DB.prepare("UPDATE invitations SET revoked_at = ? WHERE email = ? AND accepted_at IS NULL AND revoked_at IS NULL").bind(nowIso(), b.email),
    c.env.DB.prepare("INSERT INTO invitations (id, token_hash, email, full_name, invited_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, await sha256Hex(token), b.email, b.full_name, actor.id, isoIn(INVITE_TTL)),
    ...ids.map((cid) => c.env.DB.prepare("INSERT INTO invitation_communities (invitation_id, community_id) VALUES (?, ?)").bind(id, cid)),
  ]);
  const mail = inviteMail(c.env, b.email, b.full_name, token, await communityNames(c.env.DB, ids));
  let emailSent = true;
  try {
    await sendMail(c.env, mail);
  } catch {
    emailSent = false;
  }
  await audit(c.env.DB, actor.id, "invite.create", "invitation", id, { email: b.email, community_ids: ids, email_sent: emailSent });
  // O link é mostrado uma única vez à administração (para envio por outro canal, se preciso).
  return c.json({ existing_user: false, invitation_id: id, invite_url: mail.actionUrl, email_sent: emailSent });
});

admin.get("/invitations", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT i.id, i.email, i.full_name, i.created_at, i.expires_at, i.accepted_at, i.revoked_at,
            p.full_name AS invited_by_name,
            (SELECT GROUP_CONCAT(c.name, '|') FROM invitation_communities ic JOIN communities c ON c.id = ic.community_id WHERE ic.invitation_id = i.id) AS communities
       FROM invitations i LEFT JOIN profiles p ON p.user_id = i.invited_by
      ORDER BY i.created_at DESC LIMIT 200`,
  ).all<{ communities: string | null; accepted_at: string | null; revoked_at: string | null; expires_at: string }>();
  const now = nowIso();
  return c.json({
    invitations: results.map((r) => ({
      ...r,
      communities: r.communities ? r.communities.split("|") : [],
      status: r.accepted_at ? "accepted" : r.revoked_at ? "revoked" : r.expires_at <= now ? "expired" : "pending",
    })),
  });
});

admin.post("/invitations/:id/revoke", async (c) => {
  const actor = c.get("user");
  const id = c.req.param("id");
  const r = await c.env.DB.prepare("UPDATE invitations SET revoked_at = ? WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL").bind(nowIso(), id).run();
  if (!r.meta.changes) fail(404, "Convite não encontrado ou já encerrado.");
  await audit(c.env.DB, actor.id, "invite.revoke", "invitation", id);
  return c.json({ ok: true });
});

admin.post("/invitations/:id/resend", async (c) => {
  const actor = c.get("user");
  const id = c.req.param("id");
  const inv = await c.env.DB.prepare("SELECT id, email, full_name FROM invitations WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL")
    .bind(id).first<{ id: string; email: string; full_name: string }>();
  if (!inv) fail(404, "Convite não encontrado ou já encerrado.");
  const token = randomToken(); // o link antigo deixa de funcionar
  await c.env.DB.prepare("UPDATE invitations SET token_hash = ?, expires_at = ? WHERE id = ?").bind(await sha256Hex(token), isoIn(INVITE_TTL), id).run();
  const { results } = await c.env.DB.prepare("SELECT community_id FROM invitation_communities WHERE invitation_id = ?").bind(id).all<{ community_id: number }>();
  const mail = inviteMail(c.env, inv.email, inv.full_name, token, await communityNames(c.env.DB, results.map((r) => r.community_id)));
  let emailSent = true;
  try {
    await sendMail(c.env, mail);
  } catch {
    emailSent = false;
  }
  await audit(c.env.DB, actor.id, "invite.resend", "invitation", id, { email_sent: emailSent });
  return c.json({ invite_url: mail.actionUrl, email_sent: emailSent });
});

// ── Membros ────────────────────────────────────────────────────────────────
admin.get("/members", async (c) => {
  const q = `%${(c.req.query("q") ?? "").trim().slice(0, 80)}%`;
  const community = Number(c.req.query("community") ?? 0);
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.status, u.is_admin, u.last_login_at, p.full_name, p.headline, p.hidden_by_admin, p.visibility,
            (SELECT GROUP_CONCAT(c.name || ':' || m.status, '|') FROM memberships m JOIN communities c ON c.id = m.community_id WHERE m.user_id = u.id) AS memberships
       FROM users u JOIN profiles p ON p.user_id = u.id
      WHERE (p.full_name LIKE ?1 OR u.email LIKE ?1)
        AND (?2 = 0 OR EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.community_id = ?2))
      ORDER BY p.full_name COLLATE NOCASE LIMIT 500`,
  ).bind(q, community).all<{ memberships: string | null }>();
  return c.json({
    members: results.map((r) => ({
      ...r,
      memberships: r.memberships ? r.memberships.split("|").map((s) => ({ name: s.slice(0, s.lastIndexOf(":")), status: s.slice(s.lastIndexOf(":") + 1) })) : [],
    })),
  });
});

admin.get("/members/:id", async (c) => {
  const actor = c.get("user");
  const id = c.req.param("id");
  const user = await c.env.DB.prepare("SELECT id, email, status, is_admin, created_at, last_login_at FROM users WHERE id = ?").bind(id).first();
  if (!user) fail(404, "Membro não encontrado.");
  const { results: memberships } = await c.env.DB.prepare(
    "SELECT m.community_id, c.name, m.status, m.joined_at, m.renews_at FROM memberships m JOIN communities c ON c.id = m.community_id WHERE m.user_id = ? ORDER BY c.sort_order",
  ).bind(id).all();
  const { results: badges } = await c.env.DB.prepare(
    "SELECT mb.badge_id, b.name, mb.community_id, c.name AS community_name FROM member_badges mb JOIN badges b ON b.id = mb.badge_id JOIN communities c ON c.id = mb.community_id WHERE mb.user_id = ?",
  ).bind(id).all();
  return c.json({ user, memberships, badges, profile: await buildProfile(c.env.DB, actor, id) });
});

admin.put("/members/:id/memberships/:communityId", async (c) => {
  const actor = c.get("user");
  const id = c.req.param("id");
  const cid = Number(c.req.param("communityId"));
  const b = await parseJson(c, z.object({ status: z.enum(["active", "suspended", "expired"]), renews_at: z.string().date().nullable().optional() }));
  await assertCommunities(c.env.DB, [cid]);
  if (!(await c.env.DB.prepare("SELECT 1 FROM users WHERE id = ?").bind(id).first())) fail(404, "Membro não encontrado.");
  await c.env.DB.prepare(
    `INSERT INTO memberships (user_id, community_id, status, renews_at, added_by) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, community_id) DO UPDATE SET status = excluded.status, renews_at = excluded.renews_at`,
  ).bind(id, cid, b.status, b.renews_at ?? null, actor.id).run();
  await audit(c.env.DB, actor.id, "membership.set", "user", id, { community_id: cid, status: b.status, renews_at: b.renews_at ?? null });
  return c.json({ ok: true });
});

admin.delete("/members/:id/memberships/:communityId", async (c) => {
  const actor = c.get("user");
  const id = c.req.param("id");
  const cid = Number(c.req.param("communityId"));
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM memberships WHERE user_id = ? AND community_id = ?").bind(id, cid),
    c.env.DB.prepare("DELETE FROM member_badges WHERE user_id = ? AND community_id = ?").bind(id, cid),
  ]);
  await audit(c.env.DB, actor.id, "membership.remove", "user", id, { community_id: cid });
  return c.json({ ok: true });
});

const badgeSchema = z.object({ badge_id: z.number().int().positive(), community_id: z.number().int().positive() });

admin.post("/members/:id/badges", async (c) => {
  const actor = c.get("user");
  const id = c.req.param("id");
  const b = await parseJson(c, badgeSchema);
  const member = await c.env.DB.prepare("SELECT 1 FROM memberships WHERE user_id = ? AND community_id = ?").bind(id, b.community_id).first();
  if (!member) fail(400, "A pessoa precisa participar da comunidade para receber um selo dela.");
  if (!(await c.env.DB.prepare("SELECT 1 FROM badges WHERE id = ?").bind(b.badge_id).first())) fail(400, "Selo inválido.");
  await c.env.DB.prepare("INSERT OR IGNORE INTO member_badges (user_id, badge_id, community_id, awarded_by) VALUES (?, ?, ?, ?)")
    .bind(id, b.badge_id, b.community_id, actor.id).run();
  await audit(c.env.DB, actor.id, "badge.award", "user", id, b);
  return c.json({ ok: true });
});

admin.delete("/members/:id/badges", async (c) => {
  const actor = c.get("user");
  const id = c.req.param("id");
  const b = await parseJson(c, badgeSchema);
  await c.env.DB.prepare("DELETE FROM member_badges WHERE user_id = ? AND badge_id = ? AND community_id = ?").bind(id, b.badge_id, b.community_id).run();
  await audit(c.env.DB, actor.id, "badge.revoke", "user", id, b);
  return c.json({ ok: true });
});

admin.post("/members/:id/status", async (c) => {
  const actor = c.get("user");
  const id = c.req.param("id");
  const b = await parseJson(c, z.object({ status: z.enum(["active", "suspended"]) }));
  if (id === actor.id) fail(400, "Você não pode suspender a própria conta.");
  const r = await c.env.DB.prepare("UPDATE users SET status = ? WHERE id = ?").bind(b.status, id).run();
  if (!r.meta.changes) fail(404, "Membro não encontrado.");
  if (b.status === "suspended") await destroyAllSessions(c.env.DB, id);
  await audit(c.env.DB, actor.id, b.status === "suspended" ? "user.suspend" : "user.activate", "user", id);
  return c.json({ ok: true });
});

admin.post("/members/:id/profile-visibility", async (c) => {
  const actor = c.get("user");
  const id = c.req.param("id");
  const b = await parseJson(c, z.object({ hidden_by_admin: z.boolean() }));
  const r = await c.env.DB.prepare("UPDATE profiles SET hidden_by_admin = ? WHERE user_id = ?").bind(b.hidden_by_admin ? 1 : 0, id).run();
  if (!r.meta.changes) fail(404, "Membro não encontrado.");
  await audit(c.env.DB, actor.id, b.hidden_by_admin ? "profile.hide" : "profile.show", "user", id);
  return c.json({ ok: true });
});

admin.get("/audit", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT a.id, a.action, a.target_type, a.target_id, a.details, a.created_at, p.full_name AS actor_name,
            tp.full_name AS target_name
       FROM audit_log a LEFT JOIN profiles p ON p.user_id = a.actor_id
       LEFT JOIN profiles tp ON a.target_type = 'user' AND tp.user_id = a.target_id
      ORDER BY a.id DESC LIMIT 200`,
  ).all();
  return c.json({ entries: results });
});

export default admin;
