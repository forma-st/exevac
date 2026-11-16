import { db } from "@/lib/db";
import { sanitizeReport, statusOf } from "@/lib/evacuation/model";
import { evacAccess, fail, json, visibleWhere } from "@/lib/evacuation/server";

/** Liste des rapports transférés. `?mine=1` : ceux de l'utilisateur ; `?since=<date ISO>` : modifiés depuis. */
export async function GET(req: Request) {
  const a = await evacAccess(req, { allowMachine: true });
  if (a instanceof Response) return a;
  const q = new URL(req.url).searchParams;
  const since = q.get("since") ? new Date(q.get("since")!) : null;
  const rows = await db.evacuationReport.findMany({
    where: {
      ...visibleWhere(a),
      ...(a.kind === "user" && q.get("mine") ? { userId: a.user.id } : {}),
      ...(since && !isNaN(since.getTime()) ? { updatedAt: { gte: since } } : {}),
    },
    orderBy: { updatedAt: "desc" }, take: 500,
    select: { id: true, clientName: true, address: true, exerciseDate: true, status: true, authorName: true, deviceUpdatedAt: true, updatedAt: true, _count: { select: { photos: true } } },
  });
  return json({ reports: rows.map(({ _count, ...r }) => ({ ...r, photos: _count.photos })) });
}

/** Transfert d'un rapport depuis l'appareil (création ou mise à jour). */
export async function POST(req: Request) {
  const a = await evacAccess(req, { write: true });
  if (a instanceof Response) return a;
  if (a.kind !== "user") return fail("Non autorisé", 401);
  let body: unknown;
  try { body = await req.json(); } catch { return fail("Données illisibles."); }
  const r = sanitizeReport(body);
  if (!r) return fail("Rapport invalide.");

  const existing = await db.evacuationReport.findUnique({ where: { id: r.id }, select: { userId: true } });
  if (existing && existing.userId !== a.user.id && a.user.role !== "ADMIN") return fail("Ce rapport appartient à un autre utilisateur.", 403);
  const fields = {
    authorName: r.author || a.user.name, clientName: r.client, address: r.address || null, exerciseDate: r.date,
    status: statusOf(r), startedAt: r.startedAt ? new Date(r.startedAt) : null, stoppedAt: r.stoppedAt ? new Date(r.stoppedAt) : null,
    data: JSON.stringify(r), deviceUpdatedAt: new Date(r.updatedAt),
  };
  await db.evacuationReport.upsert({ where: { id: r.id }, create: { id: r.id, userId: a.user.id, ...fields }, update: fields });
  // photos retirées du rapport : supprimées ; photos encore attendues : à envoyer une par une
  const keep = r.photos.map((p) => p.id);
  await db.evacuationPhoto.deleteMany({ where: { reportId: r.id, id: { notIn: keep } } });
  const have = new Set((await db.evacuationPhoto.findMany({ where: { reportId: r.id }, select: { id: true } })).map((p) => p.id));
  return json({ ok: true, missingPhotos: keep.filter((id) => !have.has(id)) });
}
