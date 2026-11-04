// Primitivas criptográficas. Tudo usa a WebCrypto nativa do runtime (BoringSSL), sem código criptográfico próprio.

const enc = new TextEncoder();

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Token aleatório de 256 bits em base64url (convites, sessões, recuperação de senha). */
export function randomToken(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return toB64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Identificador aleatório curto (não secreto). */
export function randomId(): string {
  return randomToken(12);
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(value)));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ── Senhas ─────────────────────────────────────────────────────────────────
// PBKDF2-HMAC-SHA256 com 600.000 iterações (recomendação OWASP 2023+), sal aleatório de 16 bytes.
// O formato guarda o número de iterações, permitindo subir o custo no futuro sem perder as senhas atuais.

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations: number): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, iterStr, saltB64, hashB64] = stored.split("$");
  if (algo !== "pbkdf2-sha256" || !iterStr || !saltB64 || !hashB64) return false;
  const iterations = Number(iterStr);
  if (!Number.isInteger(iterations) || iterations < 1) return false;
  const actual = await pbkdf2(password, fromB64(saltB64), iterations);
  return timingSafeEqual(actual, fromB64(hashB64));
}

/** Indica se a senha deve ser recalculada com o custo atual (após login bem-sucedido). */
export function needsRehash(stored: string, iterations: number): boolean {
  const [algo, iterStr] = stored.split("$");
  return algo !== "pbkdf2-sha256" || Number(iterStr) < iterations;
}

/**
 * Executa um cálculo de senha com custo idêntico quando o e-mail não existe,
 * para que o tempo de resposta não revele quais e-mails têm conta.
 */
export async function burnPasswordTime(password: string, iterations: number): Promise<void> {
  await pbkdf2(password, new Uint8Array(16), iterations);
}
