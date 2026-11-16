import { evacAccess, fail, json } from "@/lib/evacuation/server";

/** Vérifie la session depuis l'appli terrain (au retour du réseau). */
export async function GET(req: Request) {
  const a = await evacAccess(req);
  if (a instanceof Response) return a;
  if (a.kind !== "user") return fail("Non autorisé", 401);
  return json({ user: { id: a.user.id, name: a.user.name, role: a.user.role } });
}
