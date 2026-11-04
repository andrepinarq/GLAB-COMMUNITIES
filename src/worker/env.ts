export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  ASSETS?: Fetcher;
  APP_ENV: "development" | "production";
  APP_URL: string;
  EMAIL_FROM: string;
  PASSWORD_PBKDF2_ITERATIONS: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET?: string;
  RESEND_API_KEY?: string;
}

export interface SessionUser {
  id: string;
  email: string;
  is_admin: number;
  status: "active" | "suspended";
  session_id: string;
}

export type AppEnv = { Bindings: Env; Variables: { user: SessionUser } };

/** Chaves de TESTE oficiais do Turnstile (sempre aprovam). Nunca podem ser usadas em produção. */
export const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
export const TURNSTILE_DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

export function isProduction(env: Env) {
  return env.APP_ENV === "production";
}

/** Em produção, recusa funcionar se alguma configuração de segurança estiver faltando. */
export function productionConfigProblems(env: Env): string[] {
  if (!isProduction(env)) return [];
  const problems: string[] = [];
  if (!env.APP_URL.startsWith("https://")) problems.push("APP_URL precisa usar https");
  if (!env.TURNSTILE_SECRET || env.TURNSTILE_SECRET === TURNSTILE_TEST_SECRET) problems.push("TURNSTILE_SECRET real ausente");
  if (env.TURNSTILE_SITE_KEY === TURNSTILE_TEST_SITE_KEY) problems.push("TURNSTILE_SITE_KEY de teste");
  if (!env.RESEND_API_KEY) problems.push("RESEND_API_KEY ausente");
  if (Number(env.PASSWORD_PBKDF2_ITERATIONS) < 600000) problems.push("PASSWORD_PBKDF2_ITERATIONS abaixo de 600000 (OWASP)");
  return problems;
}
