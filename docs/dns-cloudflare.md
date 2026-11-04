# Levar o DNS de gavealab.com.br para a Cloudflare

**Decisão:** o site continua hospedado no WordPress.com e o e-mail continua no Titan. Só muda quem responde pelo DNS: sai o WordPress.com e entra a Cloudflare, no plano gratuito.

Isso permite ligar `membros.gavealab.com.br` ao Worker da área de membros.

## Situação atual (lida em 04/11/2026, sem alterações)

- **Registro do domínio:** WordPress.com, ativo até 17/08/2027, com renovação automática. A troca de nameservers é feita no próprio WordPress.com.
- **Nameservers:** WordPress.com.
- **DNSSEC:** desligado. Isso é bom: precisa estar desligado durante a troca.
- **SSL do site:** ativo, emitido pelo WordPress.com.
- **E-mail:** Titan (WordPress.com Professional Email).

### Registros que precisam ser copiados para a Cloudflare

| Tipo | Nome | Valor | Para quê |
|---|---|---|---|
| A | `gavealab.com.br` | `192.0.78.24` | site (WordPress.com) |
| A | `gavealab.com.br` | `192.0.78.25` | site (WordPress.com) |
| CNAME | `www` | `gavealab.com.br` | site com www |
| MX | `gavealab.com.br` | `mx1.titan.email`, prioridade 10 | receber e-mail |
| MX | `gavealab.com.br` | `mx2.titan.email`, prioridade 20 | receber e-mail (reserva) |
| TXT | `gavealab.com.br` | `v=spf1 include:spf.titan.email ~all` | SPF do e-mail |
| TXT | `titan1._domainkey` | `v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCzkMJqAmBUt44MM3/C1jMADe+qAEYmqySWOBcloI7oMua4oiR8jFN1OadR2UqtBnMMbyWVIdU4MBDdw6MrJqqSZERBzgYYmMV6uCJ0IQjR4w4Xsr2ziSP1Y0fr/e3IBcfy4kDbNkFn0T20xCuHludCzoMcWjENVA3SisVJva743wIDAQAB` | assinatura DKIM |
| TXT | `_dmarc` | `v=DMARC1;p=none;sp=none;adkim=r;aspf=r;pct=100` | política DMARC |

O WordPress.com esconde o valor dos registros A protegidos. Os IPs `192.0.78.24` e `192.0.78.25` são os que o WordPress.com indica para domínios com DNS externo. **Confira-os** contra o que a Cloudflare encontrar na varredura automática (passo 2).

## Regras importantes

1. **Os registros do site e do e-mail ficam com a nuvem cinza (DNS only), nunca laranja.** Com a nuvem laranja (proxy), a Cloudflare fica no meio do caminho e o WordPress.com não consegue renovar o certificado SSL do site. O e-mail, por sua vez, nunca passa pelo proxy.
2. **Crie a zona na Cloudflare antes de trocar os nameservers.** Domínios `.com.br` são validados pelo Registro.br, que só aceita os novos nameservers se eles já responderem pela zona.
3. **Faça a troca num horário de pouco movimento.** A propagação leva de minutos a algumas horas. Durante esse tempo, os dois DNS respondem com os mesmos registros, então ninguém deve perceber diferença.

## Passo a passo

### 1. Adicionar o domínio na Cloudflare
No painel Cloudflare: **Add a domain → `gavealab.com.br` → plano Free**. Desligue a opção de importar automaticamente se quiser revisar registro por registro; o recomendado é deixar importar e revisar depois.

### 2. Conferir os registros
Na tela de DNS da Cloudflare, compare com a tabela acima:
- todos os registros estão lá, com os mesmos valores;
- os registros A e o CNAME `www` estão com a **nuvem cinza**;
- não sobrou nenhum registro estranho da varredura. Apague os que não estiverem na tabela.

### 3. Anotar os dois nameservers da Cloudflare
A Cloudflare mostra dois nomes no formato `nome.ns.cloudflare.com`.

### 4. Trocar os nameservers no WordPress.com
**WordPress.com → Domínios → gavealab.com.br → Servidores de nomes → desligar "Usar servidores de nomes do WordPress.com" → informar os dois da Cloudflare → Salvar.**

A partir desse momento, o painel de DNS do WordPress.com deixa de valer. Mudanças de DNS passam a ser feitas só na Cloudflare.

### 5. Aguardar e verificar
A Cloudflare envia um e-mail quando a zona fica ativa, em geral de 1 a 24 horas depois. Nesse período, confira:
- [ ] `https://gavealab.com.br` e `https://www.gavealab.com.br` abrem normalmente, com o cadeado;
- [ ] um e-mail enviado de fora para `contato@gavealab.com.br` chega;
- [ ] um e-mail enviado de `contato@gavealab.com.br` chega a um Gmail sem cair no spam;
- [ ] no Gmail, em "Mostrar original", aparecem SPF, DKIM e DMARC como `PASS`.

### 6. Depois de ativo (opcional)
- Ativar o **DNSSEC** pela Cloudflare. Ela indica o registro DS que precisa ser informado no WordPress.com.
- Adicionar os registros do **Resend**, que a Cloudflare permite criar com um clique pelo painel do Resend. Eles ficam no subdomínio `send.`, sem conflito com o Titan.

## Se algo der errado (como voltar)

No WordPress.com, em Servidores de nomes, **religue "Usar servidores de nomes do WordPress.com"**.
- Os registros antigos continuam guardados lá.
- A volta também leva de minutos a algumas horas para propagar.
- Nada no conteúdo do site ou nas caixas de e-mail é perdido em nenhum dos sentidos.

## Depois da migração: a área de membros

`membros.gavealab.com.br` não precisa de registro manual. Ao publicar o ambiente `producao`, o próprio Worker cria o registro e o certificado do subdomínio, porque `custom_domain: true` está configurado em `wrangler.jsonc`. Isso só será feito com a sua aprovação.
