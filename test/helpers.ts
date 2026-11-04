import { env, exports } from "cloudflare:workers";
import { hashPassword, randomId } from "../src/worker/lib/crypto";

export const ORIGIN = "http://example.com";
export const DUMMY = "XXXX.DUMMY.TOKEN.XXXX";
export const PASSWORD = "senha-forte-de-teste";

export interface ApiOptions {
  method?: string;
  body?: unknown;
  cookie?: string;
  origin?: string | null;
  headers?: Record<string, string>;
  form?: FormData;
}

export async function api(path: string, o: ApiOptions = {}) {
  const headers: Record<string, string> = { ...(o.headers ?? {}) };
  if (o.origin !== null) headers.Origin = o.origin ?? ORIGIN;
  if (o.cookie) headers.Cookie = o.cookie;
  let body: BodyInit | undefined;
  if (o.form) body = o.form;
  else if (o.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(o.body);
  }
  const res: Response = await (exports as any).default.fetch(new Request(`${ORIGIN}${path}`, { method: o.method ?? (body ? "POST" : "GET"), headers, body }));
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* corpo não JSON */ }
  return { status: res.status, json, headers: res.headers, text };
}

/** Extrai "nome=valor" do Set-Cookie de sessão. */
export function sessionCookie(headers: Headers): string {
  const raw = headers.get("Set-Cookie") ?? "";
  const m = raw.match(/(__Host-gl_session=[^;]+)/);
  if (!m) throw new Error("sem cookie de sessão: " + raw);
  return m[1];
}

let counter = 0;
/** Cria uma conta diretamente no banco (atalho só para testes). */
export async function createUser(opts: { admin?: boolean; communities?: number[]; name?: string; email?: string } = {}) {
  counter++;
  const id = randomId();
  const email = opts.email ?? `pessoa${counter}-${id.slice(0, 4)}@exemplo.com`.toLowerCase();
  const hash = await hashPassword(PASSWORD, Number(env.PASSWORD_PBKDF2_ITERATIONS));
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, email, password_hash, is_admin) VALUES (?, ?, ?, ?)").bind(id, email, hash, opts.admin ? 1 : 0),
    env.DB.prepare("INSERT INTO profiles (user_id, full_name) VALUES (?, ?)").bind(id, opts.name ?? `Pessoa ${counter}`),
    ...(opts.communities ?? []).map((c) => env.DB.prepare("INSERT INTO memberships (user_id, community_id) VALUES (?, ?)").bind(id, c)),
  ]);
  return { id, email };
}

export async function login(email: string, password = PASSWORD) {
  const r = await api("/api/auth/login", { body: { email, password, turnstileToken: DUMMY } });
  if (r.status !== 200) throw new Error(`login falhou: ${r.status} ${r.text}`);
  return sessionCookie(r.headers);
}

export async function latestEmail(to: string) {
  return env.DB.prepare("SELECT * FROM dev_outbox WHERE to_email = ? ORDER BY id DESC LIMIT 1").bind(to).first<{ text: string; subject: string; html: string }>();
}

export function tokenFrom(text: string): string {
  const m = text.match(/#token=([A-Za-z0-9_-]+)/);
  if (!m) throw new Error("token não encontrado no e-mail");
  return m[1];
}
