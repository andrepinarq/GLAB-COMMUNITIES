import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, tokenFromHash } from "../api";
import { Alert, Eyebrow, Loading, Title, Turnstile } from "../components/ui";
import { useSession } from "../session";

function useSubmit() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      setResetKey((k) => k + 1); // novo desafio anti-robô após erro
    } finally {
      setBusy(false);
    }
  };
  return { error, busy, run, resetKey };
}

function PasswordField({ value, onChange, label = "Senha", autoComplete = "new-password" }: { value: string; onChange: (v: string) => void; label?: string; autoComplete?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor="password">{label}</label>
      <input id="password" type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required minLength={autoComplete === "new-password" ? 10 : undefined} maxLength={128} />
      <small>
        {autoComplete === "new-password" && "Pelo menos 10 caracteres. Uma frase longa é mais segura que uma palavra complicada. "}
        <button type="button" className="text-link" style={{ padding: 0, fontSize: ".8rem", borderBottomWidth: 1 }} onClick={() => setShow(!show)}>
          {show ? "Ocultar senha" : "Mostrar senha"}
        </button>
      </small>
    </div>
  );
}

export function Login() {
  const { me, refresh } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const { error, busy, run, resetKey } = useSubmit();
  useEffect(() => {
    if (me) navigate("/", { replace: true });
  }, [me, navigate]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api("/auth/login", { body: { email, password, turnstileToken: token } });
      await refresh();
      navigate((location.state as { from?: string })?.from ?? "/", { replace: true });
    });
  };
  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <Eyebrow>Área de membros</Eyebrow>
        <Title>Entrar</Title>
        <p className="hint">A participação nas comunidades é somente por convite.</p>
        <Alert error={error} />
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </div>
        <PasswordField value={password} onChange={setPassword} autoComplete="current-password" />
        <Turnstile onToken={setToken} resetKey={resetKey} />
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <button className="button button-gradient" disabled={busy || !token}>
            {busy ? "Entrando…" : "Entrar"} <span>→</span>
          </button>
          <Link to="/esqueci-senha" className="hint">
            Esqueci minha senha
          </Link>
        </div>
      </form>
    </div>
  );
}

export function Forgot() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const { error, busy, run, resetKey } = useSubmit();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const r = await api<{ message: string }>("/auth/forgot", { body: { email, turnstileToken: token } });
      setDone(r.message);
    });
  };
  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <Eyebrow>Área de membros</Eyebrow>
        <Title>Recuperar senha</Title>
        {done ? (
          <>
            <div className="notice">{done}</div>
            <p className="hint">O link vale por 1 hora. Confira também a caixa de spam.</p>
            <Link to="/entrar" className="text-link">
              Voltar para o login <span>←</span>
            </Link>
          </>
        ) : (
          <>
            <p className="hint">Informe o e-mail da sua conta. Enviaremos um link para você criar uma nova senha.</p>
            <Alert error={error} />
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
            </div>
            <Turnstile onToken={setToken} resetKey={resetKey} />
            <div className="actions" style={{ justifyContent: "space-between" }}>
              <button className="button" disabled={busy || !token}>
                Enviar link <span>→</span>
              </button>
              <Link to="/entrar" className="hint">
                Voltar
              </Link>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

export function ResetPassword() {
  const { refresh } = useSession();
  const navigate = useNavigate();
  const [resetToken] = useState(tokenFromHash);
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const { error, busy, run, resetKey } = useSubmit();
  useEffect(() => {
    if (window.location.hash) history.replaceState(null, "", window.location.pathname); // tira o token da barra de endereço
  }, []);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api("/auth/reset", { body: { token: resetToken, password, turnstileToken: token } });
      await refresh();
      navigate("/", { replace: true });
    });
  };
  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <Eyebrow>Área de membros</Eyebrow>
        <Title>Nova senha</Title>
        {!resetToken ? (
          <div className="alert">Link incompleto. Abra novamente o link recebido por e-mail ou peça um novo.</div>
        ) : (
          <>
            <p className="hint">Ao salvar, você sai automaticamente de todos os outros dispositivos.</p>
            <Alert error={error} />
            <PasswordField value={password} onChange={setPassword} label="Nova senha" />
            <Turnstile onToken={setToken} resetKey={resetKey} />
            <button className="button button-gradient" disabled={busy || !token}>
              Salvar nova senha <span>→</span>
            </button>
          </>
        )}
        <p style={{ marginTop: 20 }}>
          <Link to="/esqueci-senha" className="hint">
            Pedir um novo link
          </Link>
        </p>
      </form>
    </div>
  );
}

export function AcceptInvite() {
  const { refresh } = useSession();
  const navigate = useNavigate();
  const [inviteToken] = useState(tokenFromHash);
  const [invite, setInvite] = useState<{ email: string; full_name: string; communities: string[] } | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(inviteToken ? null : "Link de convite incompleto.");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [token, setToken] = useState("");
  const { error, busy, run, resetKey } = useSubmit();

  useEffect(() => {
    if (window.location.hash) history.replaceState(null, "", window.location.pathname);
    if (!inviteToken) return;
    api<{ email: string; full_name: string; communities: string[] }>("/auth/invite/lookup", { body: { token: inviteToken } })
      .then((r) => {
        setInvite(r);
        setName(r.full_name);
      })
      .catch((e) => setLookupError(e.message));
  }, [inviteToken]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api("/auth/invite/accept", { body: { token: inviteToken, full_name: name, password, accept_terms: terms, turnstileToken: token } });
      await refresh();
      navigate("/perfil?boas-vindas=1", { replace: true });
    });
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <Eyebrow>Convite</Eyebrow>
        <Title>Boas-vindas</Title>
        {lookupError ? (
          <>
            <div className="alert">{lookupError}</div>
            <p className="hint">Se precisar de um novo convite, fale com a equipe do GáveaLab: contato@gavealab.com.br</p>
          </>
        ) : !invite ? (
          <Loading />
        ) : (
          <>
            <p>
              Você foi convidado(a) para: <strong>{invite.communities.join(", ")}</strong>.
            </p>
            <p className="hint">Crie sua senha para ativar o acesso. Depois, você poderá completar seu perfil.</p>
            <Alert error={error} />
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input id="email" type="email" value={invite.email} readOnly autoComplete="username" />
            </div>
            <div className="field">
              <label htmlFor="name">Nome completo</label>
              <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
            </div>
            <PasswordField value={password} onChange={setPassword} label="Crie uma senha" />
            <label className="check">
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
              <span>
                Li e aceito a{" "}
                <a href="https://gavealab.com.br/privacidade/" target="_blank" rel="noreferrer">
                  Política de Privacidade
                </a>
                . Entendo que meu perfil será visível apenas para membros das comunidades de que participo.
              </span>
            </label>
            <Turnstile onToken={setToken} resetKey={resetKey} />
            <button className="button button-gradient" disabled={busy || !token || !terms}>
              Ativar meu acesso <span>→</span>
            </button>
          </>
        )}
      </form>
    </div>
  );
}
