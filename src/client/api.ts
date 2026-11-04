export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const init: RequestInit = { method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"), credentials: "same-origin", headers: {} };
  if (opts.form) init.body = opts.form;
  else if (opts.body !== undefined) {
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch(`/api${path}`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Algo deu errado. Tente novamente.");
  return data as T;
}

export type TagKind = "expertise" | "can_help" | "looking_for";
export type Tags = Record<TagKind, string[]>;

export interface Profile {
  id: string;
  full_name: string;
  headline: string;
  organization: string;
  city: string;
  bio: string;
  can_help_text: string;
  looking_for_text: string;
  linkedin_url: string;
  website_url: string;
  email: string | null;
  photo_url: string | null;
  tags: Tags;
  communities: { id: number; slug: string; name: string; status?: string }[];
  badges: { slug: string; name: string; community_id: number; community_name: string }[];
  show_email?: boolean;
  visibility?: "members" | "hidden";
  hidden_by_admin?: boolean;
}

export interface Me {
  user: { id: string; email: string; is_admin: boolean };
  profile: Profile;
}

/** Lê o token do fragmento da URL (#token=...), que nunca é enviado ao servidor nos logs de acesso. */
export function tokenFromHash(): string {
  return new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
}

/** Redimensiona a foto no navegador (máx. 800 px, JPEG) antes do envio. */
export async function resizeImage(file: File, max = 800): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Não foi possível processar a imagem."))), "image/jpeg", 0.86));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
