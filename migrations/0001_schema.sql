-- GáveaLab | Communities — área de membros
-- Esquema inicial (Fase 1). Banco: Cloudflare D1 (SQLite). Chaves estrangeiras são aplicadas pelo D1.

-- ── Contas ────────────────────────────────────────────────────────────────
-- Uma conta só nasce do aceite de um convite. Não existe cadastro público.
CREATE TABLE users (
  id                  TEXT PRIMARY KEY,                       -- identificador aleatório
  email               TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash       TEXT NOT NULL,                          -- formato: pbkdf2-sha256$iterações$sal$hash
  is_admin            INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  password_changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_login_at       TEXT
);

-- Sessões: o navegador guarda um token aleatório; aqui só fica o hash SHA-256 dele.
CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,                              -- SHA-256 do token (hex)
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at   TEXT NOT NULL,
  user_agent   TEXT
);
CREATE INDEX sessions_user ON sessions(user_id);

-- Recuperação de senha: token de uso único, válido por 1 hora (só o hash fica salvo).
CREATE TABLE password_resets (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at  TEXT NOT NULL,
  used_at     TEXT
);
CREATE INDEX password_resets_user ON password_resets(user_id);

-- Limite de tentativas (login, recuperação, convites) por chave e janela de tempo.
CREATE TABLE rate_limits (
  key           TEXT NOT NULL,
  window_start  INTEGER NOT NULL,                             -- início da janela (epoch, segundos)
  count         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

-- ── Comunidades e participação ────────────────────────────────────────────
CREATE TABLE communities (
  id           INTEGER PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,                                 -- ex.: "Líderes da Estética"
  description  TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'in_development' CHECK (status IN ('in_development', 'active', 'archived')),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Uma pessoa pode participar de várias comunidades.
CREATE TABLE memberships (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id  INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member')),  -- novos papéis entram em fases futuras
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'expired')),
  joined_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  renews_at     TEXT,                                         -- data de renovação (opcional)
  added_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, community_id)
);
CREATE INDEX memberships_community ON memberships(community_id, status);

-- ── Perfis ────────────────────────────────────────────────────────────────
CREATE TABLE profiles (
  user_id              TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name            TEXT NOT NULL,
  headline             TEXT NOT NULL DEFAULT '',              -- cargo / atuação
  organization         TEXT NOT NULL DEFAULT '',
  city                 TEXT NOT NULL DEFAULT '',
  bio                  TEXT NOT NULL DEFAULT '',
  can_help_text        TEXT NOT NULL DEFAULT '',              -- complemento livre de "Posso ajudar com"
  looking_for_text     TEXT NOT NULL DEFAULT '',              -- complemento livre de "Estou procurando"
  linkedin_url         TEXT NOT NULL DEFAULT '',
  website_url          TEXT NOT NULL DEFAULT '',
  show_email           INTEGER NOT NULL DEFAULT 0 CHECK (show_email IN (0, 1)),  -- mostrar e-mail aos membros
  visibility           TEXT NOT NULL DEFAULT 'members' CHECK (visibility IN ('members', 'hidden')),
  hidden_by_admin      INTEGER NOT NULL DEFAULT 0 CHECK (hidden_by_admin IN (0, 1)),
  photo_key            TEXT,                                  -- chave do arquivo no R2 (bucket privado)
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ── Tags ──────────────────────────────────────────────────────────────────
CREATE TABLE tags (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,                           -- forma normalizada (sem acento, minúscula)
  label       TEXT NOT NULL,
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- A mesma tag pode aparecer em três listas do perfil.
CREATE TABLE profile_tags (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  kind     TEXT NOT NULL CHECK (kind IN ('expertise', 'can_help', 'looking_for')),
  PRIMARY KEY (user_id, tag_id, kind)
);
CREATE INDEX profile_tags_tag ON profile_tags(tag_id, kind);

-- ── Selos ─────────────────────────────────────────────────────────────────
CREATE TABLE badges (
  id           INTEGER PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT ''
);

-- Selos são concedidos por comunidade (ex.: Conselho Curador da comunidade X).
CREATE TABLE member_badges (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id      INTEGER NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  community_id  INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  awarded_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  awarded_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, badge_id, community_id)
);

-- ── Convites ──────────────────────────────────────────────────────────────
CREATE TABLE invitations (
  id                TEXT PRIMARY KEY,
  token_hash        TEXT NOT NULL UNIQUE,                     -- só o hash do token fica salvo
  email             TEXT NOT NULL COLLATE NOCASE,
  full_name         TEXT NOT NULL,
  grant_admin       INTEGER NOT NULL DEFAULT 0 CHECK (grant_admin IN (0, 1)),  -- só pelo script de linha de comando
  invited_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at        TEXT NOT NULL,
  accepted_at       TEXT,
  revoked_at        TEXT,
  accepted_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX invitations_email ON invitations(email);

CREATE TABLE invitation_communities (
  invitation_id  TEXT NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
  community_id   INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  PRIMARY KEY (invitation_id, community_id)
);

-- ── Registro de ações administrativas ─────────────────────────────────────
CREATE TABLE audit_log (
  id           INTEGER PRIMARY KEY,
  actor_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  target_type  TEXT,
  target_id    TEXT,
  details      TEXT,                                          -- JSON
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX audit_log_created ON audit_log(created_at DESC);

-- ── Caixa de saída de e-mails (só em desenvolvimento/teste) ───────────────
-- Em produção os e-mails saem pelo Resend e esta tabela fica vazia.
CREATE TABLE dev_outbox (
  id          INTEGER PRIMARY KEY,
  to_email    TEXT NOT NULL,
  subject     TEXT NOT NULL,
  html        TEXT NOT NULL,
  text        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
