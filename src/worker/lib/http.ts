import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";

export function fail(status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429 | 500, message: string): never {
  throw new HTTPException(status, { message });
}

export async function parseJson<T extends z.ZodTypeAny>(c: Context, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    fail(400, "Pedido inválido.");
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    fail(400, first?.message && !first.message.startsWith("Expected") && !first.message.startsWith("Required") ? first.message : "Dados inválidos.");
  }
  return result.data;
}

export function clientIp(c: Context): string {
  return c.req.header("CF-Connecting-IP") ?? "local";
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function isoIn(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}
