/* Stockage local (IndexedDB) des exercices d'évacuation : tout reste sur l'appareil tant que le transfert n'est pas fait. */
import type { EvacReport } from "./model";

export type LocalReport = {
  id: string;
  ownerId: string;          // utilisateur qui a saisi le rapport sur cet appareil
  report: EvacReport;
  dirty: boolean;           // modifié depuis le dernier transfert
  syncedAt: number | null;  // dernier transfert réussi
};
export type LocalPhoto = { id: string; reportId: string; blob: Blob };
export type ClientHint = { name: string; address: string };

const DB_NAME = "formast-evacuation";
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  return (dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("reports", { keyPath: "id" }).createIndex("ownerId", "ownerId");
      db.createObjectStore("photos", { keyPath: "id" }).createIndex("reportId", "reportId");
      db.createObjectStore("meta");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbp = null; reject(req.error); };
  }));
}

async function run<T>(stores: string[], mode: IDBTransactionMode, fn: (tx: IDBTransaction) => IDBRequest<T> | void): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const req = fn(tx);
    tx.oncomplete = () => resolve((req ? req.result : undefined) as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const listReports = (ownerId: string) => run<LocalReport[]>(["reports"], "readonly", (tx) => tx.objectStore("reports").index("ownerId").getAll(ownerId));
export const getReport = (id: string) => run<LocalReport | undefined>(["reports"], "readonly", (tx) => tx.objectStore("reports").get(id));
export const putReport = (rec: LocalReport) => run<IDBValidKey>(["reports"], "readwrite", (tx) => tx.objectStore("reports").put(rec));

/** Retire le rapport et ses photos de l'appareil. */
export async function removeReport(id: string) {
  const photos = await photosOf(id);
  await run(["reports", "photos"], "readwrite", (tx) => {
    tx.objectStore("reports").delete(id);
    for (const p of photos) tx.objectStore("photos").delete(p.id);
  });
}

export const putPhoto = (p: LocalPhoto) => run<IDBValidKey>(["photos"], "readwrite", (tx) => tx.objectStore("photos").put(p));
export const getPhoto = (id: string) => run<LocalPhoto | undefined>(["photos"], "readonly", (tx) => tx.objectStore("photos").get(id));
export const deletePhoto = (id: string) => run<undefined>(["photos"], "readwrite", (tx) => tx.objectStore("photos").delete(id));
export const photosOf = (reportId: string) => run<LocalPhoto[]>(["photos"], "readonly", (tx) => tx.objectStore("photos").index("reportId").getAll(reportId));

export const getMeta = <T,>(key: string) => run<T | undefined>(["meta"], "readonly", (tx) => tx.objectStore("meta").get(key));
export const setMeta = (key: string, value: unknown) => run<IDBValidKey>(["meta"], "readwrite", (tx) => tx.objectStore("meta").put(value, key));

/** Demande au navigateur de ne pas effacer les données locales en cas de manque de place. */
export function askPersistence() {
  try { void navigator.storage?.persist?.(); } catch { /* non disponible */ }
}

/** Réduit une photo (1600 px max, JPEG) pour qu'elle tienne dans le rapport et se transfère vite. */
export async function shrinkPhoto(file: Blob, max = 1600, quality = 0.8): Promise<Blob> {
  let src: ImageBitmap | HTMLImageElement;
  try {
    src = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      src = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Image illisible"));
        img.src = url;
      });
    } finally { setTimeout(() => URL.revokeObjectURL(url), 10_000); }
  }
  const scale = Math.min(1, max / Math.max(src.width, src.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(src.width * scale));
  canvas.height = Math.max(1, Math.round(src.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  if ("close" in src) src.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Conversion impossible"))), "image/jpeg", quality));
}
