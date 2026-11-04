import { Hono } from "hono";
import type { AppEnv } from "../env";
import { canViewProfile, isActiveMember } from "../lib/access";
import { fail } from "../lib/http";
import { buildProfile, photoUrl } from "../lib/profile";

const members = new Hono<AppEnv>();

/** Comunidades da pessoa logada (administração vê todas). */
members.get("/communities", async (c) => {
  const user = c.get("user");
  const sql =
    user.is_admin === 1
      ? `SELECT c.id, c.slug, c.name, c.description, c.status,
                (SELECT COUNT(*) FROM memberships m2 WHERE m2.community_id = c.id AND m2.status = 'active') AS member_count,
                (SELECT status FROM memberships m3 WHERE m3.community_id = c.id AND m3.user_id = ?1) AS my_status
           FROM communities c WHERE c.status <> 'archived' ORDER BY c.sort_order`
      : `SELECT c.id, c.slug, c.name, c.description, c.status,
                (SELECT COUNT(*) FROM memberships m2 WHERE m2.community_id = c.id AND m2.status = 'active') AS member_count,
                m.status AS my_status
           FROM communities c JOIN memberships m ON m.community_id = c.id AND m.user_id = ?1 AND m.status = 'active'
          WHERE c.status <> 'archived' ORDER BY c.sort_order`;
  const { results } = await c.env.DB.prepare(sql).bind(user.id).all();
  return c.json({ communities: results });
});

/** Membros de uma comunidade — só para quem participa ativamente dela (ou administração). */
members.get("/communities/:slug/members", async (c) => {
  const user = c.get("user");
  const community = await c.env.DB.prepare("SELECT id, slug, name, description FROM communities WHERE slug = ?")
    .bind(c.req.param("slug"))
    .first<{ id: number; slug: string; name: string; description: string }>();
  if (!community) fail(404, "Comunidade não encontrada.");
  const admin = user.is_admin === 1;
  if (!admin && !(await isActiveMember(c.env.DB, user.id, community.id))) fail(404, "Comunidade não encontrada.");

  const { results } = await c.env.DB.prepare(
    `SELECT p.user_id AS id, p.full_name, p.headline, p.organization, p.city, p.photo_key,
            (SELECT GROUP_CONCAT(b.name, '|') FROM member_badges mb JOIN badges b ON b.id = mb.badge_id
              WHERE mb.user_id = p.user_id AND mb.community_id = m.community_id) AS badges
       FROM memberships m JOIN profiles p ON p.user_id = m.user_id JOIN users u ON u.id = m.user_id
      WHERE m.community_id = ? AND m.status = 'active' AND u.status = 'active'
        AND ((p.visibility = 'members' AND p.hidden_by_admin = 0) OR p.user_id = ?)
      ORDER BY p.full_name COLLATE NOCASE`,
  ).bind(community.id, user.id).all<{ id: string; full_name: string; headline: string; organization: string; city: string; photo_key: string | null; badges: string | null }>();

  return c.json({
    community,
    members: results.map(({ photo_key, badges, ...m }) => ({ ...m, photo_url: photoUrl(m.id, photo_key), badges: badges ? badges.split("|") : [] })),
  });
});

members.get("/members/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  // Perfil sem permissão responde "não encontrado" — não confirma nem que a pessoa existe.
  if (!(await canViewProfile(c.env.DB, user, id))) fail(404, "Perfil não encontrado.");
  const profile = await buildProfile(c.env.DB, user, id);
  if (!profile) fail(404, "Perfil não encontrado.");
  return c.json({ profile });
});

/** Fotos ficam num bucket privado e só são entregues a quem pode ver o perfil. */
members.get("/photos/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!(await canViewProfile(c.env.DB, user, id))) fail(404, "Foto não encontrada.");
  const row = await c.env.DB.prepare("SELECT photo_key FROM profiles WHERE user_id = ?").bind(id).first<{ photo_key: string | null }>();
  if (!row?.photo_key) fail(404, "Foto não encontrada.");
  const obj = await c.env.PHOTOS.get(row.photo_key);
  if (!obj) fail(404, "Foto não encontrada.");
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
});

export default members;
