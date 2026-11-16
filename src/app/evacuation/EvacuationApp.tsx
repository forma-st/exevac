"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { STATUS_LABEL, dateFr, emptyReport, reportTitle, statusOf, type ReportStatus } from "@/lib/evacuation/model";
import { askPersistence, listReports, putReport, removeReport, type ClientHint, type LocalReport } from "@/lib/evacuation/store";
import { SessionError, fetchServerList, pullReport, pushReport, type ServerRow } from "@/lib/evacuation/sync";
import { ExerciseEditor } from "./ExerciseEditor";

type Me = { id: string; name: string };
type Session = "unknown" | "ok" | "expired" | "other";

function useOnline() {
  return useSyncExternalStore(
    (cb) => { window.addEventListener("online", cb); window.addEventListener("offline", cb); return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); }; },
    () => navigator.onLine,
    () => true,
  );
}

const STATUS_STYLE: Record<ReportStatus, string> = { BROUILLON: "bg-slate-100 text-slate-600", EN_COURS: "bg-amber-100 text-amber-800", TERMINE: "bg-slate-700 text-white" };

/** Fichiers de la page à garder pour le hors-ligne (envoyés au service worker). */
function pageAssets() {
  const urls = new Set<string>();
  for (const e of performance.getEntriesByType("resource")) urls.add(e.name);
  document.querySelectorAll<HTMLScriptElement>("script[src]").forEach((s) => urls.add(s.src));
  document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet][href]").forEach((l) => urls.add(l.href));
  return [...urls].filter((u) => u.startsWith(location.origin + "/_next/static/"));
}

const GUEST = "public"; // rapports saisis en accès libre : repris ensuite par le compte connecté
const AUTHOR_KEY = "exevac-auteur";
const lastAuthor = () => { try { return localStorage.getItem(AUTHOR_KEY) ?? ""; } catch { return ""; } };

export function EvacuationApp({ user, open = false }: { user: Me; open?: boolean }) {
  const online = useOnline();
  const [recs, setRecs] = useState<LocalReport[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [session, setSession] = useState<Session>("unknown");
  const [server, setServer] = useState<ServerRow[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [offlineReady, setOfflineReady] = useState(false);
  const busy = useRef(false);

  // Chargement des rapports gardés sur l'appareil
  useEffect(() => {
    askPersistence();
    Promise.all([listReports(user.id), user.id === GUEST ? [] : listReports(GUEST)]).then(([mine, guest]) => {
      const list = [...mine, ...guest];
      setRecs(list);
      const wanted = location.hash.slice(1);
      if (wanted && list.some((r) => r.id === wanted)) setOpenId(wanted);
    }).catch(() => setMessage({ kind: "error", text: "Le stockage local du navigateur est indisponible (navigation privée ?). Les rapports ne pourront pas être enregistrés." }));
  }, [user.id]);

  // Mise en cache pour le hors-ligne (production uniquement)
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    const send = async () => {
      try {
        // On n'attend pas `serviceWorker.ready` : il ne répond jamais si la page a été atteinte sans rechargement
        // complet (juste après la connexion, par exemple). On s'adresse directement au service worker enregistré.
        const reg = await navigator.serviceWorker.register("/evacuation-sw.js", { scope: "/evacuation" });
        const worker = reg.active ?? await new Promise<ServiceWorker | null>((resolve) => {
          const w = reg.installing ?? reg.waiting;
          if (!w) return resolve(null);
          if (w.state === "activated") return resolve(w);
          w.addEventListener("statechange", () => { if (w.state === "activated") resolve(w); else if (w.state === "redundant") resolve(null); });
        });
        if (cancelled || !worker || !navigator.onLine) return;
        worker.postMessage({ type: "precache", urls: pageAssets() });
        // prêt quand la page elle-même est dans le cache
        for (let i = 0; i < 20 && !cancelled; i++) {
          if (await caches.match("/evacuation")) { setOfflineReady(true); return; }
          await new Promise((r) => setTimeout(r, 500));
        }
      } catch { /* hors-ligne indisponible sur ce navigateur */ }
    };
    if (document.readyState === "complete") void send();
    else window.addEventListener("load", send, { once: true });
    caches.match("/evacuation").then((hit) => hit && setOfflineReady(true)).catch(() => {});
    return () => { cancelled = true; window.removeEventListener("load", send); };
  }, []);

  // Au retour du réseau : vérification de la session, rapports déjà sur le serveur
  const refreshServer = useCallback(async () => {
    try {
      const res = await fetch("/api/evacuation/session", { cache: "no-store" });
      if (res.status === 401 || res.redirected) return setSession("expired");
      if (!res.ok) return;
      const data = (await res.json()) as { user: Me };
      if (data.user.id !== user.id) return setSession("other");
      setSession("ok");
      setServer(await fetchServerList());
    } catch { /* réseau instable : on réessaiera */ }
  }, [user.id]);
  useEffect(() => { if (online) void refreshServer(); else setSession("unknown"); }, [online, refreshServer]);

  useEffect(() => {
    const onHash = () => setOpenId(location.hash.slice(1) || null);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = (id: string | null) => {
    history.pushState(null, "", id ? `#${id}` : location.pathname);
    setOpenId(id);
    window.scrollTo(0, 0);
  };

  const upsert = useCallback((rec: LocalReport) => setRecs((list) => (list ? [...list.filter((r) => r.id !== rec.id), rec] : [rec])), []);

  const sync = useCallback(async (ids: string[]) => {
    if (busy.current || !ids.length) return;
    busy.current = true;
    setMessage(null);
    let done = 0;
    try {
      for (const id of ids) {
        upsert(await pushReport(id, (t) => setProgress(ids.length > 1 ? `${done + 1}/${ids.length} — ${t}` : t)));
        done++;
      }
      setMessage({ kind: "ok", text: done > 1 ? `${done} rapports transférés.` : "Rapport transféré." });
      void refreshServer();
    } catch (e) {
      if (e instanceof SessionError) setSession("expired");
      else setMessage({ kind: "error", text: `Transfert interrompu : ${e instanceof TypeError ? "connexion au serveur impossible" : (e as Error).message}. Les données restent sur l'appareil.` });
    } finally {
      busy.current = false;
      setProgress(null);
    }
  }, [refreshServer, upsert]);

  const sorted = useMemo(() => [...(recs ?? [])].sort((a, b) => b.report.updatedAt - a.report.updatedAt), [recs]);
  const dirty = sorted.filter((r) => r.dirty);
  // sites déjà saisis sur cet appareil, proposés pour préremplir le nom et l'adresse
  const clients = useMemo(() => {
    const seen = new Map<string, ClientHint>();
    for (const r of sorted) { const name = r.report.client.trim(); if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), { name, address: r.report.address }); }
    return [...seen.values()];
  }, [sorted]);
  const current = openId ? sorted.find((r) => r.id === openId) : undefined;
  const remote = server.filter((s) => !sorted.some((r) => r.id === s.id));
  const canSync = online && session === "ok";
  // pas de sollicitation pendant qu'un exercice est chronométré à l'écran
  const propose = canSync && dirty.length > 0 && !progress && !(current && statusOf(current.report) === "EN_COURS");

  async function create() {
    const rec: LocalReport = { id: "", ownerId: user.id, report: emptyReport(user.name || lastAuthor()), dirty: true, syncedAt: null };
    rec.id = rec.report.id;
    await putReport(rec);
    upsert(rec);
    go(rec.id);
  }
  /** Suppression : sur l'appareil, et aussi sur le serveur si le rapport y a été transféré et que le réseau est là. */
  async function remove(rec: LocalReport) {
    const name = reportTitle(rec.report);
    const onServer = !!rec.syncedAt;
    const text = !onServer
      ? `Supprimer définitivement « ${name} » ? Ce rapport n'a jamais été transféré : il sera perdu.`
      : canSync
        ? `Supprimer définitivement « ${name} », sur cet appareil et sur le serveur ?`
        : `Vous êtes hors ligne : « ${name} » sera retiré de cet appareil seulement${rec.dirty ? " (les modifications non transférées seront perdues)" : ""}. La version transférée reste sur le serveur.`;
    if (!window.confirm(text)) return;
    if (onServer && canSync) {
      const res = await fetch(`/api/evacuation/reports/${rec.id}`, { method: "DELETE" }).catch(() => null);
      if (!res?.ok) return setMessage({ kind: "error", text: "La suppression sur le serveur a échoué : le rapport a été conservé. Réessayez avec du réseau." });
      setServer((list) => list.filter((x) => x.id !== rec.id));
    }
    await removeReport(rec.id);
    setRecs((list) => list?.filter((r) => r.id !== rec.id) ?? null);
    if (openId === rec.id) go(null);
  }
  async function pull(id: string) {
    setProgress("Récupération du rapport…");
    try { upsert(await pullReport(id, user.id)); }
    catch (e) { if (e instanceof SessionError) setSession("expired"); else setMessage({ kind: "error", text: `Récupération impossible : ${(e as Error).message}` }); }
    finally { setProgress(null); }
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between gap-3 pb-3">
        <div className="min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-formast.png" alt="FORMAST" width={312} height={80} className="h-8 w-auto" />
          <div className="mt-0.5 truncate text-xs text-slate-500">Exercices d'évacuation{user.name ? ` · ${user.name}` : ""}</div>
        </div>
        <span className={`badge shrink-0 ${online ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`} role="status">
          {online ? "● En ligne" : "● Hors ligne"}
        </span>
      </header>

      {session === "expired" && (
        <div className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Votre session a expiré. Vos rapports sont toujours sur cet appareil ; reconnectez-vous pour les transférer.{" "}
          <a href="/login" className="font-semibold underline">Se reconnecter</a>
        </div>
      )}
      {session === "other" && (
        <div className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Un autre compte est connecté sur cet appareil. <button className="font-semibold underline" onClick={() => location.reload()}>Recharger la page</button>
        </div>
      )}
      {progress && <div className="mb-3 rounded-xl bg-link-100 p-3 text-sm text-link-700" role="status">{progress}</div>}
      {message && (
        <div className={`mb-3 flex items-start justify-between gap-3 rounded-xl p-3 text-sm ${message.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-brand-50 text-brand-700"}`} role="status">
          <span>{message.text}</span>
          <button className="shrink-0 font-semibold" onClick={() => setMessage(null)} aria-label="Fermer le message">✕</button>
        </div>
      )}
      {propose && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <span>Réseau disponible : {dirty.length > 1 ? `${dirty.length} rapports à transférer` : "1 rapport à transférer"}.</span>
          <button className="btn-primary" onClick={() => sync(dirty.map((r) => r.id))}>Transférer</button>
        </div>
      )}

      {current ? (
        <ExerciseEditor
          key={current.id}
          rec={current}
          clients={clients}
          canSync={canSync}
          online={online}
          syncing={!!progress}
          onSaved={upsert}
          onBack={() => go(null)}
          onSync={() => sync([current.id])}
          onDelete={() => remove(current)}
        />
      ) : (
        <main className="space-y-3">
          <button className="btn-primary w-full py-3.5 text-base" onClick={create}>+ Nouvel exercice</button>

          {recs === null && <p className="py-6 text-center text-sm text-slate-500">Chargement…</p>}
          {recs && !sorted.length && (
            <div className="card p-5 text-sm text-slate-600">
              <p className="font-medium text-ink">Aucun exercice sur cet appareil.</p>
              <p className="mt-1">Créez un exercice, renseignez le site, puis lancez le chronomètre au déclenchement de l'alarme. Tout est enregistré sur l'appareil, même sans réseau.</p>
            </div>
          )}
          {sorted.map((rec) => {
            const st = statusOf(rec.report);
            return (
              <div key={rec.id} className="card overflow-hidden">
                <button onClick={() => go(rec.id)} className="flex w-full items-center justify-between gap-3 p-4 text-left active:bg-slate-50">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{reportTitle(rec.report)}</span>
                    <span className="block truncate text-sm text-slate-500">
                      {dateFr(rec.report.date) || "Sans date"}{rec.report.photos.length ? ` · ${rec.report.photos.length} photo${rec.report.photos.length > 1 ? "s" : ""}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`badge ${STATUS_STYLE[st]}`}>{STATUS_LABEL[st]}</span>
                    <span className={`badge ${rec.dirty ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{rec.dirty ? "À transférer" : "Transféré"}</span>
                  </span>
                </button>
                <div className="grid grid-cols-2 border-t border-slate-100 text-sm">
                  <button className="border-r border-slate-100 py-2.5 font-medium text-slate-700 active:bg-slate-50" onClick={() => go(rec.id)}>✎ Modifier</button>
                  <button className="py-2.5 font-medium text-brand-700 active:bg-brand-50" onClick={() => remove(rec)}>🗑 Supprimer</button>
                </div>
              </div>
            );
          })}

          {!open && remote.length > 0 && (
            <section className="pt-3">
              <h2 className="mb-2 text-sm font-semibold text-slate-500">Déjà transférés, absents de cet appareil</h2>
              <div className="space-y-2">
                {remote.map((s) => (
                  <div key={s.id} className="card flex items-center justify-between gap-3 p-3 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{s.clientName || "Exercice sans nom"}</span>
                      <span className="text-slate-500">{dateFr(s.exerciseDate)}</span>
                    </span>
                    <span className="flex shrink-0 gap-2">
                      <a className="btn-secondary" href={`/api/evacuation/reports/${s.id}/pdf`}>PDF</a>
                      <button className="btn-secondary" disabled={!!progress} onClick={() => pull(s.id)}>Récupérer</button>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <footer className="space-y-1 pt-4 text-xs text-slate-500">
            <p>{offlineReady ? "✓ Appli disponible hors ligne sur cet appareil." : "Ouvrez cette page une fois avec du réseau pour qu'elle reste disponible hors ligne."} Ajoutez-la à l'écran d'accueil pour la retrouver comme une application.</p>
            {online && (
              <p className="flex gap-4">
                <a href="/rapports" className="underline">Rapports transférés</a>
                {!open && <a href="/compte" className="underline">Mon compte</a>}
              </p>
            )}
          </footer>
        </main>
      )}
    </div>
  );
}
