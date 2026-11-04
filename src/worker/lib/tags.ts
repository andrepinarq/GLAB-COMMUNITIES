export const TAG_KINDS = ["expertise", "can_help", "looking_for"] as const;
export type TagKind = (typeof TAG_KINDS)[number];

/** "Inteligência Artificial " → "inteligencia-artificial" */
export function tagSlug(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function cleanTagLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim();
}

export type TagsByKind = Record<TagKind, string[]>;

export async function loadTags(db: D1Database, userId: string): Promise<TagsByKind> {
  const { results } = await db
    .prepare("SELECT pt.kind, t.label FROM profile_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.user_id = ? ORDER BY t.label")
    .bind(userId)
    .all<{ kind: TagKind; label: string }>();
  const out: TagsByKind = { expertise: [], can_help: [], looking_for: [] };
  for (const r of results) out[r.kind].push(r.label);
  return out;
}

/** Substitui as tags do perfil, criando as que ainda não existem. */
export async function saveTags(db: D1Database, userId: string, tags: TagsByKind): Promise<void> {
  const stmts: D1PreparedStatement[] = [db.prepare("DELETE FROM profile_tags WHERE user_id = ?").bind(userId)];
  for (const kind of TAG_KINDS) {
    const seen = new Set<string>();
    for (const raw of tags[kind]) {
      const label = cleanTagLabel(raw);
      const slug = tagSlug(label);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      stmts.push(
        db.prepare("INSERT INTO tags (slug, label, created_by) VALUES (?, ?, ?) ON CONFLICT (slug) DO NOTHING").bind(slug, label, userId),
        db.prepare("INSERT OR IGNORE INTO profile_tags (user_id, tag_id, kind) SELECT ?, id, ? FROM tags WHERE slug = ?").bind(userId, kind, slug),
      );
    }
  }
  await db.batch(stmts);
}
