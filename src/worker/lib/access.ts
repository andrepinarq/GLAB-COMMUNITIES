// Regras de acesso e privacidade. Toda leitura de dados de outros membros passa por aqui.
//
// Regra principal: um membro só vê o perfil de outra pessoa se as duas tiverem participação ATIVA
// em pelo menos uma comunidade em comum, a conta da outra pessoa estiver ativa, e o perfil não
// estiver oculto (pela própria pessoa ou pela administração). Administração vê tudo.
// Também só são reveladas as comunidades e os selos EM COMUM — nunca a participação em comunidades
// das quais quem está olhando não faz parte.

import type { SessionUser } from "../env";

export async function canViewProfile(db: D1Database, viewer: SessionUser, targetId: string): Promise<boolean> {
  if (viewer.id === targetId) return true;
  if (viewer.is_admin === 1) {
    return !!(await db.prepare("SELECT 1 FROM users WHERE id = ?").bind(targetId).first());
  }
  const row = await db
    .prepare(
      `SELECT 1
         FROM memberships a
         JOIN memberships b ON b.community_id = a.community_id
         JOIN users u ON u.id = b.user_id
         JOIN profiles p ON p.user_id = b.user_id
        WHERE a.user_id = ? AND a.status = 'active'
          AND b.user_id = ? AND b.status = 'active'
          AND u.status = 'active'
          AND p.visibility = 'members' AND p.hidden_by_admin = 0
        LIMIT 1`,
    )
    .bind(viewer.id, targetId)
    .first();
  return !!row;
}

/** Comunidades que podem ser mostradas no perfil de `targetId` para `viewer`. */
export async function visibleCommunityIds(db: D1Database, viewer: SessionUser, targetId: string): Promise<number[]> {
  const sql =
    viewer.is_admin === 1 || viewer.id === targetId
      ? `SELECT community_id FROM memberships WHERE user_id = ?2 AND (?1 = ?1)`
      : `SELECT b.community_id FROM memberships a JOIN memberships b ON b.community_id = a.community_id
          WHERE a.user_id = ?1 AND a.status = 'active' AND b.user_id = ?2 AND b.status = 'active'`;
  const { results } = await db.prepare(sql).bind(viewer.id, targetId).all<{ community_id: number }>();
  return results.map((r) => r.community_id);
}

export async function isActiveMember(db: D1Database, userId: string, communityId: number): Promise<boolean> {
  return !!(await db
    .prepare("SELECT 1 FROM memberships WHERE user_id = ? AND community_id = ? AND status = 'active'")
    .bind(userId, communityId)
    .first());
}
