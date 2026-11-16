"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CHARGES, MAX_CHECKPOINTS, MAX_PHOTOS, NOT_EVACUATED_AFTER, OBJECTIVES, PROCEDURES, SCENARIOS,
  autoAxes, chrono, clockFull, durationFr, evacTime, evacuatedAt, newId, pdfFileName, reportTitle, sinceStart, statusOf, timeline, todayIso,
  type Checkpoint, type EvacReport, type Tri, type YesNo,
} from "@/lib/evacuation/model";
import { buildReportPdf } from "@/lib/evacuation/pdf";
import { pushReport } from "@/lib/evacuation/sync";
import { deletePhoto, getPhoto, putPhoto, putReport, shrinkPhoto, type ClientHint, type LocalReport } from "@/lib/evacuation/store";

type Props = {
  rec: LocalReport; clients: ClientHint[]; canSync: boolean; canEmail: boolean; online: boolean; syncing: boolean;
  onSaved: (rec: LocalReport) => void; onBack: () => void; onSync: () => void; onDelete: () => void;
};

const field = "input text-base";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="rounded bg-brand-600 px-3 py-2 text-center text-lg font-semibold tracking-wide text-white uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Text({ label, value, onChange, rows, placeholder, inputMode, list }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string; inputMode?: "numeric" | "text"; list?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {rows
        ? <textarea className={field} rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        : <input className={field} value={value} placeholder={placeholder} inputMode={inputMode} list={list} autoComplete="off" onChange={(e) => onChange(e.target.value)} />}
    </label>
  );
}

/** Choix à un seul geste ; un second appui sur la réponse choisie l'efface. */
function Choice<T extends string>({ value, options, onChange, label }: { value: T | ""; options: [T, string][]; onChange: (v: T | "") => void; label: string }) {
  return (
    <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-300" role="group" aria-label={label}>
      {options.map(([v, text], i) => (
        <button
          key={v} type="button" aria-pressed={value === v} onClick={() => onChange(value === v ? "" : v)}
          className={`min-w-12 px-2.5 py-2.5 text-xs font-semibold ${i ? "border-l border-slate-300" : ""} ${value === v ? (v === "non" ? "bg-brand-600 text-white" : v === "sp" ? "bg-mid text-white" : "bg-emerald-600 text-white") : "bg-surface text-slate-500"}`}
        >{text}</button>
      ))}
    </div>
  );
}
const TRI: [Exclude<Tri, "">, string][] = [["oui", "OUI"], ["non", "NON"], ["sp", "S.P."]];
const YN: [Exclude<YesNo, "">, string][] = [["oui", "OUI"], ["non", "NON"]];

function Question({ text, flagged, children }: { text: string; flagged?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 py-2.5 first:border-t-0">
      <span className="min-w-0 text-sm">
        {text}
        {flagged && <span className="block text-xs font-medium text-amber-800">↳ ajouté aux axes d'amélioration</span>}
      </span>
      {children}
    </div>
  );
}

/** Chronomètre isolé : lui seul se redessine plusieurs fois par seconde. */
function Running({ from }: { from: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  return <span className="font-display text-4xl font-bold tabular-nums">{chrono(now - from)}</span>;
}

const toTimeInput = (ms: number) => { const d = new Date(ms); const p = (n: number) => String(n).padStart(2, "0"); return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
/** Remplace l'heure d'un horodatage en gardant son jour. */
function withTime(base: number, value: string) {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!m) return base;
  const d = new Date(base);
  d.setHours(+m[1], +m[2], +(m[3] ?? 0), 0);
  return d.getTime();
}
function TimeInput({ label, at, onChange }: { label: string; at: number; onChange: (ms: number) => void }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input type="time" step={1} className={field} value={toTimeInput(at)} onChange={(e) => e.target.value && onChange(withTime(at, e.target.value))} />
    </label>
  );
}

export function ExerciseEditor({ rec, clients, canSync, canEmail, online, syncing, onSaved, onBack, onSync, onDelete }: Props) {
  const [r, setR] = useState<EvacReport>(rec.report);
  const latest = useRef(r);
  const recRef = useRef(rec);
  recRef.current = rec;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);
  const [saveError, setSaveError] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); // repère (ou "start" / "stop") en cours de modification
  const [pdf, setPdf] = useState<{ file: File; url: string; version: number } | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [mailTo, setMailTo] = useState(() => { try { return localStorage.getItem(`exevac-mail-${rec.id}`) ?? ""; } catch { return ""; } });
  const [mailNote, setMailNote] = useState("");
  const [mail, setMail] = useState<{ kind: "busy" | "ok" | "error"; text: string } | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  /* ---------- Enregistrement automatique sur l'appareil ---------- */
  const persist = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!pending.current) return;
    pending.current = false;
    const next: LocalReport = { ...recRef.current, report: latest.current, dirty: true };
    try { await putReport(next); setSaveError(false); onSaved(next); }
    catch { pending.current = true; setSaveError(true); }
  }, [onSaved]);

  /** `now` : enregistrement immédiat (horodatages, photos) ; sinon après une courte pause de saisie. */
  const update = useCallback((patch: Partial<EvacReport>, now = false) => {
    const next = { ...latest.current, ...patch, updatedAt: Date.now() };
    latest.current = next;
    pending.current = true;
    setR(next);
    if (timer.current) clearTimeout(timer.current);
    if (now) void persist(); else timer.current = setTimeout(() => void persist(), 400);
  }, [persist]);

  useEffect(() => {
    const flush = () => void persist();
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", onVisibility); flush(); };
  }, [persist]);

  const status = statusOf(r);
  const running = status === "EN_COURS";

  // Écran maintenu allumé pendant l'exercice
  useEffect(() => {
    if (!running || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null, cancelled = false;
    const acquire = () => navigator.wakeLock.request("screen").then((l) => { if (cancelled) void l.release(); else lock = l; }).catch(() => {});
    const onVisible = () => { if (document.visibilityState === "visible") void acquire(); };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", onVisible); void lock?.release(); };
  }, [running]);

  // Miniatures des photos
  const photoIds = r.photos.map((p) => p.id).join(",");
  useEffect(() => {
    let cancelled = false;
    const made: string[] = [];
    (async () => {
      const map: Record<string, string> = {};
      for (const id of photoIds ? photoIds.split(",") : []) {
        const p = await getPhoto(id).catch(() => undefined);
        if (p) { map[id] = URL.createObjectURL(p.blob); made.push(map[id]); }
      }
      if (!cancelled) setThumbs(map);
    })();
    return () => { cancelled = true; made.forEach((u) => URL.revokeObjectURL(u)); };
  }, [photoIds]);

  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf.url); }, [pdf]);

  /* ---------- Déroulé ---------- */
  const setCheckpoint = (id: string, patch: Partial<Checkpoint>, now = false) =>
    update({ checkpoints: latest.current.checkpoints.map((c) => (c.id === id ? { ...c, ...patch } : c)) }, now);

  function start() {
    update({ startedAt: Date.now(), stoppedAt: null, date: todayIso() }, true);
  }
  function stop() {
    update({ stoppedAt: Date.now() }, true);
    setEditing(null);
  }
  function cancelStart() {
    if (!window.confirm("Annuler le départ ? Le chronomètre et les horaires des repères seront remis à zéro.")) return;
    update({ startedAt: null, stoppedAt: null, checkpoints: latest.current.checkpoints.map((c) => ({ ...c, at: null })) }, true);
    setEditing(null);
  }
  function tap(c: Checkpoint) {
    if (c.at || !running) return setEditing(editing === c.id ? null : c.id);
    setCheckpoint(c.id, { at: Date.now() }, true);
    if (navigator.vibrate) navigator.vibrate(30);
  }
  function addCheckpoint() {
    if (latest.current.checkpoints.length >= MAX_CHECKPOINTS) return;
    const c: Checkpoint = { id: newId(), label: "", note: "", at: running ? Date.now() : null };
    update({ checkpoints: [...latest.current.checkpoints, c] }, true);
    setEditing(c.id);
  }
  const setKey = (id: string, on: boolean) => update({ checkpoints: latest.current.checkpoints.map((c) => ({ id: c.id, label: c.label, note: c.note, at: c.at, ...(on && c.id === id ? { key: true } : {}) })) }, true);

  /* ---------- Photos ---------- */
  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setPhotoBusy(true);
    setNotice(null);
    try {
      for (const file of Array.from(files)) {
        if (latest.current.photos.length >= MAX_PHOTOS) { setNotice(`Le rapport est limité à ${MAX_PHOTOS} photos.`); break; }
        const id = newId();
        await putPhoto({ id, reportId: r.id, blob: await shrinkPhoto(file) });
        update({ photos: [...latest.current.photos, { id, caption: "", takenAt: Date.now() }] }, true);
      }
    } catch {
      setNotice("Cette photo n'a pas pu être ajoutée (format non reconnu ou mémoire de l'appareil pleine).");
    } finally { setPhotoBusy(false); }
  }
  async function removePhoto(id: string) {
    update({ photos: latest.current.photos.filter((p) => p.id !== id) }, true);
    await deletePhoto(id).catch(() => {});
  }

  /* ---------- Rapport PDF ---------- */
  async function makePdf() {
    setPdfBusy(true);
    setNotice(null);
    try {
      await persist();
      const rep = latest.current;
      const photos = [];
      for (const p of rep.photos) {
        const stored = await getPhoto(p.id);
        if (stored) photos.push({ bytes: new Uint8Array(await stored.blob.arrayBuffer()), caption: p.caption, takenAt: p.takenAt });
      }
      const bytes = await buildReportPdf(rep, photos);
      const file = new File([bytes as BlobPart], pdfFileName(rep), { type: "application/pdf" });
      setPdf({ file, url: URL.createObjectURL(file), version: rep.updatedAt });
    } catch {
      setNotice("Le PDF n'a pas pu être généré. Réessayez ; si le problème persiste, retirez la dernière photo ajoutée.");
    } finally { setPdfBusy(false); }
  }
  async function share() {
    if (!pdf) return;
    try { await navigator.share({ files: [pdf.file], title: `Rapport d'évacuation — ${reportTitle(r)}` }); }
    catch (e) { if ((e as Error).name !== "AbortError") setNotice("Le partage n'a pas abouti. Utilisez « Télécharger », puis envoyez le fichier depuis vos documents."); }
  }
  /** Envoi par e-mail : le rapport est d'abord transféré, puis le serveur envoie le PDF en pièce jointe. */
  async function sendByEmail() {
    setMail({ kind: "busy", text: "Transfert du rapport…" });
    try {
      await persist();
      onSaved(await pushReport(rec.id));
      setMail({ kind: "busy", text: "Envoi de l'e-mail…" });
      const res = await fetch(`/api/evacuation/reports/${rec.id}/email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: mailTo, message: mailNote }) });
      const data = (await res.json().catch(() => ({}))) as { to?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error || `Erreur du serveur (${res.status})`);
      try { localStorage.setItem(`exevac-mail-${rec.id}`, mailTo); } catch { /* stockage indisponible */ }
      setMail({ kind: "ok", text: `Rapport envoyé à ${(data.to ?? []).join(", ")}.` });
    } catch (e) {
      setMail({ kind: "error", text: e instanceof TypeError ? "Connexion au serveur impossible : réessayez avec du réseau." : (e as Error).message });
    }
  }
  const pdfFresh = pdf && pdf.version === r.updatedAt;
  const canShare = !!pdf && typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [pdf.file] });

  const events = timeline(r);
  const auto = autoAxes(r);
  const flagged = new Set(auto.filter((a) => a.included).map((a) => a.key));
  const evacEnd = evacuatedAt(r);

  return (
    <main className="space-y-5">
      <div className="sticky top-0 z-20 -mx-4 space-y-2 bg-slate-50/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <button className="btn-secondary" onClick={async () => { await persist(); onBack(); }}>← Mes exercices</button>
          <span className={`text-xs ${saveError ? "font-semibold text-brand-700" : "text-slate-500"}`} role="status">
            {saveError ? "Enregistrement impossible sur l'appareil" : "Enregistré sur l'appareil"}
          </span>
        </div>
        {running && r.startedAt && (
          <div className="flex items-center justify-between rounded-xl bg-strong px-4 py-2 text-white">
            <span className="text-sm">Exercice en cours<br /><span className="text-white/70">départ {clockFull(r.startedAt)}</span></span>
            <Running from={r.startedAt} />
          </div>
        )}
      </div>

      <Section title="Informations">
        <div className="card space-y-3 p-4">
          <Text label="Client / site" value={r.client} list="evac-clients" placeholder="Nom de l'établissement"
            onChange={(v) => {
              const hit = clients.find((c) => c.name.toLowerCase() === v.trim().toLowerCase() && c.name !== latest.current.client);
              update({ client: v, ...(hit && hit.address && !latest.current.address.trim() ? { address: hit.address } : {}) });
            }} />
          <datalist id="evac-clients">{clients.map((c) => <option key={c.name} value={c.name} />)}</datalist>
          <Text label="Adresse du site" rows={2} value={r.address} onChange={(v) => update({ address: v })} />
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Date de l'exercice</span>
              <input type="date" className={field} value={r.date} onChange={(e) => update({ date: e.target.value })} />
            </label>
            <Text label="Créé par" value={r.author} placeholder="Votre nom" onChange={(v) => { update({ author: v }); try { localStorage.setItem("exevac-auteur", v); } catch { /* stockage indisponible */ } }} />
          </div>
        </div>
      </Section>

      <Section title="Objectif pédagogique">
        <div className="card space-y-3 p-4">
          {OBJECTIVES.map((o, i) => (
            <div key={i}>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-0.5 h-6 w-6 shrink-0 accent-brand-600" checked={r.objectives[i]}
                  onChange={(e) => update({ objectives: r.objectives.map((x, j) => (j === i ? e.target.checked : x)) })} />
                <span>{o.before}<b>{o.bold}</b>{o.after}</span>
              </label>
              {i === 4 && r.objectives[4] && <input className={`${field} mt-2`} placeholder="Précisez la contrainte" value={r.adaptDetail} onChange={(e) => update({ adaptDetail: e.target.value })} />}
              {i === 5 && r.objectives[5] && <input className={`${field} mt-2`} placeholder="Précisez les moyens testés" value={r.techDetail} onChange={(e) => update({ techDetail: e.target.value })} />}
            </div>
          ))}
          <Text label="Autre" rows={2} value={r.objOther} onChange={(v) => update({ objOther: v })} />
        </div>
      </Section>

      <Section title="Scénario">
        <div className="card space-y-3 p-4">
          {SCENARIOS.map((label, i) => (
            <label key={label} className="flex items-center gap-3 text-sm font-medium">
              <input type="checkbox" className="h-6 w-6 shrink-0 accent-brand-600" checked={r.scenarioChoices[i]}
                onChange={(e) => update({ scenarioChoices: r.scenarioChoices.map((x, j) => (j === i ? e.target.checked : x)) })} />
              {label}
            </label>
          ))}
          <Text label="Précisions (facultatif)" rows={3} value={r.scenario} placeholder="Ex. : depuis le déclencheur manuel du 1er étage, fumigène dans le local archives" onChange={(v) => update({ scenario: v })} />
        </div>
      </Section>

      <Section title="Particularités">
        <div className="card p-4">
          <Question text="Présence d'un PC sécurité ?"><Choice label="PC sécurité" value={r.pcSecurite} options={YN} onChange={(v) => update({ pcSecurite: v })} /></Question>
          <Question text="Présence d'une alarme générale ?"><Choice label="Alarme générale" value={r.alarmeGenerale} options={YN} onChange={(v) => update({ alarmeGenerale: v })} /></Question>
          <Question text="Temporisation (minutes)">
            <input className={`${field} w-20 text-center`} inputMode="numeric" value={r.temporisation} onChange={(e) => update({ temporisation: e.target.value })} aria-label="Temporisation en minutes" />
          </Question>
          <div className="space-y-3 border-t border-slate-100 pt-3">
            <Text label="Type de l'établissement" value={r.etabType} placeholder="ERP, ERT, IGH…" onChange={(v) => update({ etabType: v })} />
            <Text label="Autre" rows={2} value={r.partOther} onChange={(v) => update({ partOther: v })} />
          </div>
        </div>
      </Section>

      <Section title="Déroulé de l'exercice">
        {!r.startedAt ? (
          <button onClick={start} className="w-full rounded-2xl bg-emerald-600 px-4 py-6 font-display text-2xl font-bold tracking-wide text-white uppercase shadow active:bg-emerald-500">
            ▶ Départ de l'exercice
          </button>
        ) : (
          <div className="card border-emerald-300 bg-emerald-50 p-4">
            <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setEditing(editing === "start" ? null : "start")}>
              <span><span className="block text-xs font-semibold text-emerald-800 uppercase">Départ</span><span className="text-sm whitespace-pre-line">{r.startNote || "Départ de l'exercice"}</span></span>
              <span className="font-display text-2xl font-bold text-emerald-800 tabular-nums">{clockFull(r.startedAt)}</span>
            </button>
            {editing === "start" && (
              <div className="mt-3 space-y-3 border-t border-emerald-200 pt-3">
                <Text label="Texte du déroulé" rows={2} value={r.startNote} onChange={(v) => update({ startNote: v })} />
                <TimeInput label="Heure de départ" at={r.startedAt} onChange={(ms) => update({ startedAt: ms }, true)} />
                <button className="btn-secondary" onClick={cancelStart}>Annuler le départ</button>
              </div>
            )}
          </div>
        )}

        <p className="text-sm text-slate-500">
          {r.startedAt ? "Touchez un repère au moment où vous l'observez : l'heure et le temps écoulé depuis le départ sont enregistrés. En cas d'erreur, « Décocher »." : "Repères à observer : vous pouvez les renommer ou en ajouter avant le départ."}
        </p>
        <div className="space-y-2">
          {r.checkpoints.map((c) => (
            <div key={c.id} className={`card overflow-hidden ${c.at ? "border-emerald-300 bg-emerald-50" : ""} ${c.key ? "border-2" : ""}`}>
              <button onClick={() => tap(c)} className="flex w-full items-center gap-3 p-3.5 text-left" aria-pressed={!!c.at}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border-2 text-lg font-bold ${c.at ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-400 text-transparent"}`}>✓</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{c.label || "Repère sans nom"}</span>
                  {c.key && <span className="block text-xs text-slate-500">fixe le temps d'évacuation</span>}
                  {c.note && <span className="block text-sm whitespace-pre-line text-slate-600">{c.note}</span>}
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block font-display text-xl font-bold tabular-nums ${c.at ? "text-emerald-800" : "text-slate-300"}`}>{c.at ? clockFull(c.at) : "--:--:--"}</span>
                  {c.at && <span className="block text-sm font-semibold text-emerald-700 tabular-nums">{sinceStart(r.startedAt, c.at)}</span>}
                </span>
              </button>
              {editing === c.id ? (
                <div className="space-y-3 border-t border-slate-200 bg-surface p-3.5">
                  <Text label="Intitulé" value={c.label} onChange={(v) => setCheckpoint(c.id, { label: v })} />
                  <Text label="Observation" rows={2} value={c.note} onChange={(v) => setCheckpoint(c.id, { note: v })} />
                  {c.at && <TimeInput label="Heure" at={c.at} onChange={(ms) => setCheckpoint(c.id, { at: ms }, true)} />}
                  <label className="flex items-center gap-3 text-sm">
                    <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={!!c.key} onChange={(e) => setKey(c.id, e.target.checked)} />
                    Ce repère marque la fin de l'évacuation
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-primary" onClick={() => setEditing(null)}>Terminé</button>
                    {c.at && <button className="btn-secondary" onClick={() => setCheckpoint(c.id, { at: null }, true)}>Décocher</button>}
                    <button className="btn-secondary" onClick={() => { update({ checkpoints: latest.current.checkpoints.filter((x) => x.id !== c.id) }, true); setEditing(null); }}>Supprimer le repère</button>
                  </div>
                </div>
              ) : (
                <div className={`grid border-t text-sm ${c.at ? "grid-cols-2 border-emerald-200" : "border-slate-100"}`}>
                  {c.at && <button className="border-r border-emerald-200 py-2.5 font-medium text-brand-700" onClick={() => setCheckpoint(c.id, { at: null }, true)}>✕ Décocher</button>}
                  <button className="py-2.5 text-slate-600" onClick={() => setEditing(c.id)}>Modifier</button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-secondary py-3" onClick={addCheckpoint}>+ Autre repère{running ? " (maintenant)" : ""}</button>
          <label className={`btn-secondary cursor-pointer py-3 ${photoBusy ? "opacity-50" : ""}`}>
            📷 Photo
            <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={photoBusy} onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
          </label>
        </div>

        {!r.stoppedAt ? (
          <button onClick={stop} disabled={!r.startedAt} className="w-full rounded-2xl bg-brand-600 px-4 py-6 font-display text-2xl font-bold tracking-wide text-white uppercase shadow active:bg-brand-500 disabled:opacity-30">
            ■ Arrêt de l'exercice
          </button>
        ) : (
          <div className="card border-brand-100 bg-brand-50 p-4">
            <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setEditing(editing === "stop" ? null : "stop")}>
              <span><span className="block text-xs font-semibold text-brand-700 uppercase">Arrêt</span><span className="text-sm whitespace-pre-line">{r.stopNote || "Fin de l'exercice"}</span></span>
              <span className="shrink-0 text-right">
                <span className="block font-display text-2xl font-bold text-brand-700 tabular-nums">{clockFull(r.stoppedAt)}</span>
                <span className="block text-sm font-semibold text-brand-700 tabular-nums">{sinceStart(r.startedAt, r.stoppedAt)}</span>
              </span>
            </button>
            {editing === "stop" && (
              <div className="mt-3 space-y-3 border-t border-brand-100 pt-3">
                <Text label="Texte du déroulé" rows={3} value={r.stopNote} onChange={(v) => update({ stopNote: v })} />
                <TimeInput label="Heure d'arrêt" at={r.stoppedAt} onChange={(ms) => update({ stoppedAt: ms }, true)} />
                <button className="btn-secondary" onClick={() => { update({ stoppedAt: null }, true); setEditing(null); }}>Reprendre l'exercice</button>
              </div>
            )}
          </div>
        )}

        {r.startedAt && r.stoppedAt && (
          <div className="card p-4 text-sm">
            <Question text="Heure de départ d'évacuation"><b className="tabular-nums">{clockFull(r.startedAt)}</b></Question>
            <Question text={`Temps d'évacuation${r.checkpoints.some((c) => c.key && c.at) ? "" : " (jusqu'à l'arrêt, faute de repère de fin d'évacuation)"}`}>
              <b className="tabular-nums">{evacEnd && evacEnd >= r.startedAt ? durationFr(evacEnd - r.startedAt) : "—"}</b>
            </Question>
            <Question text="Durée totale de l'exercice"><b className="tabular-nums">{durationFr(r.stoppedAt - r.startedAt)}</b></Question>
            <div className="border-t border-slate-100 pt-3">
              <Text label="Temps d'évacuation à inscrire au rapport (laisser vide pour le temps calculé)" value={r.evacTimeManual} placeholder={evacTime({ ...r, evacTimeManual: "" })} onChange={(v) => update({ evacTimeManual: v })} />
            </div>
          </div>
        )}
        {events.length > 10 && <p className="text-xs text-slate-500">Le modèle prévoit 10 lignes de déroulé : les {events.length - 10} suivantes figureront sur une page annexe.</p>}
      </Section>

      <Section title="Procédures">
        <div className="card p-4">
          {PROCEDURES.map((q, i) => (
            <div key={i}>
              <Question text={q} flagged={flagged.has(`p${i}`)}><Choice label={q} value={r.procedures[i]} options={TRI} onChange={(v) => update({ procedures: r.procedures.map((x, j) => (j === i ? v : x)) })} /></Question>
              {i === NOT_EVACUATED_AFTER && (
                <Question text="Nombre de personnes non évacuées">
                  <input className={`${field} w-20 text-center`} inputMode="numeric" value={r.notEvacuated} onChange={(e) => update({ notEvacuated: e.target.value })} aria-label="Nombre de personnes non évacuées" />
                </Question>
              )}
            </div>
          ))}
          <p className="pt-2 text-xs text-slate-500">S.P. = sans propos. Touchez de nouveau une réponse pour l'effacer.</p>
        </div>
      </Section>

      <Section title="Chargés d'évacuation">
        <div className="card p-4">
          <Text label="Les chargés d'évacuation ont été :" value={r.chargesText} placeholder="organisés, réactifs…" onChange={(v) => update({ chargesText: v })} />
          <div className="mt-3">
            {CHARGES.map((q, i) => (
              <Question key={i} text={q} flagged={flagged.has(`c${i}`)}><Choice label={q} value={r.charges[i]} options={TRI} onChange={(v) => update({ charges: r.charges.map((x, j) => (j === i ? v : x)) })} /></Question>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Moyens techniques">
        <div className="card p-4">
          <Text label="Dysfonctionnements éventuels observés" rows={3} value={r.moyens} onChange={(v) => update({ moyens: v })} />
          <p className="mt-2 text-xs text-slate-500">Ces remarques ne valent pas une visite de conformité.</p>
        </div>
      </Section>

      <Section title="Points forts · Axes d'amélioration">
        <div className="card space-y-3 p-4">
          <Text label="Points forts" rows={4} value={r.pointsForts} onChange={(v) => update({ pointsForts: v })} />
          {auto.length > 0 && (
            <div className="rounded-lg bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-900">Relevés d'après vos réponses</p>
              <p className="mb-2 text-xs text-amber-800">Ajoutés automatiquement aux axes d'amélioration du rapport. Décochez ceux à ne pas retenir.</p>
              <div className="space-y-2">
                {auto.map((a) => (
                  <label key={a.key} className={`flex items-start gap-3 text-sm ${a.included ? "" : "text-slate-500 line-through"}`}>
                    <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" checked={a.included}
                      onChange={(e) => update({ axesExcluded: e.target.checked ? r.axesExcluded.filter((k) => k !== a.key) : [...r.axesExcluded, a.key] })} />
                    <span>{a.text}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <Text label={auto.length ? "Autres axes d'amélioration" : "Axes d'amélioration"} rows={4} value={r.axes} onChange={(v) => update({ axes: v })} />
        </div>
      </Section>

      <Section title="Photos">
        <div className="grid grid-cols-2 gap-2">
          <label className={`btn-secondary cursor-pointer py-3 ${photoBusy ? "opacity-50" : ""}`}>
            📷 Prendre une photo
            <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={photoBusy} onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
          </label>
          <label className={`btn-secondary cursor-pointer py-3 ${photoBusy ? "opacity-50" : ""}`}>
            Depuis la galerie
            <input type="file" accept="image/*" multiple className="sr-only" disabled={photoBusy} onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
        {photoBusy && <p className="text-sm text-slate-500" role="status">Ajout de la photo…</p>}
        {r.photos.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {r.photos.map((p) => (
              <div key={p.id} className="card overflow-hidden">
                {thumbs[p.id]
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={thumbs[p.id]} alt={p.caption || "Photo de l'exercice"} className="aspect-[4/3] w-full object-cover" />
                  : <div className="grid aspect-[4/3] place-items-center bg-slate-100 text-xs text-slate-500">Photo</div>}
                <div className="space-y-2 p-2">
                  <input className="input" placeholder="Légende" value={p.caption} aria-label="Légende de la photo"
                    onChange={(e) => update({ photos: latest.current.photos.map((x) => (x.id === p.id ? { ...x, caption: e.target.value } : x)) })} />
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="tabular-nums">{clockFull(p.takenAt)}</span>
                    <button className="font-medium text-brand-700" onClick={() => window.confirm("Supprimer cette photo ?") && void removePhoto(p.id)}>Supprimer</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Rapport">
        {notice && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="status">{notice}</p>}
        <div className="card space-y-3 p-4">
          {!r.client.trim() && <p className="text-sm text-amber-800">Le nom du client n'est pas renseigné.</p>}
          {status !== "TERMINE" && <p className="text-sm text-amber-800">L'exercice n'est pas terminé : le rapport sera incomplet.</p>}
          <button className="btn-primary w-full py-3 text-base" disabled={pdfBusy} onClick={makePdf}>
            {pdfBusy ? "Génération…" : pdf ? "Régénérer le rapport PDF" : "Générer le rapport PDF"}
          </button>
          {pdf && (
            <>
              {!pdfFresh && <p className="text-sm text-amber-800">Le rapport a été modifié depuis : régénérez le PDF pour l'inclure.</p>}
              <div className={`grid gap-2 ${canShare ? "grid-cols-3" : "grid-cols-2"}`}>
                <a className="btn-secondary py-3" href={pdf.url} target="_blank" rel="noreferrer">Aperçu</a>
                {canShare && <button className="btn-secondary py-3" onClick={share}>Partager</button>}
                <a className="btn-secondary py-3" href={pdf.url} download={pdf.file.name}>Télécharger</a>
              </div>
              <p className="text-xs text-slate-500">« Partager » ouvre vos applications (e-mail, messagerie…) avec le PDF en pièce jointe.</p>
            </>
          )}
        </div>

        <div className="card space-y-3 p-4">
          <p className="text-sm">
            {rec.dirty
              ? rec.syncedAt ? "Des modifications ne sont pas encore transférées." : "Ce rapport n'existe que sur cet appareil."
              : `Transféré le ${new Date(rec.syncedAt ?? 0).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}.`}
          </p>
          <button className="btn-primary w-full py-3 text-base" disabled={!canSync || syncing || !rec.dirty} onClick={async () => { await persist(); onSync(); }}>
            {syncing ? "Transfert…" : rec.dirty ? "Transférer le rapport" : "Déjà transféré"}
          </button>
          {!online && <p className="text-xs text-slate-500">Hors ligne : le transfert vous sera proposé dès qu'un réseau sera disponible.</p>}
        </div>

        {canEmail && (
          <div className="card space-y-3 p-4">
            <p className="text-sm font-semibold">Envoyer le rapport par e-mail</p>
            <label className="block">
              <span className="label">Destinataire(s)</span>
              <input className={field} type="email" multiple inputMode="email" autoComplete="off" autoCapitalize="none" placeholder="contact@client.fr, direction@client.fr" value={mailTo} onChange={(e) => setMailTo(e.target.value)} />
            </label>
            <Text label="Message (facultatif)" rows={2} value={mailNote} onChange={setMailNote} />
            <button className="btn-primary w-full py-3 text-base" disabled={mail?.kind === "busy" || syncing || !mailTo.trim()} onClick={sendByEmail}>
              {mail?.kind === "busy" ? mail.text : "Envoyer le PDF par e-mail"}
            </button>
            {mail && mail.kind !== "busy" && <p className={`text-sm ${mail.kind === "ok" ? "text-emerald-800" : "text-brand-700"}`} role="status">{mail.text}</p>}
            <p className="text-xs text-slate-500">Le rapport est d'abord transféré, puis envoyé en pièce jointe avec un court message d'accompagnement.</p>
          </div>
        )}

        <button className="w-full py-2 text-sm text-slate-500 underline" onClick={onDelete}>
          Supprimer ce rapport
        </button>
      </Section>
    </main>
  );
}
