import { argon2id, bcrypt, scrypt } from "hash-wasm";

// Cada rota executa UM hash com parâmetros de produção, para medir o tempo de CPU por pedido.
const salt = () => crypto.getRandomValues(new Uint8Array(16));

async function pbkdf2(iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("senha-de-teste-123"), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt(), iterations }, key, 256);
}

export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const q = (k: string, d: number) => Number(url.searchParams.get(k) ?? d);
    try {
      switch (url.pathname) {
        case "/baseline":
          return new Response("ok");
        case "/argon2id": // OWASP: m=19456 KiB, t=2, p=1
          await argon2id({ password: "senha-de-teste-123", salt: salt(), parallelism: 1, iterations: q("t", 2), memorySize: q("m", 19456), hashLength: 32, outputType: "encoded" });
          return new Response("argon2id ok");
        case "/scrypt": // OWASP: N=2^17, r=8, p=1
          await scrypt({ password: "senha-de-teste-123", salt: salt(), costFactor: q("n", 131072), blockSize: q("r", 8), parallelism: 1, hashLength: 32, outputType: "hex" });
          return new Response("scrypt ok");
        case "/bcrypt": // OWASP: custo >= 10
          await bcrypt({ password: "senha-de-teste-123", salt: salt(), costFactor: q("c", 10), outputType: "encoded" });
          return new Response("bcrypt ok");
        case "/pbkdf2": // OWASP: 600000 iterações com SHA-256
          await pbkdf2(q("i", 600000));
          return new Response("pbkdf2 ok");
      }
      return new Response("not found", { status: 404 });
    } catch (e) {
      return new Response("erro: " + (e as Error).message, { status: 500 });
    }
  },
};
