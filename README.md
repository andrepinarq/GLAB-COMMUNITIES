# GáveaLab | Communities — Área de membros

Área privada de membros em `membros.gavealab.com.br`. O site institucional (WordPress.com) continua independente e não foi alterado.

- **Entrada somente por convite.** Não existe cadastro público.
- **Várias comunidades por pessoa**, cada uma com seus membros, selos e situação de participação.
- **Privacidade por padrão:** um membro só vê o perfil de quem participa de pelo menos uma comunidade em comum com ele.

## Arquitetura

| Peça | Serviço | Função |
|---|---|---|
| Aplicação | Cloudflare Workers + arquivos estáticos | Telas (React) e servidor (`/api/*`) no mesmo Worker |
| Banco | Cloudflare D1 | Contas, perfis, comunidades, convites, selos, registro |
| Fotos e backups | Cloudflare R2 (bucket privado) | Fotos entregues só a membros autorizados; backup semanal |
| Anti-robô | Cloudflare Turnstile | Login, recuperação de senha, convite |
| E-mail | Resend | Convites e redefinição de senha |

```
src/
  worker/            servidor (Hono)
    index.ts         entrada, cabeçalhos de segurança, proteção CSRF, tarefa semanal
    lib/             cripto, sessão, regras de acesso, limite de tentativas, e-mail, tags
    routes/          auth (login, senha, convite), me (perfil, foto), members, admin
  client/            telas (React)
    pages/           Auth, Home, Community, Member, EditProfile, admin/*
migrations/          esquema do banco + as 4 comunidades e os 2 selos
test/                testes automáticos (rodam no runtime real dos Workers)
tools/auth-bench/    Worker de medição do custo de CPU dos algoritmos de senha
scripts/             criação do primeiro convite de administração
docs/                relatório da Fase 1 e capturas de tela
```

## Rodar localmente

```bash
npm install --legacy-peer-deps
cp .dev.vars.example .dev.vars          # chaves de TESTE do Turnstile
npm run db:migrate:local
node scripts/create-admin-invite.mjs --email voce@exemplo.com --name "Seu Nome"
npm run dev                             # http://localhost:5173
```

Sem `RESEND_API_KEY`, os e-mails ficam numa caixa de saída local: `http://localhost:5173/dev/emails` (rota inexistente em produção).

## Testes

```bash
npm test          # 43 testes: senhas, sessões, CSRF, limites, convites, privacidade, fotos, admin, backup
npm run typecheck
```

## Publicar

Passo a passo completo, da conta Cloudflare à produção: [`docs/publicar.md`](docs/publicar.md).

```bash
npm run db:migrate:teste && npm run deploy:teste        # ambiente de teste (*.workers.dev)
npm run db:migrate:producao && npm run deploy:producao  # membros.gavealab.com.br
```

Em produção, a API **se recusa a funcionar** se faltar alguma configuração de segurança (Turnstile real, Resend, HTTPS, custo da senha).

## Requisito de plano

O cálculo seguro de senha (PBKDF2-SHA256, 600.000 iterações, recomendação OWASP) leva centenas de milissegundos de CPU. O plano gratuito dos Workers permite 10 ms por pedido. **Login, aceite de convite e troca de senha exigem o Workers Paid (US$ 5/mês).** Ver `docs/fase-1.md`.
