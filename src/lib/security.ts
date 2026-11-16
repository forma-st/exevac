import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { headers } from "next/headers";
import { db } from "./db";

/* ---------- Contexte de la requête ---------- */

export async function requestInfo() {
  const h = await headers();
  return {
    ip: (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim() || "inconnue",
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
  };
}

/* ---------- Journal de sécurité ---------- */

export const AUDIT_LABELS: Record<string, string> = {
  LOGIN_OK: "Connexion réussie", LOGIN_FAIL: "Échec de connexion", LOGIN_LOCKED: "Connexion bloquée (trop de tentatives)",
  LOGIN_2FA_FAIL: "Code de double authentification invalide", LOGOUT: "Déconnexion",
  TOTP_ON: "Double authentification activée", TOTP_OFF: "Double authentification désactivée", TOTP_RESET: "Double authentification réinitialisée par un administrateur",
  RECOVERY_USED: "Code de secours utilisé", PASSWORD_CHANGE: "Mot de passe modifié", PASSWORD_RESET: "Mot de passe réinitialisé par un administrateur",
  SESSIONS_REVOKED: "Déconnexion de tous les appareils", USER_CREATE: "Compte créé", USER_DELETE: "Compte supprimé",
  USER_ACTIVE: "Compte activé / désactivé", ROLE_CHANGE: "Rôle modifié", RIGHTS_CHANGE: "Droits d'accès modifiés", POLICY_CHANGE: "Politique de sécurité modifiée",
  CLIENT_DELETE: "Client supprimé", DOSSIER_DELETE: "Dossier supprimé", CLIENT_EXPORT: "Export des données d'un client", CLIENT_ANONYMIZE: "Anonymisation des données d'un client",
  CSV_EXPORT: "Export CSV de réponses", EVAC_DELETE: "Rapport d'évacuation supprimé", EVAC_EMAIL: "Rapport d'évacuation envoyé par e-mail", RATE_LIMIT: "Formulaire public : trop de requêtes",
};

export async function audit(action: string, data: { userId?: string | null; email?: string | null; detail?: string | null } = {}) {
  try {
    const { ip, userAgent } = await requestInfo();
    await db.auditLog.create({ data: { action, userId: data.userId ?? null, email: data.email ?? null, detail: data.detail?.slice(0, 500) ?? null, ip, userAgent } });
  } catch (e) {
    console.error("Journal de sécurité :", e);
  }
}

/* ---------- Limitation de débit (stockée en base : fonctionne sur plusieurs serveurs) ---------- */

/** Nombre d'occurrences de la clé sur la fenêtre ; `blocked` si la limite est atteinte. */
export async function checkLimit(key: string, limit: number, windowMs: number) {
  const since = new Date(Date.now() - windowMs);
  const n = await db.rateHit.count({ where: { key, at: { gte: since } } });
  if (n < limit) return { blocked: false, retryMin: 0 };
  const oldest = await db.rateHit.findFirst({ where: { key, at: { gte: since } }, orderBy: { at: "asc" } });
  const retryMin = oldest ? Math.max(1, Math.ceil((oldest.at.getTime() + windowMs - Date.now()) / 60_000)) : 1;
  return { blocked: true, retryMin };
}
export async function hit(key: string) {
  await db.rateHit.create({ data: { key } });
  if (Math.random() < 0.02) await db.rateHit.deleteMany({ where: { at: { lt: new Date(Date.now() - 864e5) } } }); // ménage
}
export async function clearHits(key: string) {
  await db.rateHit.deleteMany({ where: { key } });
}
/** Vérifie puis compte une requête (formulaires publics). */
export async function consume(key: string, limit: number, windowMs: number) {
  const r = await checkLimit(key, limit, windowMs);
  if (!r.blocked) await hit(key);
  return r;
}

/* ---------- Chiffrement des secrets (AES-256-GCM, clé dérivée de SESSION_SECRET) ---------- */

const encKey = () => createHash("sha256").update(`totp:${process.env.SESSION_SECRET || "dev-secret"}`).digest();
export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", encKey(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}
export function decrypt(blob: string) {
  const [iv, tag, data] = blob.split(".").map((x) => Buffer.from(x, "base64url"));
  const d = createDecipheriv("aes-256-gcm", encKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

/* ---------- Double authentification TOTP (RFC 6238 : 30 s, 6 chiffres, SHA-1) ---------- */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Encode(buf: Buffer) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string) {
  const clean = s.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of clean) {
    const v = B32.indexOf(ch); if (v < 0) continue;
    value = (value << 5) | v; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
export const newTotpSecret = () => base32Encode(randomBytes(20));

export function totpCode(secretB32: string, step: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", base32Decode(secretB32)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const bin = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}

/** Renvoie le pas de temps accepté (±30 s de tolérance), ou null. Refuse un pas déjà utilisé (anti-rejeu). */
export function verifyTotp(secretB32: string, code: string, lastStep?: number | null) {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const now = Math.floor(Date.now() / 30_000);
  for (const step of [now, now - 1, now + 1]) {
    if (lastStep != null && step <= lastStep) continue;
    const expected = totpCode(secretB32, step);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(c))) return step;
  }
  return null;
}

export function otpauthUri(secretB32: string, account: string, issuer = "FORMAST Évacuation") {
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/* ---------- Codes de secours ---------- */

const hashCode = (c: string) => createHash("sha256").update(c.replace(/[\s-]/g, "").toLowerCase()).digest("hex");
export function newRecoveryCodes(n = 8) {
  const codes = Array.from({ length: n }, () => {
    const r = randomBytes(5).toString("hex"); // 10 caractères
    return `${r.slice(0, 5)}-${r.slice(5)}`;
  });
  return { codes, stored: JSON.stringify(codes.map(hashCode)) };
}
/** Consomme un code de secours : renvoie la nouvelle liste stockée, ou null si invalide. */
export function useRecoveryCode(stored: string | null, code: string) {
  if (!stored) return null;
  const list: string[] = JSON.parse(stored);
  const h = hashCode(code);
  if (!list.includes(h)) return null;
  return JSON.stringify(list.filter((x) => x !== h));
}

/* ---------- Mots de passe ---------- */

export const MIN_PASSWORD = 10;
export function passwordProblem(pw: string, email?: string) {
  if (pw.length < MIN_PASSWORD) return `Le mot de passe doit faire au moins ${MIN_PASSWORD} caractères.`;
  if (/^(.)\1+$/.test(pw) || /^(0123456789|1234567890|azertyuiop|motdepasse|password)/i.test(pw)) return "Ce mot de passe est trop simple.";
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && pw.toLowerCase().includes(local)) return "Le mot de passe ne doit pas contenir votre identifiant.";
  return null;
}
/** Mot de passe temporaire robuste (14 caractères). */
export const tempPassword = () => randomBytes(11).toString("base64url").slice(0, 14);

/* ---------- Politique : double authentification obligatoire par rôle ---------- */

export const DEFAULT_2FA_ROLES = ["ADMIN"];
export async function required2faRoles(): Promise<string[]> {
  const row = await db.setting.findUnique({ where: { key: "security.require2fa" } });
  try { return row ? JSON.parse(row.value) : DEFAULT_2FA_ROLES; } catch { return DEFAULT_2FA_ROLES; }
}

/* ---------- Durées de conservation (RGPD) : purge quotidienne ---------- */

const DAY = 864e5;
/** Lancée au plus une fois par jour, à l'occasion d'une visite du back-office. */
export async function dailyMaintenance() {
  try {
    const key = "maintenance.lastRun";
    const row = await db.setting.findUnique({ where: { key } });
    if (row && Date.now() - Number(row.value) < DAY) return;
    await db.setting.upsert({ where: { key }, create: { key, value: String(Date.now()) }, update: { value: String(Date.now()) } });
    const now = Date.now();
    await Promise.all([
      db.auditLog.deleteMany({ where: { at: { lt: new Date(now - 365 * DAY) } } }), // journal de sécurité : 12 mois
      db.rateHit.deleteMany({ where: { at: { lt: new Date(now - DAY) } } }),
    ]);
  } catch (e) {
    console.error("Maintenance :", e);
  }
}
