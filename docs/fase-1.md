# Fase 1 — Relatório técnico

## Teste 1: a autenticação segura cabe no Workers Free?

**Não.** O limite do plano gratuito é de 10 ms de CPU por pedido. Qualquer algoritmo de senha nos parâmetros mínimos da OWASP custa muito mais do que isso. O custo alto é proposital: é ele que impede um atacante que roube o banco de testar bilhões de senhas.

Medição no runtime dos Workers (workerd local, Intel Xeon 2,8 GHz), 8 execuções por algoritmo (`tools/auth-bench`):

| Algoritmo (parâmetros OWASP) | Tempo por cálculo | Cabe em 10 ms? |
|---|---|---|
| PBKDF2-SHA256, 600.000 iterações (escolhido) | 320–460 ms | Não, cerca de 40× acima |
| PBKDF2-SHA256, 100.000 iterações (abaixo da OWASP) | 55–94 ms | Não |
| Argon2id / scrypt / bcrypt via WebAssembly | Não executam: o Workers proíbe compilar WebAssembly em tempo de execução | — |
| Login completo pela API (com banco) | 420–475 ms | Não |
| Rota comum (lista de membros, tempo total com banco) | cerca de 21 ms, quase tudo espera pelo banco | Sim, na prática |

Os servidores da Cloudflare podem ser até 2× mais rápidos que esta máquina, o que ainda deixa o login 20× acima do limite. A confirmação exata no ambiente real exige publicar o Worker de medição numa conta Cloudflare e ler o `cpuTime` de cada pedido (`wrangler tail`). Isso ainda não foi feito, porque esta sessão não tem acesso a uma conta.

**Conclusão:** login, aceite de convite, redefinição e troca de senha precisam do **Workers Paid (US$ 5/mês)**, que dá até 30 s de CPU por pedido. O código é o mesmo nos dois planos; nada na arquitetura muda. Nenhuma redução de segurança foi feita para caber no plano gratuito.

**Alternativas que mantêm o custo zero sem reduzir a segurança** (exigiriam mudar a decisão "login e senha"):
- Entrada por link mágico enviado por e-mail, opcionalmente com chave de acesso (passkey). Não há senha guardada, então o custo de CPU é mínimo.
- Calcular o hash pesado no navegador e um hash leve no servidor ("server relief"). É uma técnica legítima, mas não padronizada e mais difícil de auditar. Não recomendo.

## Teste 2: Workers com arquivos estáticos ou Pages?

**Workers com arquivos estáticos.** É o caminho que a própria Cloudflare indica para projetos novos.
- Um único projeto e uma única publicação, servindo as telas e a API.
- Tarefas agendadas (o backup semanal) só existem nos Workers.
- Pedidos a arquivos estáticos não contam como execução nem consomem CPU.
- O arquivo `_headers` aplica a política de segurança (CSP, HSTS etc.) às telas.
- Mesmos limites gratuitos; não há vantagem em usar o Pages.

## Segurança implementada

- Senhas com PBKDF2-SHA256 (600.000 iterações, sal aleatório). O formato permite subir o custo no futuro.
- Sessão em cookie `__Host-`, HttpOnly, Secure, SameSite=Lax; o banco guarda só o hash do token. Duração de 14 dias, renovada com o uso.
- Troca ou redefinição de senha encerra as outras sessões. Suspensão da conta encerra todas.
- Pedidos que alteram dados só são aceitos vindos do próprio site (proteção contra CSRF).
- Limite de tentativas no banco: 8 logins por e-mail e 30 por IP a cada 15 minutos, além de limites para recuperação de senha, convites e envio de fotos.
- Turnstile no login, na recuperação de senha, na redefinição e no aceite de convite.
- Mensagens e tempo de resposta iguais para "e-mail inexistente" e "senha errada". A recuperação de senha não revela se a conta existe.
- Tokens de convite (7 dias) e de redefinição (1 hora) são de uso único e guardados só como hash. Ficam no fragmento da URL (`#token=`), que não aparece nos registros do servidor.
- Convites feitos pelo painel nunca concedem acesso de administrador. O primeiro admin só é criado pelo script de linha de comando.
- Fotos em bucket privado, entregues só a quem pode ver o perfil. O tipo real do arquivo é conferido pelos primeiros bytes; limite de 2 MB.
- Perfil sem permissão responde "não encontrado". De outra pessoa, só aparecem as comunidades e os selos em comum.
- Cabeçalhos: CSP restritiva, HSTS, `X-Frame-Options: DENY`, `nosniff`, `no-referrer`, `noindex`.
- Fontes hospedadas no próprio servidor (nenhuma chamada ao Google).
- Em produção, a API não funciona se faltar configuração de segurança.
- Registro de todas as ações administrativas.

## Pendências conhecidas

- O Worker de medição ainda não rodou numa conta Cloudflare real (depende de uma conta e de uma credencial).
- O logo oficial não foi baixado (a rede desta sessão bloqueia o WordPress); o cabeçalho usa o nome em texto.
- `npm audit` aponta alertas em `sharp` e `undici`. São dependências só das ferramentas de desenvolvimento e teste; não vão para o site publicado.
- Política de Privacidade do site precisa mencionar a área de membros (perfis, fotos, diretório).
