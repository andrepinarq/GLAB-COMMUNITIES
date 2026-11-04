import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { hashPassword, randomId, verifyPassword } from "../lib/crypto";
import { fail, nowIso, parseJson } from "../lib/http";
import { buildProfile } from "../lib/profile";
import { hitRateLimit, LIMITS } from "../lib/rate-limit";
import { destroyAllSessions } from "../lib/session";
import { saveTags, tagSlug } from "../lib/tags";
import { passwordSchema } from "./auth";

const me = new Hono<AppEnv>();

me.get("/", async (c) => {
  const user = c.get("user");
  const profile = await buildProfile(c.env.DB, user, user.id);
  return c.json({ user: { id: user.id, email: user.email, is_admin: user.is_admin === 1 }, profile });
});

const text = (max: number) => z.string().trim().max(max, `Use no máximo ${max} caracteres.`);
const url = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https:\/\/[^\s<>"]+$/i.test(v), "Use um endereço completo começando com https://");
const tagList = z
  .array(z.string().trim().min(2, "Cada tag precisa de pelo menos 2 caracteres.").max(40, "Cada tag pode ter no máximo 40 caracteres."))
  .max(12, "Use no máximo 12 tags em cada lista.");

const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Informe seu nome.").max(120),
  headline: text(140),
  organization: text(120),
  city: text(80),
  bio: text(1500),
  can_help_text: text(600),
  looking_for_text: text(600),
  linkedin_url: url.refine((v) => v === "" || /^https:\/\/([a-z]+\.)?linkedin\.com\//i.test(v), "Use o endereço do seu perfil no LinkedIn."),
  website_url: url,
  show_email: z.boolean(),
  visibility: z.enum(["members", "hidden"]),
  tags: z.object({ expertise: tagList, can_help: tagList, looking_for: tagList }),
});

me.put("/profile", async (c) => {
  const user = c.get("user");
  const b = await parseJson(c, profileSchema);
  await c.env.DB.prepare(
    `UPDATE profiles SET full_name = ?, headline = ?, organization = ?, city = ?, bio = ?, can_help_text = ?, looking_for_text = ?,
            linkedin_url = ?, website_url = ?, show_email = ?, visibility = ?, updated_at = ? WHERE user_id = ?`,
  )
    .bind(b.full_name, b.headline, b.organization, b.city, b.bio, b.can_help_text, b.looking_for_text, b.linkedin_url, b.website_url, b.show_email ? 1 : 0, b.visibility, nowIso(), user.id)
    .run();
  await saveTags(c.env.DB, user.id, b.tags);
  return c.json({ profile: await buildProfile(c.env.DB, user, user.id) });
});

// ── Foto ───────────────────────────────────────────────────────────────────
// O navegador redimensiona a imagem (máx. 800 px) antes de enviar. Aqui conferimos o tipo real pelos
// primeiros bytes do arquivo — não confiamos na extensão nem no tipo declarado pelo navegador.
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

function detectImage(bytes: Uint8Array): { ext: string; type: string } | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { ext: "png", type: "image/png" };
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { ext: "webp", type: "image/webp" };
  return null;
}

me.post("/photo", async (c) => {
  const user = c.get("user");
  await hitRateLimit(c.env.DB, `upload:${user.id}`, LIMITS.uploadPerUser.max, LIMITS.uploadPerUser.window);
  const declared = Number(c.req.header("Content-Length") ?? 0);
  if (declared > MAX_PHOTO_BYTES + 64 * 1024) fail(413, "A foto pode ter no máximo 2 MB.");
  const form = await c.req.formData().catch(() => fail(400, "Envie uma imagem."));
  const file = form.get("photo");
  if (!file || typeof file === "string") fail(400, "Envie uma imagem.");
  if (file.size > MAX_PHOTO_BYTES) fail(413, "A foto pode ter no máximo 2 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detectImage(bytes);
  if (!kind) fail(415, "Use uma imagem JPG, PNG ou WebP.");

  const key = `avatars/${user.id}/${randomId()}.${kind.ext}`;
  await c.env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: kind.type } });
  const old = await c.env.DB.prepare("SELECT photo_key FROM profiles WHERE user_id = ?").bind(user.id).first<{ photo_key: string | null }>();
  await c.env.DB.prepare("UPDATE profiles SET photo_key = ?, updated_at = ? WHERE user_id = ?").bind(key, nowIso(), user.id).run();
  if (old?.photo_key) await c.env.PHOTOS.delete(old.photo_key);
  return c.json({ profile: await buildProfile(c.env.DB, user, user.id) });
});

me.delete("/photo", async (c) => {
  const user = c.get("user");
  const old = await c.env.DB.prepare("SELECT photo_key FROM profiles WHERE user_id = ?").bind(user.id).first<{ photo_key: string | null }>();
  await c.env.DB.prepare("UPDATE profiles SET photo_key = NULL, updated_at = ? WHERE user_id = ?").bind(nowIso(), user.id).run();
  if (old?.photo_key) await c.env.PHOTOS.delete(old.photo_key);
  return c.json({ profile: await buildProfile(c.env.DB, user, user.id) });
});

// ── Senha ──────────────────────────────────────────────────────────────────
me.post("/password", async (c) => {
  const user = c.get("user");
  const b = await parseJson(c, z.object({ current_password: z.string().min(1).max(128), new_password: passwordSchema }));
  await hitRateLimit(c.env.DB, `login:email:${user.email}`, LIMITS.loginPerEmail.max, LIMITS.loginPerEmail.window);
  const row = await c.env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(user.id).first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(b.current_password, row.password_hash))) fail(400, "A senha atual está incorreta.");
  if (b.new_password.toLowerCase() === user.email.toLowerCase()) fail(400, "A senha não pode ser igual ao e-mail.");
  const pw = await hashPassword(b.new_password, Number(c.env.PASSWORD_PBKDF2_ITERATIONS));
  await c.env.DB.prepare("UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?").bind(pw, nowIso(), user.id).run();
  await destroyAllSessions(c.env.DB, user.id, user.session_id); // encerra as outras sessões
  return c.json({ ok: true });
});

// ── Sugestões de tags ──────────────────────────────────────────────────────
me.get("/tag-suggestions", async (c) => {
  const q = tagSlug((c.req.query("q") ?? "").slice(0, 40));
  const { results } = await c.env.DB.prepare(
    `SELECT t.label, COUNT(pt.user_id) AS uses FROM tags t LEFT JOIN profile_tags pt ON pt.tag_id = t.id
      WHERE t.slug LIKE ? GROUP BY t.id HAVING uses > 0 ORDER BY uses DESC, t.label LIMIT 12`,
  ).bind(`%${q}%`).all<{ label: string }>();
  return c.json({ tags: results.map((r) => r.label) });
});

export default me;
