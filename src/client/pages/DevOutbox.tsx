import { useEffect, useState } from "react";
import { api } from "../api";
import { Alert, Eyebrow, Title } from "../components/ui";

interface Mail {
  id: number;
  to_email: string;
  subject: string;
  html: string;
  created_at: string;
}

/** Caixa de saída local: só existe em desenvolvimento, quando ainda não há Resend configurado. */
export default function DevOutbox() {
  const [emails, setEmails] = useState<Mail[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ emails: Mail[] }>("/dev/outbox").then((r) => setEmails(r.emails)).catch((e) => setError(e.message));
  }, []);
  return (
    <div className="page">
      <Eyebrow>Ambiente de teste</Eyebrow>
      <Title>E-mails enviados</Title>
      <p className="lead">Em produção, estes e-mails saem pelo Resend. Aqui eles ficam guardados para teste.</p>
      <Alert error={error} />
      {emails?.length === 0 && <div className="empty">Nenhum e-mail ainda.</div>}
      {emails?.map((m) => (
        <div key={m.id} className="panel">
          <p className="hint" style={{ margin: "0 0 8px" }}>
            Para <strong>{m.to_email}</strong> · {new Date(m.created_at).toLocaleString("pt-BR")}
          </p>
          <h3 style={{ textTransform: "none", letterSpacing: 0, fontFamily: "var(--font-head)", color: "var(--plum)" }}>{m.subject}</h3>
          <iframe title={m.subject} srcDoc={m.html} sandbox="allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation" style={{ width: "100%", height: 460, border: "1px solid var(--line)" }} />
        </div>
      ))}
    </div>
  );
}
