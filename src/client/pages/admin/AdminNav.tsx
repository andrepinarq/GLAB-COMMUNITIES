import { NavLink } from "react-router-dom";
import { Eyebrow } from "../../components/ui";

export default function AdminNav() {
  return (
    <>
      <Eyebrow>Administração</Eyebrow>
      <nav className="admin-tabs" aria-label="Administração">
        <NavLink to="/admin" end>Visão geral e convites</NavLink>
        <NavLink to="/admin/convites">Convites enviados</NavLink>
        <NavLink to="/admin/membros">Membros</NavLink>
        <NavLink to="/admin/registro">Registro de ações</NavLink>
      </nav>
    </>
  );
}
