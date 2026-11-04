import { describe, expect, it } from "vitest";
import { type Env, productionConfigProblems } from "../src/worker/env";

const base = {
  APP_ENV: "production", APP_URL: "https://membros.gavealab.com.br", EMAIL_FROM: "x", PASSWORD_PBKDF2_ITERATIONS: "600000",
  TURNSTILE_SITE_KEY: "0x4AAAAAAexemplo", TURNSTILE_SECRET: "0x4AAAAAAsegredo", RESEND_API_KEY: "re_exemplo",
} as unknown as Env;

describe("trava de configuração de produção", () => {
  it("aceita configuração completa", () => {
    expect(productionConfigProblems(base)).toEqual([]);
  });
  it("recusa chaves de teste, campos não preenchidos, http e custo de senha baixo", () => {
    const bad = { ...base, APP_URL: "https://gavealab-membros-teste.PREENCHER_SUBDOMINIO.workers.dev", TURNSTILE_SITE_KEY: "PREENCHER_CHAVE_PUBLICA_TURNSTILE", TURNSTILE_SECRET: "1x0000000000000000000000000000000AA", RESEND_API_KEY: undefined, PASSWORD_PBKDF2_ITERATIONS: "100000" } as Env;
    expect(productionConfigProblems(bad)).toHaveLength(5);
    expect(productionConfigProblems({ ...base, APP_URL: "http://membros.gavealab.com.br" } as Env)).toEqual(["APP_URL precisa usar https"]);
  });
});
