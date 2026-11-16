import { db } from "@/lib/db";
import { audit } from "@/lib/security";
import { toExport } from "@/lib/evacuation/model";
import { evacAccess, fail, json, loadReport } from "@/lib/evacuation/server";

type Ctx = { params: Promise<{ id: string }> };

/** Rapport au format d'échange (JSON) ; `?raw=1` : données brutes, pour reprendre la saisie sur un autre appareil. */
export async function GET(req: Request, { params }: Ctx) {
  const a = await evacAccess(req, { allowMachine: true });
  if (a instanceof Response) return a;
  const found = await loadReport(a, (await params).id);
  if (!found) return fail("Rapport introuvable.", 404);
  const { row, report } = found;
  const url = new URL(req.url);
  if (url.searchParams.get("raw")) return json({ report });
  const base = `${url.origin}/api/evacuation/reports/${report.id}`;
  return json(toExport(report, {
    formateur: { id: row.user?.id ?? null, nom: row.authorName, email: row.user?.email ?? null },
    photoUrl: (pid) => `${base}/photos/${pid}`, pdfUrl: `${base}/pdf`,
  }));
}

/** Suppression définitive (rapport et photos) : son auteur, ou un administrateur. */
export async function DELETE(req: Request, { params }: Ctx) {
  const a = await evacAccess(req, { write: true });
  if (a instanceof Response) return a;
  if (a.kind !== "user") return fail("Non autorisé", 401);
  const row = await db.evacuationReport.findUnique({ where: { id: (await params).id }, select: { id: true, userId: true, clientName: true, exerciseDate: true } });
  if (!row) return json({ ok: true });
  if (row.userId !== a.user.id && a.user.role !== "ADMIN") return fail("Seul l'auteur ou un administrateur peut supprimer ce rapport.", 403);
  await db.evacuationReport.delete({ where: { id: row.id } });
  await audit("EVAC_DELETE", { userId: a.user.id, email: a.user.email, detail: `${row.clientName} — ${row.exerciseDate}` });
  return json({ ok: true });
}
