import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../api";

export function Period() {
  return <span className="brand-period" aria-hidden="true" />;
}

/** Título com o ponto final da marca, como em gavealab.com.br. */
export function Title({ children, as: Tag = "h1" }: { children: ReactNode; as?: "h1" | "h2" }) {
  return (
    <Tag>
      {children}
      <Period />
    </Tag>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="eyebrow">
      <i />
      {children}
    </div>
  );
}

export function SectionLabel({ children, n }: { children: ReactNode; n?: string }) {
  return (
    <div className="section-label">
      {children}
      {n && <span>{n}</span>}
    </div>
  );
}

export function Alert({ error }: { error: string | null }) {
  return error ? (
    <div className="alert" role="alert">
      {error}
    </div>
  ) : null;
}

export function Avatar({ name, url, large }: { name: string; url: string | null; large?: boolean }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <div className={`avatar${large ? " avatar-lg" : ""}`} aria-hidden={!url}>
      {url ? <img src={url} alt={`Foto de ${name}`} className={`avatar${large ? " avatar-lg" : ""}`} /> : initials}
    </div>
  );
}

export function BadgePill({ name }: { name: string }) {
  const cls = name.toLowerCase().includes("conselho") ? "curator" : name.toLowerCase().includes("fundador") ? "founder" : "";
  return (
    <span className={`badge ${cls}`}>
      <i />
      {name}
    </span>
  );
}

export function Loading() {
  return <p className="hint">Carregando…</p>;
}

// ── Turnstile ───────────────────────────────────────────────────────────────
declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id: string) => void };
  }
}
let configPromise: Promise<{ turnstileSiteKey: string; turnstileDevBypass: boolean }> | null = null;
const getConfig = () => (configPromise ??= api("/auth/config"));
const DUMMY = "XXXX.DUMMY.TOKEN.XXXX";

/** Verificação anti-robô. Em desenvolvimento com a chave de teste, não carrega o widget externo. */
export function Turnstile({ onToken, resetKey }: { onToken: (token: string) => void; resetKey?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [devMode, setDevMode] = useState(false);
  useEffect(() => {
    let widgetId: string | undefined;
    let cancelled = false;
    onToken("");
    getConfig().then((cfg) => {
      if (cancelled) return;
      if (cfg.turnstileDevBypass) {
        setDevMode(true);
        onToken(DUMMY);
        return;
      }
      const mount = () => {
        if (cancelled || !ref.current || !window.turnstile) return;
        widgetId = window.turnstile.render(ref.current, {
          sitekey: cfg.turnstileSiteKey,
          language: "pt-br",
          callback: (t: string) => onToken(t),
          "expired-callback": () => onToken(""),
        });
      };
      if (window.turnstile) mount();
      else {
        const s = document.createElement("script");
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        s.async = true;
        s.onload = mount;
        document.head.appendChild(s);
      }
    });
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);
  if (devMode) return <div className="turnstile-dev">Verificação anti-robô (Turnstile) em modo de teste.</div>;
  return <div ref={ref} style={{ marginBottom: 16, minHeight: 65 }} />;
}

// ── Campo de tags ───────────────────────────────────────────────────────────
export function TagInput({ value, onChange, placeholder, variant, max = 12 }: { value: string[]; onChange: (v: string[]) => void; placeholder: string; variant?: "help" | "look"; max?: number }) {
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  useEffect(() => {
    const q = draft.trim();
    if (q.length < 2) return setSuggestions([]);
    const t = setTimeout(() => {
      api<{ tags: string[] }>(`/me/tag-suggestions?q=${encodeURIComponent(q)}`)
        .then((r) => setSuggestions(r.tags.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()))))
        .catch(() => setSuggestions([]));
    }, 200);
    return () => clearTimeout(t);
  }, [draft, value]);

  const add = (raw: string) => {
    const label = raw.replace(/\s+/g, " ").trim().slice(0, 40);
    if (label.length < 2 || value.length >= max || value.some((v) => v.toLowerCase() === label.toLowerCase())) return setDraft("");
    onChange([...value, label]);
    setDraft("");
  };
  const cls = variant === "help" ? "chip chip-help" : variant === "look" ? "chip chip-look" : "chip";
  return (
    <div>
      <div className="tag-input">
        {value.map((t) => (
          <span key={t} className={cls}>
            {t}
            <button type="button" aria-label={`Remover ${t}`} onClick={() => onChange(value.filter((v) => v !== t))}>
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          placeholder={value.length >= max ? `Máximo de ${max} tags` : placeholder}
          disabled={value.length >= max}
          onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value.slice(0, -1)) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => draft && add(draft)}
        />
      </div>
      {suggestions.length > 0 && (
        <div className="suggestions">
          {suggestions.map((s) => (
            <button type="button" key={s} onMouseDown={(e) => e.preventDefault()} onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
