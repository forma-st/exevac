import { db } from "@/lib/db";
import { evacAccess, fail, visibleWhere } from "@/lib/evacuation/server";

export async function GET(req: Request, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  const a = await evacAccess(req, { allowMachine: true });
  if (a instanceof Response) return a;
  const { id, photoId } = await params;
  const photo = await db.evacuationPhoto.findFirst({ where: { id: photoId, reportId: id, report: visibleWhere(a) } });
  if (!photo) return fail("Photo introuvable.", 404);
  return new Response(Buffer.from(photo.data), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
