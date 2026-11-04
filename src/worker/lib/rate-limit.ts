import { sha256Hex } from "./crypto";
import { fail } from "./http";

/**
 * Limite de tentativas em janela fixa, guardado no D1 (consistente entre regiões).
 * As chaves são guardadas como hash, para não armazenar e-mails ou IPs em texto.
 */
export async function hitRateLimit(db: D1Database, rawKey: string, max: number, windowSeconds: number): Promise<void> {
  const key = await sha256Hex(rawKey);
  const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(key, windowStart)
    .first<{ count: number }>();
  if ((row?.count ?? 0) > max) fail(429, "Muitas tentativas. Aguarde alguns minutos e tente novamente.");
}

export const LIMITS = {
  loginPerEmail: { max: 8, window: 15 * 60 },
  loginPerIp: { max: 30, window: 15 * 60 },
  forgotPerEmail: { max: 3, window: 60 * 60 },
  forgotPerIp: { max: 10, window: 60 * 60 },
  tokenPerIp: { max: 20, window: 60 * 60 }, // convite e redefinição de senha
  uploadPerUser: { max: 20, window: 60 * 60 },
} as const;
