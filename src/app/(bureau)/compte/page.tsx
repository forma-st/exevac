import { requireStaff, roleLabel } from "@/lib/auth";
import { ResultForm } from "@/components/ResultForm";
import { Card, Field, PageHeader } from "@/components/ui";
import { changePassword, updateProfile } from "../actions";

export const metadata = { title: "Mon compte" };

export default async function Account() {
  const u = await requireStaff();
  return (
    <>
      <PageHeader title="Mon compte" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Mon profil">
          <ResultForm action={updateProfile} submit="Enregistrer">
            <Field label="Nom (repris dans « Créé par » sur les rapports)"><input name="name" defaultValue={u.name} required className="input" /></Field>
            <p className="text-sm text-slate-500">E-mail : {u.email} · Rôle : {roleLabel(u.role)}</p>
          </ResultForm>
        </Card>
        <Card title="Mot de passe">
          <ResultForm action={changePassword} submit="Changer le mot de passe">
            <Field label="Mot de passe actuel"><input name="current" type="password" required className="input" autoComplete="current-password" /></Field>
            <Field label="Nouveau mot de passe (10 caractères min.)"><input name="next" type="password" minLength={10} required className="input" autoComplete="new-password" /></Field>
            <Field label="Confirmer"><input name="confirm" type="password" minLength={10} required className="input" autoComplete="new-password" /></Field>
          </ResultForm>
        </Card>
        <Card title="Double authentification">
          <p className="text-sm text-slate-600">
            {u.totpEnabled
              ? "Activée : un code à 6 chiffres de votre téléphone est demandé à chaque connexion. Téléphone perdu ? Un administrateur peut la réinitialiser."
              : "En plus du mot de passe, un code à 6 chiffres généré par votre téléphone est demandé à la connexion."}
          </p>
          {!u.totpEnabled && <a href="/deux-facteurs?retour=/compte" className="btn-secondary mt-3">Activer la double authentification</a>}
        </Card>
      </div>
    </>
  );
}
