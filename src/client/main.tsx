import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api } from "./api";
import { Loading } from "./components/ui";
import AdminAudit from "./pages/admin/Audit";
import AdminInvitations from "./pages/admin/Invitations";
import AdminMember from "./pages/admin/Member";
import AdminMembers from "./pages/admin/Members";
import AdminOverview from "./pages/admin/Overview";
import { AcceptInvite, Forgot, Login, ResetPassword } from "./pages/Auth";
import Community from "./pages/Community";
import DevOutbox from "./pages/DevOutbox";
import EditProfile from "./pages/EditProfile";
import Home from "./pages/Home";
import Member from "./pages/Member";
import { SessionProvider, useSession } from "./session";
import "./styles/app.css";

function Shell() {
  const { me, setMe } = useSession();
  const navigate = useNavigate();
  const logout = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    setMe(null);
    navigate("/entrar");
  };
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/" className="wordmark">
            GáveaLab <small>| Communities</small>
          </NavLink>
          {me && (
            <nav className="nav" aria-label="Principal">
              <NavLink to="/" end>
                Início
              </NavLink>
              <NavLink to="/perfil">Meu perfil</NavLink>
              {me.user.is_admin && <NavLink to="/admin">Administração</NavLink>}
              <button type="button" onClick={logout}>
                Sair
              </button>
            </nav>
          )}
        </div>
      </header>
      <div className="gradient-rule" />
      <main>
        <Outlet />
      </main>
      <footer className="footer">
        <a href="https://gavealab.com.br/communities/">gavealab.com.br</a>·<a href="https://gavealab.com.br/privacidade/">Política de Privacidade</a>
      </footer>
    </>
  );
}

function RequireAuth({ admin, children }: { admin?: boolean; children: ReactNode }) {
  const { me, loading } = useSession();
  const location = useLocation();
  if (loading) return <div className="page"><Loading /></div>;
  if (!me) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  if (admin && !me.user.is_admin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/entrar" element={<Login />} />
        <Route path="/esqueci-senha" element={<Forgot />} />
        <Route path="/redefinir-senha" element={<ResetPassword />} />
        <Route path="/convite" element={<AcceptInvite />} />
        <Route path="/dev/emails" element={<DevOutbox />} />
        <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
        <Route path="/perfil" element={<RequireAuth><EditProfile /></RequireAuth>} />
        <Route path="/comunidades/:slug" element={<RequireAuth><Community /></RequireAuth>} />
        <Route path="/membros/:id" element={<RequireAuth><Member /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth admin><AdminOverview /></RequireAuth>} />
        <Route path="/admin/convites" element={<RequireAuth admin><AdminInvitations /></RequireAuth>} />
        <Route path="/admin/membros" element={<RequireAuth admin><AdminMembers /></RequireAuth>} />
        <Route path="/admin/membros/:id" element={<RequireAuth admin><AdminMember /></RequireAuth>} />
        <Route path="/admin/registro" element={<RequireAuth admin><AdminAudit /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
