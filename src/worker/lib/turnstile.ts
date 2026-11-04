import { type Env, isProduction, TURNSTILE_DUMMY_TOKEN, TURNSTILE_TEST_SECRET } from "../env";
import { fail } from "./http";

/** Em desenvolvimento com a chave de teste oficial, a verificação é local (o widget de teste devolve um token fixo). */
export function turnstileDevBypass(env: Env): boolean {
  return !isProduction(env) && (!env.TURNSTILE_SECRET || env.TURNSTILE_SECRET === TURNSTILE_TEST_SECRET);
}

export async function verifyTurnstile(env: Env, token: string | undefined, ip: string): Promise<void> {
  if (!token || token.length > 2048) fail(400, "Confirme que você não é um robô.");
  if (turnstileDevBypass(env)) {
    if (token !== TURNSTILE_DUMMY_TOKEN) fail(400, "Confirme que você não é um robô.");
    return;
  }
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET ?? "");
  form.append("response", token);
  if (ip !== "local") form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const data = (await res.json().catch(() => ({}))) as { success?: boolean };
  if (!data.success) fail(400, "Confirme que você não é um robô.");
}
