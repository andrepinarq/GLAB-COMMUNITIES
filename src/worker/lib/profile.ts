import type { SessionUser } from "../env";
import { visibleCommunityIds } from "./access";
import { loadTags } from "./tags";

interface ProfileRow {
  user_id: string;
  email: string;
  full_name: string;
  headline: string;
  organization: string;
  city: string;
  bio: string;
  can_help_text: string;
  looking_for_text: string;
  linkedin_url: string;
  website_url: string;
  show_email: number;
  visibility: string;
  hidden_by_admin: number;
  photo_key: string | null;
  updated_at: string;
}

export function photoUrl(userId: string, key: string | null): string | null {
  if (!key) return null;
  const version = key.split("/").pop()?.split(".")[0] ?? "";
  return `/api/photos/${userId}?v=${version}`;
}

/**
 * Monta o perfil como `viewer` pode vê-lo. Pressupõe que canViewProfile() já foi verificado.
 * Campos privados (e-mail, configurações de visibilidade) só aparecem para a própria pessoa,
 * para a administração, ou — no caso do e-mail — quando a pessoa escolheu mostrá-lo.
 */
export async function buildProfile(db: D1Database, viewer: SessionUser, targetId: string) {
  const p = await db
    .prepare("SELECT p.*, u.email FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = ?")
    .bind(targetId)
    .first<ProfileRow>();
  if (!p) return null;
  const privileged = viewer.id === targetId || viewer.is_admin === 1;
  const communityIds = await visibleCommunityIds(db, viewer, targetId);
  const placeholders = communityIds.map(() => "?").join(",") || "NULL";

  const [communities, badges, tags] = await Promise.all([
    db
      .prepare(
        `SELECT c.id, c.slug, c.name, m.status FROM memberships m JOIN communities c ON c.id = m.community_id
          WHERE m.user_id = ? AND c.id IN (${placeholders}) ORDER BY c.sort_order`,
      )
      .bind(targetId, ...communityIds)
      .all<{ id: number; slug: string; name: string; status: string }>(),
    db
      .prepare(
        `SELECT b.slug, b.name, c.id AS community_id, c.name AS community_name
           FROM member_badges mb JOIN badges b ON b.id = mb.badge_id JOIN communities c ON c.id = mb.community_id
          WHERE mb.user_id = ? AND mb.community_id IN (${placeholders}) ORDER BY b.id, c.sort_order`,
      )
      .bind(targetId, ...communityIds)
      .all<{ slug: string; name: string; community_id: number; community_name: string }>(),
    loadTags(db, targetId),
  ]);

  return {
    id: p.user_id,
    full_name: p.full_name,
    headline: p.headline,
    organization: p.organization,
    city: p.city,
    bio: p.bio,
    can_help_text: p.can_help_text,
    looking_for_text: p.looking_for_text,
    linkedin_url: p.linkedin_url,
    website_url: p.website_url,
    email: privileged || p.show_email === 1 ? p.email : null,
    photo_url: photoUrl(p.user_id, p.photo_key),
    tags,
    communities: communities.results.map((c) => (privileged ? c : { id: c.id, slug: c.slug, name: c.name })),
    badges: badges.results,
    ...(privileged ? { show_email: p.show_email === 1, visibility: p.visibility, hidden_by_admin: p.hidden_by_admin === 1, updated_at: p.updated_at } : {}),
  };
}
