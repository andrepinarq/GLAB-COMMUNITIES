# Como publicar a área de membros

O projeto já está configurado para o **Workers Paid**. Nada é ativado até você contratar o plano e autorizar a publicação.

Há três ambientes, definidos em `wrangler.jsonc`:

| Ambiente | Endereço | Para quê |
|---|---|---|
| local | `http://localhost:5173` | desenvolvimento; e-mails numa caixa de saída local |
| `teste` | `https://gavealab-membros-teste.<sua-conta>.workers.dev` | versão de teste na Cloudflare, com as mesmas regras de segurança de produção |
| `producao` | `https://membros.gavealab.com.br` | só depois da sua aprovação |

Os ambientes `teste` e `producao` têm banco, fotos e segredos separados. Os dois se recusam a funcionar se faltar alguma configuração de segurança.

---

## Parte A — Conta e credencial (feito por você, uma vez)

### A1. Criar a conta Cloudflare (gratuita)
1. Acesse **dash.cloudflare.com/sign-up** e crie a conta com um e-mail da GáveaLab.
2. Ative a verificação em duas etapas: **My Profile → Authentication → Two-Factor Authentication**.

### A2. Anotar o Account ID
1. No painel, abra **Workers & Pages** (menu lateral).
2. O **Account ID** aparece na coluna da direita. Copie e guarde.

### A3. Criar o token de API
1. Vá em **My Profile → API Tokens → Create Token**.
2. Escolha o modelo **Edit Cloudflare Workers** e clique em **Use template**.
3. Em **Permissions**, confira ou adicione:
   - Account · **Workers Scripts** · Edit
   - Account · **D1** · Edit
   - Account · **Workers R2 Storage** · Edit
   - Account · **Account Settings** · Read
   - User · **User Details** · Read
4. Em **Account Resources**, escolha só a sua conta. Em **Zone Resources**, deixe só a zona do domínio, se ela já existir na Cloudflare; senão, deixe como está.
5. Opcional, mas recomendado: em **TTL**, defina uma data de validade (por exemplo, 90 dias).
6. Clique em **Continue to summary → Create Token** e copie o token. Ele só aparece uma vez.

> Nunca cole o token na conversa. Ele vai só nas configurações do ambiente (passo A4).

### A4. Entregar o token à sessão do Claude
1. Na barra de título desta sessão, abra o menu do **ambiente** e clique em **Edit**.
2. Em **Network secrets** (em versões mais antigas do app: **API credentials**; se nenhuma das duas existir, use **Environment variables**), crie:
   - `CLOUDFLARE_API_TOKEN` = o token do passo A3
   - `CLOUDFLARE_ACCOUNT_ID` = o ID do passo A2
3. Em **Network access**, mantenha **Allow package managers** marcado e adicione em **Allowed domains**:
   - `api.cloudflare.com` (publicar)
   - `workers.dev` (testar o endereço publicado)
   - `challenges.cloudflare.com` (Turnstile)
   - `api.resend.com` (e-mails, opcional nesta etapa)

   Hoje a rede desta sessão bloqueia `api.cloudflare.com`. Passo a passo oficial: https://code.claude.com/docs/en/cloud-environments#network-access
4. **Abra uma sessão nova.** As credenciais só valem para sessões iniciadas depois da mudança.

---

## Parte B — Medir a CPU real (pode ser feito ainda no plano gratuito)

Com a Parte A pronta, o Claude publica o Worker de medição (`tools/auth-bench`) e lê o tempo de CPU de cada algoritmo direto da Cloudflare:

```bash
npm run bench:auth:deploy
npx wrangler tail gavealab-auth-bench --format json   # campo "cpuTime" de cada pedido
```

No plano gratuito, os pedidos de senha devem aparecer como "excedeu o limite de CPU", o que confirma a necessidade do plano pago. Depois da medição, o Worker de medição é apagado (`npx wrangler delete --name gavealab-auth-bench`).

---

## Parte C — Contratar o Workers Paid (quando você decidir)

1. No painel: **Workers & Pages → Plans** (ou **Compute (Workers) → Plans**).
2. Escolha **Workers Paid**, US$ 5/mês, e informe o cartão.
3. O que está incluído e é suficiente para 500–600 membros:
   - 10 milhões de pedidos por mês;
   - 30 milhões de ms de CPU por mês. Mil logins por mês gastam cerca de 0,5 milhão.
   - D1 e R2 continuam dentro das cotas gratuitas nesse volume.
4. O projeto limita cada pedido a 2 s de CPU (`limits.cpu_ms`), para que nenhum abuso gere custo extra.
   - Numa conta ainda no plano gratuito, a publicação com esse limite é recusada.
   - Isso é esperado: funciona como trava para não publicar a área de membros antes do plano certo.

---

## Parte D — Publicar o ambiente de teste (o Claude faz, com sua autorização)

1. Criar banco e bucket:
   ```bash
   npx wrangler d1 create gavealab-membros-teste          # copiar o database_id para env.teste
   npx wrangler r2 bucket create gavealab-membros-fotos-teste
   ```
2. **Turnstile:** no painel, **Turnstile → Add widget**, com hostname `gavealab-membros-teste.<sua-conta>.workers.dev`. A chave pública vai em `env.teste.vars.TURNSTILE_SITE_KEY`; a secreta vira segredo:
   ```bash
   npx wrangler secret put TURNSTILE_SECRET --env teste
   ```
3. **Resend:** crie a conta gratuita em resend.com e uma API key. Para enviar como `@gavealab.com.br`, adicione os registros DNS que o Resend indicar. Sem isso, nesta etapa dá para enviar só para o seu próprio e-mail, usando `onboarding@resend.dev` como remetente.
   ```bash
   npx wrangler secret put RESEND_API_KEY --env teste
   ```
4. Preencher `APP_URL` em `env.teste` com o endereço `workers.dev` da conta.
5. Aplicar o banco e publicar (os testes automáticos rodam antes, e a publicação para se algum falhar):
   ```bash
   npm run db:migrate:teste
   npm run deploy:teste
   ```
6. Primeiro admin:
   ```bash
   node scripts/create-admin-invite.mjs --email voce@gavealab.com.br --name "Seu nome" --remote --env teste --url https://gavealab-membros-teste.<sua-conta>.workers.dev
   ```

---

## Parte E — `membros.gavealab.com.br` (decisão futura)

Um domínio próprio num Worker exige que o **DNS de gavealab.com.br seja gerenciado pela Cloudflare**. Hoje ele provavelmente está no WordPress.com.

As opções (a decidir antes da produção):
1. **Levar o DNS para a Cloudflare (plano gratuito).** O site continua hospedado no WordPress.com; só muda quem responde pelo DNS.
   - É preciso copiar todos os registros atuais (site, e-mail, verificações) antes de trocar os nameservers.
   - É a opção mais comum e sem custo, mas precisa ser feita com cuidado para não derrubar o e-mail.
2. **Usar um domínio separado** só para a área de membros, já na Cloudflare.
3. **Manter o endereço `workers.dev`**, sem domínio próprio.

Nenhuma delas altera o conteúdo do WordPress.
