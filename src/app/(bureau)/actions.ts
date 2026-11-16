"use server";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { ROLES, createSession, requireAdmin, requireStaff } from "@/lib/auth";
import { audit, passwordProblem, tempPassword } from "@/lib/security";

type Res = { ok?: string; error?: string; password?: string; email?: string } | null;
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const isRole = (r: string) => ROLES.some((x) => x.id === r);

/* ---------- Mon compte ---------- */

export async function updateProfile(_: Res, f: FormData): Promise<Res> {
  const u = await requireStaff();
  const name = s(f, "name");
  if (!name) return { error: "Le nom est obligatoire." };
  await db.user.update({ where: { id: u.id }, data: { name } });
  revalidatePath("/", "layout");
  return { ok: "Profil enregistré." };
}

export async function changePassword(_: Res, f: FormData): Promise<Res> {
  const u = await requireStaff();
  if (!(await bcrypt.compare(s(f, "current"), u.passwordHash))) return { error: "Mot de passe actuel incorrect." };
  const next = s(f, "next");
  const problem = passwordProblem(next, u.email);
  if (problem) return { error: problem };
  if (next !== s(f, "confirm")) return { error: "Les deux mots de passe ne correspondent pas." };
  // nouveau mot de passe : toutes les autres sessions sont fermées
  const updated = await db.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(next, 10), passwordChangedAt: new Date(), sessionVersion: { increment: 1 } } });
  await createSession(updated);
  await audit("PASSWORD_CHANGE", { userId: u.id, email: u.email });
  return { ok: "Mot de passe modifié. Vos autres appareils ont été déconnectés." };
}

/* ---------- Équipe (administrateur) ---------- */

export async function createUser(_: Res, f: FormData): Promise<Res> {
  const admin = await requireAdmin();
  const email = s(f, "email").toLowerCase();
  const name = s(f, "name") || email;
  const role = isRole(s(f, "role")) ? s(f, "role") : "FORMATEUR";
  if (!email) return { error: "E-mail requis." };
  if (await db.user.findUnique({ where: { email } })) return { error: "Cet e-mail est déjà utilisé." };
  const password = tempPassword();
  await db.user.create({ data: { email, name, role, passwordHash: await bcrypt.hash(password, 10) } });
  await audit("USER_CREATE", { userId: admin.id, email: admin.email, detail: `${email} (${role})` });
  revalidatePath("/equipe");
  return { email, password };
}

export async function setUserRole(id: string, role: string) {
  const me = await requireAdmin();
  if (id === me.id || !isRole(role)) return; // on ne se retire pas ses propres droits
  const u = await db.user.update({ where: { id }, data: { role } });
  await audit("ROLE_CHANGE", { userId: me.id, email: me.email, detail: `${u.email} → ${role}` });
  revalidatePath("/equipe");
}

export async function setUserActive(id: string, active: boolean) {
  const me = await requireAdmin();
  if (id === me.id) return;
  const u = await db.user.update({ where: { id }, data: { active, ...(active ? {} : { sessionVersion: { increment: 1 } }) } });
  await audit("USER_ACTIVE", { userId: me.id, email: me.email, detail: `${u.email} ${active ? "réactivé" : "désactivé"}` });
  revalidatePath("/equipe");
}

export async function resetUserPassword(id: string): Promise<Res> {
  const me = await requireAdmin();
  const password = tempPassword();
  const u = await db.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10), sessionVersion: { increment: 1 } } });
  await audit("PASSWORD_RESET", { userId: me.id, email: me.email, detail: u.email });
  return { email: u.email, password };
}

/** Téléphone perdu : la double authentification est retirée et les sessions fermées. */
export async function resetUserTotp(id: string) {
  const me = await requireAdmin();
  const u = await db.user.update({ where: { id }, data: { totpEnabled: false, totpSecret: null, totpLastStep: null, recoveryCodes: null, sessionVersion: { increment: 1 } } });
  await audit("TOTP_RESET", { userId: me.id, email: me.email, detail: u.email });
  revalidatePath("/equipe");
}

export async function deleteUser(id: string) {
  const me = await requireAdmin();
  if (id === me.id) return;
  const u = await db.user.delete({ where: { id } });
  await audit("USER_DELETE", { userId: me.id, email: me.email, detail: u.email });
  revalidatePath("/equipe");
}
