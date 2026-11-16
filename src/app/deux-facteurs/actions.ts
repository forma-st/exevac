"use server";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { createSession, currentUser, revokeSessions } from "@/lib/auth";
import { audit, decrypt, newRecoveryCodes, required2faRoles, verifyTotp } from "@/lib/security";

export type TotpState = { error?: string; codes?: string[] } | null;

async function me() {
  const u = await currentUser();
  if (!u) throw new Error("Non autorisé");
  return u;
}

/** Confirme l'activation avec un premier code ; renvoie les codes de secours (affichés une seule fois). */
export async function enableTotp(_: TotpState, f: FormData): Promise<TotpState> {
  const u = await me();
  if (!u.totpSecret) return { error: "Rechargez la page pour générer une nouvelle clé." };
  const step = verifyTotp(decrypt(u.totpSecret), String(f.get("code") ?? ""), null);
  if (step === null) return { error: "Code invalide : vérifiez l'heure de votre téléphone et réessayez." };
  const { codes, stored } = newRecoveryCodes();
  const updated = await db.user.update({ where: { id: u.id }, data: { totpEnabled: true, totpLastStep: step, recoveryCodes: stored, sessionVersion: { increment: 1 } } });
  await createSession(updated); // les autres appareils devront se reconnecter avec le code
  await audit("TOTP_ON", { userId: u.id, email: u.email });
  revalidatePath("/parametres/securite");
  return { codes };
}

/** Nouveaux codes de secours (les anciens deviennent invalides). */
export async function regenerateRecovery(): Promise<TotpState> {
  const u = await me();
  if (!u.totpEnabled) return { error: "La double authentification n'est pas activée." };
  const { codes, stored } = newRecoveryCodes();
  await db.user.update({ where: { id: u.id }, data: { recoveryCodes: stored } });
  await audit("TOTP_ON", { userId: u.id, email: u.email, detail: "nouveaux codes de secours" });
  return { codes };
}

/** Désactive la double authentification (mot de passe requis ; impossible si elle est obligatoire pour le rôle). */
export async function disableTotp(_: TotpState, f: FormData): Promise<TotpState> {
  const u = await me();
  if ((await required2faRoles()).includes(u.role)) return { error: "La double authentification est obligatoire pour votre rôle." };
  if (!(await bcrypt.compare(String(f.get("password") ?? ""), u.passwordHash))) return { error: "Mot de passe incorrect." };
  await db.user.update({ where: { id: u.id }, data: { totpEnabled: false, totpSecret: null, totpLastStep: null, recoveryCodes: null } });
  await audit("TOTP_OFF", { userId: u.id, email: u.email });
  revalidatePath("/parametres/securite");
  return null;
}

/** Déconnecte tous les appareils (y compris celui-ci, qui reste connecté avec une nouvelle session). */
export async function revokeAll() {
  const u = await me();
  const updated = await revokeSessions(u.id);
  await createSession(updated);
  await audit("SESSIONS_REVOKED", { userId: u.id, email: u.email });
}
