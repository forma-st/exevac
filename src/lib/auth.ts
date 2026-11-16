import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "@prisma/client";
import { db } from "./db";

/** En production : préfixe __Host- (cookie lié au domaine exact, HTTPS obligatoire, non modifiable par un sous-domaine). */
const SECURE = process.env.NODE_ENV === "production";
const COOKIE = SECURE ? "__Host-exevac_session" : "exevac_session";
const PENDING = SECURE ? "__Host-exevac_2fa" : "exevac_2fa";
const SESSION_DAYS = 7;

const key = () => {
  const s = process.env.SESSION_SECRET;
  if (!s && SECURE) throw new Error("SESSION_SECRET manquant");
  return new TextEncoder().encode(s || "dev-secret");
};

export type Role = "ADMIN" | "FORMATEUR";
export const ROLES: { id: Role; label: string; help: string }[] = [
  { id: "FORMATEUR", label: "Formateur", help: "Saisit ses exercices sur le terrain et ne voit que ses propres rapports." },
  { id: "ADMIN", label: "Administrateur", help: "Gère les comptes et voit les rapports de tous les formateurs." },
];
export const roleLabel = (r: string) => ROLES.find((x) => x.id === r)?.label ?? r;

const cookieOptions = (maxAge: number) => ({ httpOnly: true, sameSite: "lax" as const, secure: SECURE, path: "/", maxAge });

/** Ouvre une session (après mot de passe, et double authentification si activée). */
// un cookie « __Host- » ne peut être effacé qu'avec les attributs Secure et Path=/
const clear = (jar: Awaited<ReturnType<typeof cookies>>, name: string) => jar.set(name, "", cookieOptions(0));

export async function createSession(user: Pick<User, "id" | "sessionVersion">) {
  const token = await new SignJWT({ sub: user.id, v: user.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key());
  const jar = await cookies();
  jar.set(COOKIE, token, cookieOptions(60 * 60 * 24 * SESSION_DAYS));
  clear(jar, PENDING);
}

export async function destroySession() {
  const jar = await cookies();
  clear(jar, COOKIE);
  clear(jar, PENDING);
}

/* ---------- Accès libre (provisoire) ----------
   Tant que la variable REQUIRE_LOGIN ne vaut pas "1", l'appli s'ouvre sans connexion : tout le monde partage
   un compte technique « invité » et les rapports transférés sont visibles par quiconque connaît l'adresse.
   Pour réactiver les comptes : définir REQUIRE_LOGIN=1 puis redéployer. */
export const OPEN_ACCESS = process.env.REQUIRE_LOGIN !== "1";
export const GUEST_ID = "public";
/** Comptes réels (le compte invité ne compte pas et ne peut pas se connecter). */
export const realUsers = { id: { not: GUEST_ID } };

async function guestUser() {
  await connection(); // toujours à la demande : jamais de page figée au moment de la construction
  return db.user.upsert({
    where: { id: GUEST_ID }, update: {},
    create: { id: GUEST_ID, email: "invite@exevac.invalid", name: "", role: "FORMATEUR", passwordHash: "!" },
  });
}

export async function currentUser() {
  if (OPEN_ACCESS) return guestUser();
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (!payload.sub) return null;
    const u = await db.user.findUnique({ where: { id: payload.sub } });
    // session révoquée (changement de mot de passe, « déconnecter partout », compte désactivé…)
    if (!u || u.id === GUEST_ID || !u.active || (payload.v ?? 0) !== u.sessionVersion) return null;
    return u;
  } catch {
    return null;
  }
}

/** Invalide toutes les sessions d'un utilisateur. */
export async function revokeSessions(userId: string) {
  return db.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
}

/* ---------- Étape intermédiaire : code de double authentification ---------- */

export async function startPending2fa(userId: string) {
  const token = await new SignJWT({ sub: userId, stage: "2fa" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("5m").sign(key());
  (await cookies()).set(PENDING, token, cookieOptions(300));
}
export async function pending2faUser() {
  const token = (await cookies()).get(PENDING)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.stage !== "2fa" || !payload.sub) return null;
    const u = await db.user.findUnique({ where: { id: payload.sub } });
    return u && u.active ? u : null;
  } catch {
    return null;
  }
}

/* ---------- Gardes d'accès ---------- */

/** Utilisateur connecté (administrateur ou formateur). */
export async function requireStaff() {
  const u = await currentUser();
  if (!u && (await db.user.count({ where: realUsers })) === 0) redirect("/setup");
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin() {
  const u = await requireStaff();
  if (u.role !== "ADMIN") redirect("/rapports");
  return u;
}
