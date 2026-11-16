import { db } from "@/lib/db";
import { isUuid, sanitizeReport } from "@/lib/evacuation/model";
import { MAX_PHOTO_BYTES, evacAccess, fail, json } from "@/lib/evacuation/server";

/** Envoi d'une photo (JPEG réduit sur l'appareil), une requête par photo. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await evacAccess(req, { write: true });
  if (a instanceof Response) return a;
  if (a.kind !== "user") return fail("Non autorisé", 401);
  const { id } = await params;
  const row = await db.evacuationReport.findUnique({ where: { id }, select: { userId: true, data: true } });
  if (!row) return fail("Rapport introuvable : transférez d'abord le rapport.", 404);
  if (row.userId !== a.user.id && a.user.role !== "ADMIN") return fail("Ce rapport appartient à un autre utilisateur.", 403);

  const f = await req.formData().catch(() => null);
  const photoId = String(f?.get("id") ?? "").toLowerCase();
  const file = f?.get("file");
  if (!isUuid(photoId) || !(file instanceof File)) return fail("Photo invalide.");
  if (!sanitizeReport(JSON.parse(row.data))?.photos.some((p) => p.id === photoId)) return fail("Cette photo ne fait plus partie du rapport.", 409);
  if (file.size > MAX_PHOTO_BYTES) return fail("Photo trop lourde (3 Mo maximum).", 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return fail("Seules les photos JPEG sont acceptées.");
  await db.evacuationPhoto.upsert({ where: { id: photoId }, create: { id: photoId, reportId: id, data: bytes }, update: { data: bytes, reportId: id } });
  return json({ ok: true });
}
