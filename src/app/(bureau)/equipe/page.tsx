import { db } from "@/lib/db";
import { ROLES, requireAdmin, roleLabel } from "@/lib/auth";
import { ResultForm } from "@/components/ResultForm";
import { UserRowActions } from "@/components/UserRowActions";
import { Badge, Card, PageHeader } from "@/components/ui";
import { createUser, deleteUser, resetUserPassword, resetUserTotp, setUserActive, setUserRole } from "../actions";

export const metadata = { title: "Équipe" };

export default async function Team() {
  const me = await requireAdmin();
  const users = await db.user.findMany({ include: { _count: { select: { evacuationReports: true } } }, orderBy: [{ active: "desc" }, { name: "asc" }] });
  return (
    <div className="space-y-6">
      <PageHeader title="Équipe" subtitle="Chaque formateur a son propre compte. Le mot de passe provisoire s'affiche une seule fois : transmettez-le, il le changera dans « Mon compte »." />
      <Card title="Ajouter un compte">
        <ResultForm action={createUser} submit="Créer le compte">
          <div className="grid gap-3 sm:grid-cols-3">
            <input name="name" placeholder="Nom complet" required className="input" />
            <input name="email" type="email" placeholder="E-mail" required className="input" />
            <select name="role" className="input" defaultValue="FORMATEUR">
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
        </ResultForm>
        <ul className="mt-4 space-y-1 text-xs text-slate-500">
          {ROLES.map((r) => <li key={r.id}><b>{r.label}</b> : {r.help}</li>)}
        </ul>
      </Card>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Compte</th><th>Rôle</th><th>Rapports</th><th>Dernière connexion</th><th className="text-right">Actions</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                <td>
                  <div className="font-medium">{u.name} {!u.active && <Badge className="bg-slate-200 text-slate-600">Désactivé</Badge>}</div>
                  <div className="text-xs text-slate-500">{u.email}{u.totpEnabled ? " · double authentification active" : ""}</div>
                </td>
                <td>{roleLabel(u.role)}</td>
                <td>{u._count.evacuationReports}</td>
                <td className="text-xs whitespace-nowrap text-slate-500">{u.lastLoginAt ? u.lastLoginAt.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }) : "jamais"}</td>
                <td>
                  <UserRowActions
                    id={u.id} name={u.name} role={u.role} active={u.active} isMe={u.id === me.id}
                    onRole={setUserRole} onActive={setUserActive} onReset={resetUserPassword} onDelete={deleteUser} onResetTotp={resetUserTotp}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
