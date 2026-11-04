import { type Env, isProduction } from "../env";

interface Mail {
  to: string;
  subject: string;
  heading: string;
  paragraphs: string[];
  actionLabel: string;
  actionUrl: string;
  footnote: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

function render(m: Mail) {
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f7f7f5;font-family:Arial,Helvetica,sans-serif;color:#17121a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e4dfe8">
<tr><td style="background:#25082f;color:#ffffff;padding:22px 28px;font-size:15px;font-weight:bold">GáveaLab | Communities</td></tr>
<tr><td style="height:4px;background:linear-gradient(100deg,#fff200 0%,#72ec25 50%,#05e4de 100%);background-color:#72ec25"></td></tr>
<tr><td style="padding:32px 28px">
<h1 style="font-size:24px;line-height:1.2;margin:0 0 18px;color:#25082f">${esc(m.heading)}</h1>
${m.paragraphs.map((p) => `<p style="font-size:15px;line-height:1.6;margin:0 0 14px">${esc(p)}</p>`).join("")}
<p style="margin:26px 0"><a href="${esc(m.actionUrl)}" style="display:inline-block;background:#25082f;color:#ffffff;padding:14px 22px;font-weight:bold;text-decoration:none;font-size:15px">${esc(m.actionLabel)}</a></p>
<p style="font-size:13px;line-height:1.5;color:#655c68;margin:0">${esc(m.footnote)}</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = `${m.heading}\n\n${m.paragraphs.join("\n\n")}\n\n${m.actionLabel}: ${m.actionUrl}\n\n${m.footnote}\n`;
  return { html, text };
}

export async function sendMail(env: Env, m: Mail): Promise<void> {
  const { html, text } = render(m);
  if (env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [m.to], subject: m.subject, html, text }),
    });
    if (!res.ok) throw new Error(`Falha ao enviar e-mail (${res.status})`);
    return;
  }
  if (isProduction(env)) throw new Error("Envio de e-mail não configurado");
  // Desenvolvimento: guarda na caixa de saída local para inspeção.
  await env.DB.prepare("INSERT INTO dev_outbox (to_email, subject, html, text) VALUES (?, ?, ?, ?)")
    .bind(m.to, m.subject, html, text)
    .run();
}

export function inviteMail(env: Env, to: string, name: string, token: string, communities: string[]): Mail {
  const list = communities.length ? communities.join(", ") : "GáveaLab | Communities";
  return {
    to,
    subject: "Seu convite para a GáveaLab | Communities",
    heading: `Olá, ${name.split(" ")[0]}.`,
    paragraphs: [
      `Você foi convidado(a) para participar de: ${list}.`,
      "A participação é por convite. Para aceitar, crie sua senha no link abaixo e complete seu perfil.",
    ],
    actionLabel: "Aceitar convite",
    actionUrl: `${env.APP_URL}/convite#token=${token}`,
    footnote: "O link é pessoal e vale por 7 dias. Se você não esperava este convite, ignore esta mensagem.",
  };
}

export function resetMail(env: Env, to: string, token: string): Mail {
  return {
    to,
    subject: "Redefinição de senha — GáveaLab | Communities",
    heading: "Redefinição de senha",
    paragraphs: ["Recebemos um pedido para redefinir a senha da sua conta na área de membros."],
    actionLabel: "Criar nova senha",
    actionUrl: `${env.APP_URL}/redefinir-senha#token=${token}`,
    footnote: "O link vale por 1 hora e só pode ser usado uma vez. Se você não fez este pedido, ignore esta mensagem; sua senha continua a mesma.",
  };
}
