/* Transfert des rapports de l'appareil vers le serveur (et reprise d'un rapport depuis le serveur). */
import { sanitizeReport } from "./model";
import { getPhoto, getReport, putPhoto, putReport, type LocalReport } from "./store";

export class SessionError extends Error {}

async function check(res: Response) {
  if (res.status === 401 || res.redirected) throw new SessionError("Session expirée");
  if (!res.ok) {
    const msg = await res.json().then((j) => j?.error as string | undefined).catch(() => undefined);
    throw new Error(msg || `Erreur du serveur (${res.status})`);
  }
  return res;
}

/** Envoie le rapport puis les photos que le serveur n'a pas encore. Le rapport local n'est marqué « transféré » qu'en cas de succès complet. */
export async function pushReport(id: string, onProgress?: (text: string) => void): Promise<LocalReport> {
  const rec = await getReport(id);
  if (!rec) throw new Error("Rapport introuvable sur cet appareil");
  const sentVersion = rec.report.updatedAt;
  onProgress?.("Envoi du rapport…");
  const res = await check(await fetch("/api/evacuation/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rec.report) }));
  const { missingPhotos } = (await res.json()) as { missingPhotos: string[] };
  let n = 0;
  for (const pid of missingPhotos) {
    onProgress?.(`Envoi des photos (${++n}/${missingPhotos.length})…`);
    const photo = await getPhoto(pid);
    if (!photo) continue; // photo absente de cet appareil (rapport repris depuis le serveur)
    const form = new FormData();
    form.set("id", pid);
    form.set("file", photo.blob, `${pid}.jpg`);
    await check(await fetch(`/api/evacuation/reports/${id}/photos`, { method: "POST", body: form }));
  }
  // le rapport a pu être modifié pendant l'envoi : il reste alors « à transférer »
  const now = (await getReport(id)) ?? rec;
  const next: LocalReport = { ...now, dirty: now.report.updatedAt !== sentVersion, syncedAt: Date.now() };
  await putReport(next);
  return next;
}

export type ServerRow = { id: string; clientName: string; exerciseDate: string; status: string; photos: number; deviceUpdatedAt: string };

export async function fetchServerList(): Promise<ServerRow[]> {
  const res = await check(await fetch("/api/evacuation/reports?mine=1", { cache: "no-store" }));
  return ((await res.json()) as { reports: ServerRow[] }).reports;
}

/** Copie sur l'appareil un rapport déjà transféré (changement de téléphone, par exemple). */
export async function pullReport(id: string, ownerId: string): Promise<LocalReport> {
  const res = await check(await fetch(`/api/evacuation/reports/${id}?raw=1`, { cache: "no-store" }));
  const report = sanitizeReport(((await res.json()) as { report: unknown }).report);
  if (!report) throw new Error("Rapport illisible");
  for (const p of report.photos) {
    const img = await check(await fetch(`/api/evacuation/reports/${id}/photos/${p.id}`, { cache: "no-store" }));
    await putPhoto({ id: p.id, reportId: id, blob: await img.blob() });
  }
  const rec: LocalReport = { id, ownerId, report, dirty: false, syncedAt: Date.now() };
  await putReport(rec);
  return rec;
}
