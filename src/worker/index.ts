import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { type AppEnv, type Env, isProduction, productionConfigProblems } from "./env";
import { fail, nowIso } from "./lib/http";
import { requireAdmin, requireUser } from "./lib/session";
import adminRoutes from "./routes/admin";
import authRoutes from "./routes/auth";
import meRoutes from "./routes/me";
import memberRoutes from "./routes/members";

const app = new Hono<AppEnv>().basePath("/api");

// Configuração de produção incompleta = a API não funciona (falha fechada, nunca aberta).
app.use("*", async (c, next) => {
  const problems = productionConfigProblems(c.env);
  if (problems.length) {
    console.error("Configuração de produção incompleta:", problems.join("; "));
    fail(500, "Serviço temporariamente indisponível.");
  }
  await next();
});

// Pedidos que alteram dados só são aceitos quando vêm do próprio site (proteção contra CSRF),
// somando-se ao cookie SameSite=Lax.
app.use("*", async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("Origin");
    const expected = new URL(c.req.url).origin;
    if (!origin || origin !== expected) fail(403, "Origem do pedido não permitida.");
  }
  await next();
  c.header("Cache-Control", c.res.headers.get("Cache-Control") ?? "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Frame-Options", "DENY");
});

app.route("/auth", authRoutes);

app.use("/me/*", requireUser);
app.use("/me", requireUser);
app.route("/me", meRoutes);

app.use("/communities/*", requireUser);
app.use("/communities", requireUser);
app.use("/members/*", requireUser);
app.use("/photos/*", requireUser);
app.route("/", memberRoutes);

app.use("/admin/*", requireUser, requireAdmin);
app.route("/admin", adminRoutes);

// Caixa de saída de e-mails — existe só fora de produção, para testar convites e recuperação de senha.
app.get("/dev/outbox", async (c) => {
  // Proteção dupla: além de não ser produção, só responde quando acessado pela própria máquina.
  const host = new URL(c.req.url).hostname;
  if (isProduction(c.env) || c.env.RESEND_API_KEY || !["localhost", "127.0.0.1"].includes(host)) fail(404, "Não encontrado.");
  const { results } = await c.env.DB.prepare("SELECT id, to_email, subject, text, html, created_at FROM dev_outbox ORDER BY id DESC LIMIT 50").all();
  return c.json({ emails: results });
});

app.notFound(() => fail(404, "Não encontrado."));

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Algo deu errado. Tente novamente." }, 500);
});

// ── Tarefa semanal: limpeza e backup do banco no R2 ──────────────────────────
const BACKUP_TABLES = [
  "communities", "users", "profiles", "memberships", "tags", "profile_tags", "badges", "member_badges",
  "invitations", "invitation_communities", "audit_log",
];

export async function runMaintenance(env: Env): Promise<string> {
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
    env.DB.prepare("DELETE FROM password_resets WHERE expires_at <= ?").bind(now),
    env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(Math.floor(Date.now() / 1000) - 86400),
  ]);
  const dump: Record<string, unknown[]> = {};
  for (const t of BACKUP_TABLES) dump[t] = (await env.DB.prepare(`SELECT * FROM ${t}`).all()).results;
  const key = `backups/${now.slice(0, 10)}.json`;
  await env.PHOTOS.put(key, JSON.stringify({ created_at: now, tables: dump }), { httpMetadata: { contentType: "application/json" } });
  return key;
}

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runMaintenance(env));
  },
} satisfies ExportedHandler<Env>;
