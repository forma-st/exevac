import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { decrypt, encrypt, newTotpSecret, otpauthUri, required2faRoles } from "@/lib/security";
import { Logo } from "@/components/Logo";
import { TotpEnrollForm } from "@/components/TotpSetup";
import { enableTotp } from "./actions";

export const metadata = { title: "Activer la double authentification" };
export const dynamic = "force-dynamic";

export default async function Enroll({ searchParams }: { searchParams: Promise<{ retour?: string }> }) {
  const u = await currentUser();
  if (!u) redirect("/login");
  const { retour } = await searchParams;
  const next = retour?.startsWith("/") && !retour.startsWith("//") ? retour : "/";
  // Une fois activée, la page reste affichée (même arbre React) pour que les codes de secours
  // renvoyés par l'action ne disparaissent pas lors du rafraîchissement.
  if (u.totpEnabled) return <Shell><TotpEnrollForm action={enableTotp} next={next} enabled /></Shell>;
  // clé en attente de confirmation (régénérée tant que la double authentification n'est pas activée)
  let secret = u.totpSecret ? decrypt(u.totpSecret) : null;
  if (!secret) {
    secret = newTotpSecret();
    await db.user.update({ where: { id: u.id }, data: { totpSecret: encrypt(secret) } });
  }
  const uri = otpauthUri(secret, u.email);
  const svg = await QRCode.toString(uri, { type: "svg", margin: 1, width: 220, errorCorrectionLevel: "M" });
  const mandatory = (await required2faRoles()).includes(u.role);
  return (
    <Shell intro={<>
        <div>
          <h1 className="text-xl font-semibold">Activer la double authentification</h1>
          <p className="mt-1 text-sm text-slate-600">
            {mandatory ? "Elle est obligatoire pour votre rôle. " : ""}En plus du mot de passe, un code à 6 chiffres généré par votre téléphone sera demandé à la connexion.
          </p>
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>Installez une application d'authentification : <b>Google Authenticator</b>, <b>Microsoft Authenticator</b>, ou celle de votre gestionnaire de mots de passe.</li>
          <li>Dans l'application : « Ajouter un compte », puis scannez ce QR code.</li>
          <li>Saisissez le code à 6 chiffres affiché.</li>
        </ol>
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-start">
          <div className="h-[220px] w-[220px] shrink-0 rounded-lg border border-slate-200 bg-white" dangerouslySetInnerHTML={{ __html: svg }} aria-label="QR code à scanner" />
          <div className="text-xs text-slate-500">
            Impossible de scanner ? Saisissez cette clé à la main :
            <code className="mt-1 block rounded bg-slate-100 p-2 font-mono text-sm break-all text-slate-800">{secret.match(/.{1,4}/g)!.join(" ")}</code>
          </div>
        </div>
      </>}>
      <TotpEnrollForm action={enableTotp} next={next} />
    </Shell>
  );
}

function Shell({ intro, children }: { intro?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="card w-full max-w-lg space-y-5 p-6">
        <Logo className="h-11" />
        {intro ? <div className="space-y-5">{intro}</div> : null}
        {children}
      </div>
    </div>
  );
}
