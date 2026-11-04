import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv, SessionUser } from "../env";
import { randomToken, sha256Hex } from "./crypto";
import { fail, isoIn } from "./http";

// Cookie com prefixo __Host-: só HTTPS, sem domínio (não vaza para gavealab.com.br) e caminho "/".
export const SESSION_COOKIE = "__Host-gl_session";
const SESSION_TTL = 14 * 24 * 3600; // 14 dias
const RENEW_WHEN_LESS_THAN = 7 * 24 * 3600;

export async function createSession(c: Context<AppEnv>, userId: string): Promise<void> {
  const token = randomToken();
  const id = await sha256Hex(token);
  await c.env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES (?, ?, ?, ?)")
    .bind(id, userId, isoIn(SESSION_TTL), (c.req.header("User-Agent") ?? "").slice(0, 200))
    .run();
  await c.env.DB.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(new Date().toISOString(), userId).run();
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

export async function destroySession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256Hex(token)).run();
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
}

/** Encerra todas as sessões de um usuário (troca de senha, suspensão). */
export async function destroyAllSessions(db: D1Database, userId: string, exceptSessionId?: string) {
  if (exceptSessionId) await db.prepare("DELETE FROM sessions WHERE user_id = ? AND id <> ?").bind(userId, exceptSessionId).run();
  else await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
}

async function loadSessionUser(c: Context<AppEnv>): Promise<SessionUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token || token.length > 100) return null;
  const id = await sha256Hex(token);
  const row = await c.env.DB.prepare(
    `SELECT s.id AS session_id, s.expires_at, u.id, u.email, u.is_admin, u.status
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
  ).bind(id).first<SessionUser & { expires_at: string }>();
  if (!row) return null;
  const remaining = (Date.parse(row.expires_at) - Date.now()) / 1000;
  if (remaining <= 0 || row.status !== "active") {
    await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
    return null;
  }
  if (remaining < RENEW_WHEN_LESS_THAN) {
    await c.env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?").bind(isoIn(SESSION_TTL), id).run();
    setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: SESSION_TTL });
  }
  const { expires_at: _ignored, ...user } = row;
  return user;
}

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await loadSessionUser(c);
  if (!user) fail(401, "Sessão expirada. Entre novamente.");
  c.set("user", user);
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get("user");
  if (!user || user.is_admin !== 1) fail(403, "Acesso restrito à administração.");
  await next();
};
