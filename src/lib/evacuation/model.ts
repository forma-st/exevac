/* Rapport d'exercice d'évacuation : modèle de données commun au navigateur (saisie hors ligne) et au serveur. */

export type Tri = "oui" | "non" | "sp" | "";
export type YesNo = "oui" | "non" | "";

export type Checkpoint = { id: string; label: string; note: string; at: number | null; key?: boolean };
export type PhotoMeta = { id: string; caption: string; takenAt: number };

export type EvacReport = {
  id: string;
  version: 1;
  createdAt: number;
  updatedAt: number;
  // informations
  client: string;
  address: string;
  date: string; // AAAA-MM-JJ
  author: string;
  // objectif pédagogique
  objectives: boolean[];
  adaptDetail: string;
  techDetail: string;
  objOther: string;
  // scénario et particularités
  scenarioChoices: boolean[]; // cases cochées, dans l'ordre de SCENARIOS
  scenario: string;           // précisions libres
  pcSecurite: YesNo;
  alarmeGenerale: YesNo;
  temporisation: string;
  etabType: string;
  partOther: string;
  // déroulé (horodatages en millisecondes)
  startedAt: number | null;
  stoppedAt: number | null;
  startNote: string;
  stopNote: string;
  checkpoints: Checkpoint[];
  evacTimeManual: string;
  // observations
  procedures: Tri[];
  notEvacuated: string;
  chargesText: string;
  charges: Tri[];
  moyens: string;
  pointsForts: string;
  axes: string;               // axes rédigés par le formateur
  axesExcluded: string[];     // points relevés automatiquement que le formateur a écartés (ex. "p5", "c2")
  photos: PhotoMeta[];
};

/** Ordre = cases du rapport (colonne de gauche puis colonne de droite). */
export const OBJECTIVES: { before: string; bold: string; after: string }[] = [
  { before: "Évaluer la ", bold: "connaissance des consignes", after: " du personnel" },
  { before: "Évaluer la ", bold: "cohérence des consignes", after: " d'évacuation" },
  { before: "Évaluer la ", bold: "capacité des chargés d'évacuation", after: " à appliquer leurs procédures" },
  { before: "Évaluer la ", bold: "pertinence des itinéraires", after: " d'évacuation" },
  { before: "Évaluer la ", bold: "capacité d'adaptation", after: " à une contrainte" },
  { before: "Tester les ", bold: "moyens techniques", after: " permettant l'évacuation du personnel" },
  { before: "Évaluer la capacité à déterminer ", bold: "si l'évacuation du bâtiment sinistré est complète", after: "" },
  { before: "Évaluer la ", bold: "procédure de transfert horizontal", after: "" },
];
export const objectiveLabel = (i: number) => OBJECTIVES[i].before + OBJECTIVES[i].bold + OBJECTIVES[i].after;

/** Cas de scénario proposés en cases à cocher (plusieurs possibles), complétés par un texte libre. */
export const SCENARIOS = ["Déclenchement DM", "Déclenchement SSI", "Simulation incendie"];
/** Texte du cadre « Scénario » du rapport : cases cochées, puis précisions. */
export function scenarioText(r: Pick<EvacReport, "scenarioChoices" | "scenario">) {
  const picked = SCENARIOS.filter((_, i) => r.scenarioChoices[i]).join(" · ");
  return [picked, r.scenario.trim()].filter(Boolean).join("\n");
}

export const PROCEDURES = [
  "Les occupants ont appliqué les consignes de sécurité incendie ?",
  "Tout le monde a entendu l'alarme ?",
  "Tout le monde a évacué ?",
  "Évacuation immédiate à l'audition du signal d'alarme",
  "Évacuation en bon ordre et dans le calme",
  "Les portes et fenêtres ont été fermées",
  "Les ascenseurs sont restés inutilisés",
  "Tout le monde a respecté la consigne « ne pas revenir en arrière »",
  "Tout le monde a rejoint le point de rassemblement",
  "Les personnes à mobilité réduite ont rejoint l'espace d'attente sécurisé",
  "Le recensement des personnes a été effectué sans problème",
  "Des personnes ont quitté la zone de rassemblement sans autorisation",
  "Les consignes particulières de sécurité ont été respectées",
];
/** La ligne « Nombre de personnes non évacuées » s'affiche après cette question (index). */
export const NOT_EVACUATED_AFTER = 2;

export const CHARGES = [
  "Ils étaient identifiables par un signe distinctif",
  "Toutes les zones ont été visitées",
  "Le choix de l'itinéraire était cohérent",
  "Une chaise d'évacuation a été mise en œuvre",
  "Le compte rendu a été fait",
  "Il a été fait à la bonne personne",
  "Les personnes présentant un handicap ont été bien prises en charge",
];

/* ---------- Axes d'amélioration relevés automatiquement ----------
   Chaque réponse défavorable (« non » en général ; « oui » pour la question inversée) propose un axe d'amélioration. */
const PROCEDURE_AXES: { when: Tri; text: string }[] = [
  { when: "non", text: "Consignes de sécurité incendie non appliquées par les occupants" },
  { when: "non", text: "Alarme non entendue par tout le monde" },
  { when: "non", text: "Évacuation incomplète : tout le monde n'a pas évacué" },
  { when: "non", text: "Évacuation non immédiate à l'audition du signal d'alarme" },
  { when: "non", text: "Évacuation à effectuer en bon ordre et dans le calme" },
  { when: "non", text: "Portes et fenêtres non fermées" },
  { when: "non", text: "Ascenseurs utilisés pendant l'évacuation" },
  { when: "non", text: "Consigne « ne pas revenir en arrière » non respectée" },
  { when: "non", text: "Point de rassemblement non rejoint par tout le monde" },
  { when: "non", text: "Espace d'attente sécurisé non rejoint par les personnes à mobilité réduite" },
  { when: "non", text: "Recensement des personnes difficile" },
  { when: "oui", text: "Des personnes ont quitté la zone de rassemblement sans autorisation" },
  { when: "non", text: "Consignes particulières de sécurité non respectées" },
];
const CHARGE_AXES = [
  "Chargés d'évacuation non identifiables par un signe distinctif",
  "Toutes les zones n'ont pas été visitées",
  "Choix de l'itinéraire d'évacuation à revoir",
  "Chaise d'évacuation non mise en œuvre",
  "Compte rendu non effectué",
  "Compte rendu non fait à la bonne personne",
  "Prise en charge des personnes en situation de handicap à améliorer",
];
export type AutoAxis = { key: string; text: string; included: boolean };
/** Points à améliorer déduits des réponses, dans l'ordre du rapport. */
export function autoAxes(r: Pick<EvacReport, "procedures" | "charges" | "axesExcluded">): AutoAxis[] {
  const out: AutoAxis[] = [];
  const add = (key: string, text: string) => out.push({ key, text, included: !r.axesExcluded.includes(key) });
  PROCEDURE_AXES.forEach((a, i) => { if (r.procedures[i] === a.when) add(`p${i}`, a.text); });
  CHARGE_AXES.forEach((text, i) => { if (r.charges[i] === "non") add(`c${i}`, text); });
  return out;
}
/** Texte du cadre « Axes d'améliorations » du rapport : points relevés retenus, puis texte du formateur. */
export function axesText(r: Pick<EvacReport, "procedures" | "charges" | "axesExcluded" | "axes">) {
  const auto = autoAxes(r).filter((a) => a.included).map((a) => `- ${a.text}`).join("\n");
  return [auto, r.axes.trim()].filter(Boolean).join("\n");
}

export const TRI_LABEL: Record<Tri, string> = { oui: "Oui", non: "Non", sp: "Sans propos", "": "" };

/** Repères proposés par défaut ; « key » = moment qui fixe le temps d'évacuation. */
const DEFAULT_CHECKPOINTS: Omit<Checkpoint, "id">[] = [
  { label: "Sortie des premières personnes", note: "", at: null },
  { label: "Premières arrivées au point de rassemblement", note: "", at: null },
  { label: "Sortie des dernières personnes (serre-files)", note: "", at: null, key: true },
  { label: "Compte rendu au responsable d'évacuation", note: "", at: null },
  { label: "Recensement terminé", note: "", at: null },
];

export const DEROULE_SLOTS = 10;

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => ((Math.random() * 16) | (c === "x" ? 0 : 8)).toString(16));

const pad = (n: number) => String(n).padStart(2, "0");
export const todayIso = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function emptyReport(author: string): EvacReport {
  const now = Date.now();
  return {
    id: newId(), version: 1, createdAt: now, updatedAt: now,
    client: "", address: "", date: todayIso(), author,
    objectives: OBJECTIVES.map(() => false), adaptDetail: "", techDetail: "", objOther: "",
    scenarioChoices: SCENARIOS.map(() => false), scenario: "", pcSecurite: "", alarmeGenerale: "", temporisation: "", etabType: "", partOther: "",
    startedAt: null, stoppedAt: null, startNote: "Déclenchement de l'alarme", stopNote: "Fin de l'exercice d'évacuation",
    checkpoints: DEFAULT_CHECKPOINTS.map((c) => ({ ...c, id: newId() })), evacTimeManual: "",
    procedures: PROCEDURES.map(() => ""), notEvacuated: "", chargesText: "", charges: CHARGES.map(() => ""),
    moyens: "", pointsForts: "", axes: "", axesExcluded: [], photos: [],
  };
}

/* ---------- Formats (heure locale de l'appareil ; sur le serveur : Europe/Paris) ---------- */

const TZ = typeof window === "undefined" ? "Europe/Paris" : undefined;
function hmParts(ms: number) {
  const p = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: TZ }).formatToParts(new Date(ms));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return { h: g("hour"), m: g("minute"), s: g("second") };
}
/** 12h08 */
export const clockLower = (ms: number) => { const { h, m } = hmParts(ms); return `${h}h${m}`; };
/** 12H08 */
export const clockUpper = (ms: number) => clockLower(ms).toUpperCase();
/** 12:08:31 */
export const clockFull = (ms: number) => { const { h, m, s } = hmParts(ms); return `${h}:${m}:${s}`; };
/** 21/10/2026 */
export const dateFr = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };
/** 3 min 54 s */
export function durationFr(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h} h ${pad(m)} min ${pad(r)} s` : `${m} min ${pad(r)} s`;
}
/** T+3 min 27 s : temps écoulé depuis le départ de l'exercice */
export function sinceStart(startedAt: number | null, at: number | null) {
  if (!startedAt || !at) return "";
  return `T${at < startedAt ? "−" : "+"}${durationFr(Math.abs(at - startedAt))}`;
}
/** 03:54 (chronomètre) */
export function chrono(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  return `${h ? h + ":" : ""}${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/* ---------- Valeurs calculées ---------- */

/** Moment où l'évacuation est considérée terminée : repère « clé » coché, sinon arrêt de l'exercice. */
export function evacuatedAt(r: EvacReport): number | null {
  return r.checkpoints.find((c) => c.key && c.at)?.at ?? r.stoppedAt;
}
export function evacTime(r: EvacReport): string {
  if (r.evacTimeManual.trim()) return r.evacTimeManual.trim();
  const end = evacuatedAt(r);
  return r.startedAt && end && end >= r.startedAt ? durationFr(end - r.startedAt) : "";
}
export type ReportStatus = "BROUILLON" | "EN_COURS" | "TERMINE";
export const statusOf = (r: Pick<EvacReport, "startedAt" | "stoppedAt">): ReportStatus => (r.stoppedAt ? "TERMINE" : r.startedAt ? "EN_COURS" : "BROUILLON");
export const STATUS_LABEL: Record<ReportStatus, string> = { BROUILLON: "Brouillon", EN_COURS: "En cours", TERMINE: "Terminé" };

/** Lignes du déroulé, dans l'ordre chronologique : départ, repères cochés, arrêt. */
export function timeline(r: EvacReport): { at: number; text: string }[] {
  const join = (a: string, b: string) => [a.trim(), b.trim()].filter(Boolean).join("\n");
  const rows: { at: number; text: string }[] = [];
  if (r.startedAt) rows.push({ at: r.startedAt, text: r.startNote.trim() || "Départ de l'exercice" });
  const mid = r.checkpoints.filter((c) => c.at).map((c) => ({ at: c.at as number, text: join(c.label, c.note) }));
  mid.sort((a, b) => a.at - b.at);
  rows.push(...mid);
  if (r.stoppedAt) rows.push({ at: r.stoppedAt, text: r.stopNote.trim() || "Fin de l'exercice" });
  return rows;
}

export const reportTitle = (r: Pick<EvacReport, "client">) => r.client.trim() || "Exercice sans nom";
export function pdfFileName(r: Pick<EvacReport, "client" | "date">) {
  const slug = (r.client || "exercice").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "exercice";
  return `Rapport-evacuation-${slug}-${r.date || "sans-date"}.pdf`;
}

/* ---------- Validation des données reçues (serveur) ou relues (appareil) ---------- */

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const ts = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null);
const tri = (v: unknown): Tri => (v === "oui" || v === "non" || v === "sp" ? v : "");
const yn = (v: unknown): YesNo => (v === "oui" || v === "non" ? v : "");
export const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export const MAX_CHECKPOINTS = 40;
export const MAX_PHOTOS = 24;

/** Reconstruit un rapport propre à partir d'un objet quelconque ; null si l'identifiant est invalide. */
export function sanitizeReport(input: unknown): EvacReport | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (!isUuid(o.id)) return null;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const now = Date.now();
  return {
    id: o.id.toLowerCase(), version: 1, createdAt: ts(o.createdAt) ?? now, updatedAt: ts(o.updatedAt) ?? now,
    client: str(o.client, 200),
    address: str(o.address, 400), date: /^\d{4}-\d{2}-\d{2}$/.test(String(o.date)) ? String(o.date) : "", author: str(o.author, 120),
    objectives: OBJECTIVES.map((_, i) => arr(o.objectives)[i] === true),
    adaptDetail: str(o.adaptDetail, 300), techDetail: str(o.techDetail, 300), objOther: str(o.objOther, 1000),
    scenarioChoices: SCENARIOS.map((_, i) => arr(o.scenarioChoices)[i] === true), scenario: str(o.scenario, 3000), pcSecurite: yn(o.pcSecurite), alarmeGenerale: yn(o.alarmeGenerale),
    temporisation: str(o.temporisation, 20), etabType: str(o.etabType, 1500), partOther: str(o.partOther, 1500),
    startedAt: ts(o.startedAt), stoppedAt: ts(o.stoppedAt), startNote: str(o.startNote, 500), stopNote: str(o.stopNote, 500),
    checkpoints: arr(o.checkpoints).slice(0, MAX_CHECKPOINTS).flatMap((c) => {
      const x = (c ?? {}) as Record<string, unknown>;
      return isUuid(x.id) ? [{ id: x.id, label: str(x.label, 200), note: str(x.note, 500), at: ts(x.at), ...(x.key === true ? { key: true } : {}) }] : [];
    }),
    evacTimeManual: str(o.evacTimeManual, 40),
    procedures: PROCEDURES.map((_, i) => tri(arr(o.procedures)[i])), notEvacuated: str(o.notEvacuated, 10),
    chargesText: str(o.chargesText, 300), charges: CHARGES.map((_, i) => tri(arr(o.charges)[i])),
    moyens: str(o.moyens, 3000), pointsForts: str(o.pointsForts, 3000), axes: str(o.axes, 3000),
    axesExcluded: arr(o.axesExcluded).filter((k): k is string => typeof k === "string" && /^[pc]\d{1,2}$/.test(k)).slice(0, 40),
    photos: arr(o.photos).slice(0, MAX_PHOTOS).flatMap((p) => {
      const x = (p ?? {}) as Record<string, unknown>;
      return isUuid(x.id) ? [{ id: x.id, caption: str(x.caption, 200), takenAt: ts(x.takenAt) ?? now }] : [];
    }),
  };
}

/* ---------- Export structuré, pour le logiciel de gestion de formation ---------- */

export const EXPORT_SCHEMA = "formast.rapport-evacuation/v1";

/** Format d'échange stable : libellés en clair, dates ISO, durées en secondes. */
export function toExport(r: EvacReport, extra: { formateur: { id: string | null; nom: string; email?: string | null }; photoUrl: (id: string) => string; pdfUrl: string }) {
  const iso = (ms: number | null) => (ms ? new Date(ms).toISOString() : null);
  const end = evacuatedAt(r);
  return {
    schema: EXPORT_SCHEMA,
    id: r.id,
    statut: statusOf(r),
    creeLe: iso(r.createdAt), modifieLe: iso(r.updatedAt),
    formateur: extra.formateur,
    client: { nom: r.client, adresse: r.address },
    dateExercice: r.date || null,
    objectifs: OBJECTIVES.map((_, i) => ({ libelle: objectiveLabel(i), retenu: r.objectives[i], precision: i === 4 ? r.adaptDetail : i === 5 ? r.techDetail : "" })),
    objectifAutre: r.objOther,
    scenario: { cas: SCENARIOS.map((libelle, i) => ({ libelle, retenu: r.scenarioChoices[i] })), precisions: r.scenario, texte: scenarioText(r) },
    particularites: { pcSecurite: r.pcSecurite || null, alarmeGenerale: r.alarmeGenerale || null, temporisationMinutes: r.temporisation || null, typeEtablissement: r.etabType, autre: r.partOther },
    chronologie: {
      depart: iso(r.startedAt), finEvacuation: iso(end), arret: iso(r.stoppedAt),
      tempsEvacuationSecondes: r.startedAt && end && end >= r.startedAt ? Math.round((end - r.startedAt) / 1000) : null,
      tempsEvacuationAffiche: evacTime(r),
      dureeExerciceSecondes: r.startedAt && r.stoppedAt ? Math.round((r.stoppedAt - r.startedAt) / 1000) : null,
      evenements: timeline(r).map((e) => ({ horodatage: iso(e.at), secondesDepuisDepart: r.startedAt ? Math.round((e.at - r.startedAt) / 1000) : null, libelle: e.text })),
    },
    procedures: PROCEDURES.map((q, i) => ({ question: q, reponse: r.procedures[i] || null })),
    personnesNonEvacuees: r.notEvacuated || null,
    chargesEvacuation: { appreciation: r.chargesText, points: CHARGES.map((q, i) => ({ question: q, reponse: r.charges[i] || null })) },
    moyensTechniques: r.moyens,
    pointsForts: r.pointsForts,
    axesAmelioration: axesText(r),
    axesAmeliorationReleves: autoAxes(r).filter((a) => a.included).map((a) => a.text),
    photos: r.photos.map((p) => ({ id: p.id, legende: p.caption, priseLe: iso(p.takenAt), url: extra.photoUrl(p.id) })),
    pdf: extra.pdfUrl,
  };
}
