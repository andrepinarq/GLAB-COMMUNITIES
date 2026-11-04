#!/usr/bin/env node
// Cria um convite de ADMINISTRAÇÃO (o único jeito de criar a primeira conta de admin).
// Pelo painel, a administração só cria convites de membro comum.
//
// Uso:
//   node scripts/create-admin-invite.mjs --email voce@gavealab.com.br --name "Seu Nome" [--remote] [--url https://membros.gavealab.com.br]
//
// Sem --remote, grava no banco local de desenvolvimento.
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const email = get("--email")?.trim().toLowerCase();
const name = get("--name")?.trim();
const remote = args.includes("--remote");
const appUrl = get("--url") ?? (remote ? "https://membros.gavealab.com.br" : "http://localhost:5173");

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) {
  console.error('Uso: node scripts/create-admin-invite.mjs --email voce@exemplo.com --name "Seu Nome" [--remote]');
  process.exit(1);
}

const token = randomBytes(32).toString("base64url");
const tokenHash = createHash("sha256").update(token).digest("hex");
const id = randomBytes(12).toString("base64url");
const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
const q = (s) => `'${s.replace(/'/g, "''")}'`;

const sql = [
  `UPDATE invitations SET revoked_at = ${q(new Date().toISOString())} WHERE email = ${q(email)} AND accepted_at IS NULL AND revoked_at IS NULL;`,
  `INSERT INTO invitations (id, token_hash, email, full_name, grant_admin, expires_at) VALUES (${q(id)}, ${q(tokenHash)}, ${q(email)}, ${q(name)}, 1, ${q(expires)});`,
  `INSERT INTO invitation_communities (invitation_id, community_id) SELECT ${q(id)}, id FROM communities;`,
  `INSERT INTO audit_log (action, target_type, target_id, details) VALUES ('invite.create', 'invitation', ${q(id)}, ${q(JSON.stringify({ email, admin: true, via: "cli" }))});`,
].join("\n");

execFileSync("npx", ["wrangler", "d1", "execute", "DB", remote ? "--remote" : "--local", "--command", sql], { stdio: ["ignore", "ignore", "inherit"] });

console.log(`\nConvite de administração criado para ${email} (válido por 7 dias).`);
console.log(`Link (pessoal, mostrado só agora):\n\n  ${appUrl}/convite#token=${token}\n`);
