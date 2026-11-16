/* Accès serveur aux rapports d'évacuation : contrôle d'accès, lecture, PDF. */
import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { sanitizeReport, type EvacReport } from "./model";
import { buildReportPdf } from "./pdf";

export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

export type Access =
  | { kind: "user"; user: User }
  | { kind: "machine" }; // logiciel de gestion de formation, lecture seule

/** Jeton d'accès machine (lecture seule), facultatif : variable EVACUATION_API_TOKEN. */
function machineToken(req: Request) {
  const expected = process.env.EVACUATION_API_TOKEN;
  const given = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!expected || expected.length < 24 || !given) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Utilisateur connecté (ou jeton machine si `allowMachine`). */
export async function evacAccess(req: Request, opts: { allowMachine?: boolean; write?: boolean } = {}): Promise<Access | NextResponse> {
  if (opts.allowMachine && machineToken(req)) return { kind: "machine" };
  const user = await currentUser();
  if (!user) return fail("Session expirée : reconnectez-vous.", 401);
  if (opts.write) {
    // requêtes d'écriture : uniquement depuis l'application elle-même (protection CSRF)
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (!origin || !host || new URL(origin).host !== host) return fail("Origine de la requête refusée.", 403);
  }
  return { kind: "user", user };
}

/** Un formateur ne voit que ses rapports ; un administrateur (ou le jeton machine) les voit tous. */
export const visibleWhere = (a: Access) => (a.kind === "machine" || a.user.role === "ADMIN" ? {} : { userId: a.user.id });

export async function loadReport(a: Access, id: string) {
  const row = await db.evacuationReport.findFirst({ where: { id, ...visibleWhere(a) }, include: { user: { select: { id: true, name: true, email: true } }, photos: { select: { id: true } } } });
  if (!row) return null;
  const report = sanitizeReport(JSON.parse(row.data));
  if (!report) return null;
  // seules les photos réellement reçues sont exposées
  const have = new Set(row.photos.map((p) => p.id));
  report.photos = report.photos.filter((p) => have.has(p.id));
  return { row, report };
}

export async function reportPdf(report: EvacReport) {
  const rows = await db.evacuationPhoto.findMany({ where: { reportId: report.id } });
  const byId = new Map(rows.map((p) => [p.id, p.data]));
  const photos = report.photos.flatMap((p) => (byId.has(p.id) ? [{ bytes: new Uint8Array(byId.get(p.id)!), caption: p.caption, takenAt: p.takenAt }] : []));
  return buildReportPdf(report, photos);
}
