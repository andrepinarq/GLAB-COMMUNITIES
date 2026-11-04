import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Profile } from "../api";
import { Alert, Loading } from "../components/ui";
import { ProfileView } from "../components/ProfileView";
import { useSession } from "../session";

export default function Member() {
  const { id } = useParams();
  const { me } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setProfile(null);
    api<{ profile: Profile }>(`/members/${id}`).then((r) => setProfile(r.profile)).catch((e) => setError(e.message));
  }, [id]);
  if (error) return <div className="page"><Alert error={error} /></div>;
  if (!profile) return <div className="page"><Loading /></div>;
  return (
    <div className="page">
      <ProfileView profile={profile} />
      <div className="actions">
        {me?.user.id === profile.id && (
          <Link className="button" to="/perfil">
            Editar meu perfil <span>→</span>
          </Link>
        )}
        {me?.user.is_admin && me.user.id !== profile.id && (
          <Link className="button button-ghost" to={`/admin/membros/${profile.id}`}>
            Gerenciar na administração <span>→</span>
          </Link>
        )}
      </div>
    </div>
  );
}
