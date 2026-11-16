"use server";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, pending2faUser, startPending2fa } from "@/lib/auth";
import { audit, checkLimit, clearHits, decrypt, hit, requestInfo, useRecoveryCode, verifyTotp } from "@/lib/security";

const WINDOW = 15 * 60_000;
// empreinte factice : même temps de réponse que le compte existe ou non (pas d'énumération des comptes)
const DUMMY = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8.Pp7QjEGmKbwqJu1u/gZ5Z5Z5Z5Z5";

export async function login(_: string | null, form: FormData) {
  const email = String(form.get("email") || "").trim().toLowerCase().slice(0, 200);
  const password = String(form.get("password") || "").slice(0, 200);
  const { ip } = await requestInfo();
  const byIp = await checkLimit(`login:ip:${ip}`, 20, WINDOW);
  const byEmail = await checkLimit(`login:email:${email}`, 5, WINDOW);
  if (byIp.blocked || byEmail.blocked) {
    await audit("LOGIN_LOCKED", { email, detail: byIp.blocked ? "limite par adresse IP" : "limite par compte" });
    return `Trop de tentatives. Réessayez dans ${Math.max(byIp.retryMin, byEmail.retryMin)} minute(s).`;
  }
  const user = email ? await db.user.findUnique({ where: { email } }) : null;
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY);
  if (!user || !ok || !user.active) {
    await Promise.all([hit(`login:ip:${ip}`), hit(`login:email:${email}`)]);
    await audit("LOGIN_FAIL", { userId: user?.id, email, detail: user && !user.active ? "compte désactivé" : null });
    return user && ok && !user.active ? "Ce compte est désactivé. Contactez votre administrateur." : "Identifiants incorrects.";
  }
  await clearHits(`login:email:${email}`);
  if (user.totpEnabled && user.totpSecret) {
    await startPending2fa(user.id);
    redirect("/login/2fa");
  }
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user);
  await audit("LOGIN_OK", { userId: user.id, email });
  redirect("/");
}

export async function verify2fa(_: string | null, form: FormData) {
  const user = await pending2faUser();
  if (!user || !user.totpSecret) return "Session expirée : reconnectez-vous.";
  const key = `2fa:${user.id}`;
  const lim = await checkLimit(key, 5, WINDOW);
  if (lim.blocked) return `Trop de codes invalides. Réessayez dans ${lim.retryMin} minute(s).`;
  const code = String(form.get("code") || "").trim();
  let used = "totp";
  const step = verifyTotp(decrypt(user.totpSecret), code, user.totpLastStep);
  if (step !== null) {
    await db.user.update({ where: { id: user.id }, data: { totpLastStep: step, lastLoginAt: new Date() } });
  } else {
    const rest = useRecoveryCode(user.recoveryCodes, code);
    if (!rest) {
      await hit(key);
      await audit("LOGIN_2FA_FAIL", { userId: user.id, email: user.email });
      return "Code invalide.";
    }
    used = "secours";
    await db.user.update({ where: { id: user.id }, data: { recoveryCodes: rest, lastLoginAt: new Date() } });
    await audit("RECOVERY_USED", { userId: user.id, email: user.email, detail: `${JSON.parse(rest).length} code(s) restant(s)` });
  }
  await clearHits(key);
  await createSession(user);
  await audit("LOGIN_OK", { userId: user.id, email: user.email, detail: used === "totp" ? "avec double authentification" : "avec un code de secours" });
  redirect("/");
}
