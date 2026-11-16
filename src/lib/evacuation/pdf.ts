/* Génération du rapport d'évacuation en PDF : le gabarit FORMAST d'origine est complété aux emplacements exacts
   des champs du formulaire. Fonctionne à l'identique dans le navigateur (hors ligne) et sur le serveur. */
import { LineCapStyle, PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { TEMPLATE_PDF_BASE64 } from "./template";
import { DEROULE_SLOTS, axesText, clockFull, clockLower, clockUpper, dateFr, evacTime, scenarioText, timeline, type EvacReport, type Tri } from "./model";

type Rect = [number, number, number, number]; // x1, y1, x2, y2 (points, origine en bas à gauche)
type TextOpts = { size: number; min?: number; color?: RGB; align?: "left" | "center"; valign?: "top" | "middle"; multiline?: boolean; pad?: number; font?: PDFFont };

const GREY = rgb(0.27, 0.27, 0.27);
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const RED = rgb(0.753, 0.224, 0.169);
const DARK = rgb(0.34, 0.34, 0.335);

/** Ne garde que les caractères que la police standard sait écrire (les autres deviennent « ? »). */
function clean(font: PDFFont, text: string) {
  const known = new Set(font.getCharacterSet());
  let out = "";
  for (const ch of text.normalize("NFC").replace(/\r\n?/g, "\n").replace(/\t/g, " ").replace(/[‘’]/g, "'").replace(/ | /g, " ")) {
    const cp = ch.codePointAt(0)!;
    out += ch === "\n" || known.has(cp) ? ch : cp < 32 || (cp >= 0xfe00 && cp <= 0xfe0f) || cp === 0x200d ? "" : "?";
  }
  return out;
}

function wrap(font: PDFFont, text: string, size: number, width: number) {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (let word of para.split(" ")) {
      // mot plus large que la zone : coupé caractère par caractère
      while (font.widthOfTextAtSize(word, size) > width && word.length > 1) {
        let n = word.length - 1;
        while (n > 1 && font.widthOfTextAtSize(word.slice(0, n), size) > width) n--;
        if (line) { lines.push(line); line = ""; }
        lines.push(word.slice(0, n));
        word = word.slice(n);
      }
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) line = next;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines;
}

/** Écrit un texte dans une zone ; la taille diminue si nécessaire pour que tout tienne. */
function drawText(page: PDFPage, font: PDFFont, raw: string, rect: Rect, o: TextOpts) {
  const f = o.font ?? font;
  const text = clean(f, raw).trim();
  if (!text) return;
  const pad = o.pad ?? 2;
  const w = rect[2] - rect[0] - pad * 2, h = rect[3] - rect[1] - pad * 2;
  const min = o.min ?? 5;
  let size = o.size, lines: string[] = [];
  for (;;) {
    lines = o.multiline ? wrap(f, text, size, w) : [text.replace(/\n+/g, " ")];
    const fits = o.multiline ? lines.length * size * 1.18 <= h : f.widthOfTextAtSize(lines[0], size) <= w;
    if (fits || size <= min) break;
    size = Math.max(min, size - 0.5);
  }
  const lh = size * 1.18;
  const max = Math.max(1, Math.floor(h / lh));
  if (o.multiline && lines.length > max) { lines = lines.slice(0, max); lines[max - 1] = lines[max - 1].replace(/.{0,3}$/, "…"); }
  if (!o.multiline) while (lines[0].length > 1 && f.widthOfTextAtSize(lines[0], size) > w) lines[0] = lines[0].slice(0, -2) + "…";
  const block = lines.length * lh;
  let y = (o.valign === "top" ? rect[3] - pad : rect[1] + pad + (h + block) / 2) - size * 0.92;
  for (const line of lines) {
    const x = o.align === "center" ? rect[0] + pad + (w - f.widthOfTextAtSize(line, size)) / 2 : rect[0] + pad;
    page.drawText(line, { x, y, size, font: f, color: o.color ?? GREY });
    y -= lh;
  }
}

const dot = (page: PDFPage, r: Rect) => page.drawCircle({ x: (r[0] + r[2]) / 2, y: (r[1] + r[3]) / 2, size: 3.6, color: BLACK });
/** Coche tracée en vectoriel (indépendante des polices du lecteur PDF). */
function tick(page: PDFPage, r: Rect) {
  const x = r[0], y = r[1], o = { thickness: 2.2, color: BLACK, lineCap: LineCapStyle.Round };
  page.drawLine({ start: { x: x + 3.5, y: y + 9 }, end: { x: x + 7.5, y: y + 4.5 }, ...o });
  page.drawLine({ start: { x: x + 7.5, y: y + 4.5 }, end: { x: x + 15, y: y + 14.5 }, ...o });
}
const box = (x: number, y: number): Rect => [x, y, x + 18, y + 18];

/* ---------- Emplacements repris du formulaire d'origine ---------- */

const OBJ_BOXES: Rect[] = [box(19, 651), box(19, 621), box(19, 589), box(19, 557), box(288, 650), box(288, 611), box(289, 555), box(289, 525)];
const PROC_Y = [667, 647, 627, 584, 563, 542, 521, 500, 480, 459, 438, 417, 396];
const TRI_X = { oui: 430, non: 461, sp: 494 } as const;
// chargés d'évacuation : 3 lignes à gauche, 4 à droite
const CHARGE_ROWS: { y: number; x: Record<Exclude<Tri, "">, number> }[] = [
  { y: 275, x: { oui: 212, non: 242, sp: 274 } }, { y: 257, x: { oui: 212, non: 242, sp: 275 } }, { y: 238, x: { oui: 212, non: 242, sp: 275 } },
  { y: 272, x: TRI_X }, { y: 248, x: TRI_X }, { y: 224, x: TRI_X }, { y: 193, x: TRI_X },
];
const DEROULE_TEXT_Y: [number, number][] = [[659, 725], [582, 648], [502, 568], [423, 489], [343, 410]];
const DEROULE_TIME_Y: [number, number][] = [[687, 708], [604, 626], [529, 551], [446, 467], [366, 388]];

export type PdfPhoto = { bytes: Uint8Array; caption: string; takenAt: number };

function base64ToBytes(b64: string) {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function buildReportPdf(r: EvacReport, photos: PdfPhoto[] = []): Promise<Uint8Array> {
  const doc = await PDFDocument.load(base64ToBytes(TEMPLATE_PDF_BASE64));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [p1, p2, p3, p4] = doc.getPages();
  const T = (page: PDFPage, text: string, rect: Rect, o: TextOpts) => drawText(page, font, text, rect, o);
  const oneLineAddress = r.address.split("\n").map((s) => s.trim()).filter(Boolean).join(" - ");

  // Page 1 : couverture
  T(p1, r.client, [80, 475, 286, 509], { size: 10, color: WHITE, align: "center", multiline: true });
  T(p1, r.address, [366, 474, 574, 509], { size: 8.5, color: WHITE, align: "center", multiline: true });
  T(p1, r.author, [235, 52, 548, 74], { size: 8 });

  // Page 2 : contexte, objectifs, scénario, particularités
  T(p2, r.client, [183, 751, 332, 774], { size: 10 });
  T(p2, oneLineAddress, [335, 751, 582, 774], { size: 10, align: "center" });
  T(p2, dateFr(r.date), [237, 731, 380, 753], { size: 10 });
  r.objectives.forEach((on, i) => on && tick(p2, OBJ_BOXES[i]));
  T(p2, r.adaptDetail, [310, 631, 582, 653], { size: 9 });
  T(p2, r.techDetail, [309, 575, 582, 597], { size: 9 });
  T(p2, r.objOther, [21, 459, 571, 498], { size: 8, multiline: true, valign: "top", pad: 6 });
  T(p2, scenarioText(r), [21, 279, 576, 397], { size: 9, multiline: true, valign: "top", pad: 8 });
  if (r.pcSecurite) dot(p2, r.pcSecurite === "oui" ? box(158, 159) : box(189, 159));
  if (r.alarmeGenerale) dot(p2, r.alarmeGenerale === "oui" ? box(158, 132) : box(188, 132));
  T(p2, r.temporisation, [92, 98, 148, 122], { size: 9, align: "center" });
  T(p2, r.etabType, [229, 19, 395, 173], { size: 8, multiline: true, valign: "top", pad: 6 });
  T(p2, r.partOther, [412, 19, 579, 172], { size: 8, multiline: true, valign: "top", pad: 6 });

  // Page 3 : chronométrage, procédures, chargés d'évacuation, moyens techniques
  T(p3, r.startedAt ? clockLower(r.startedAt) : "", [184, 746, 294, 768], { size: 9 });
  T(p3, evacTime(r), [432, 746, 582, 768], { size: 9 });
  r.procedures.forEach((v, i) => v && dot(p3, box(TRI_X[v], PROC_Y[i])));
  T(p3, r.notEvacuated, [439, 603, 469, 625], { size: 8, align: "center" });
  T(p3, r.chargesText, [195, 321, 582, 343], { size: 8.5 });
  r.charges.forEach((v, i) => v && dot(p3, box(CHARGE_ROWS[i].x[v], CHARGE_ROWS[i].y)));
  T(p3, r.moyens, [24, 23, 573, 103], { size: 8.5, multiline: true, valign: "top", pad: 8 });

  // Page 4 : déroulé (5 lignes à gauche puis 5 à droite), points forts, axes d'amélioration
  const events = timeline(r);
  events.slice(0, DEROULE_SLOTS).forEach((e, i) => {
    const row = i % 5, right = i >= 5;
    T(p4, clockUpper(e.at), [right ? 339 : 40, DEROULE_TIME_Y[row][0], right ? 382 : 83, DEROULE_TIME_Y[row][1]], { size: 11.5, color: BLACK, align: "center", pad: 0 });
    T(p4, e.text, [right ? 395 : 96, DEROULE_TEXT_Y[row][0], right ? 578 : 279, DEROULE_TEXT_Y[row][1]], { size: 8, multiline: true, valign: "top", pad: 5 });
  });
  T(p4, r.pointsForts, [20, 23, 257, 286], { size: 10.5, multiline: true, valign: "top", pad: 8 });
  T(p4, axesText(r), [337, 22, 576, 285], { size: 10.5, multiline: true, valign: "top", pad: 8 });

  // Pages annexes : suite du déroulé, puis photos
  const W = 595.28, H = 841.89, M = 36;
  const annex = (title: string) => {
    const page = doc.addPage([W, H]);
    page.drawRectangle({ x: M, y: H - 78, width: W - M * 2, height: 34, color: RED });
    const size = 17, label = clean(bold, title);
    page.drawText(label, { x: (W - bold.widthOfTextAtSize(label, size)) / 2, y: H - 67, size, font: bold, color: WHITE });
    const sub = clean(font, [r.client, dateFr(r.date)].filter(Boolean).join(" · "));
    page.drawText(sub, { x: (W - font.widthOfTextAtSize(sub, 9)) / 2, y: H - 94, size: 9, font, color: DARK });
    return page;
  };

  const extra = events.slice(DEROULE_SLOTS);
  if (extra.length) {
    let page = annex("DÉROULÉ (SUITE)"), y = H - 120;
    for (const e of extra) {
      const lines = wrap(font, clean(font, e.text), 9, W - M * 2 - 70);
      const h = Math.max(22, lines.length * 11 + 10);
      if (y - h < M) { page = annex("DÉROULÉ (SUITE)"); y = H - 120; }
      page.drawText(clockUpper(e.at), { x: M, y: y - 14, size: 11.5, font: bold, color: RED });
      lines.forEach((l, i) => page.drawText(l, { x: M + 62, y: y - 13 - i * 11, size: 9, font, color: GREY }));
      page.drawLine({ start: { x: M, y: y - h }, end: { x: W - M, y: y - h }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
      y -= h + 4;
    }
  }

  const images: { img: PDFImage; p: PdfPhoto }[] = [];
  for (const p of photos) {
    try {
      const png = p.bytes[0] === 0x89 && p.bytes[1] === 0x50;
      images.push({ img: png ? await doc.embedPng(p.bytes) : await doc.embedJpg(p.bytes), p });
    } catch { /* image illisible : ignorée */ }
  }
  const cellW = (W - M * 2 - 16) / 2, cellH = (H - 120 - M - 16) / 2;
  images.forEach(({ img, p }, i) => {
    const page = i % 4 === 0 ? annex("PHOTOS") : doc.getPage(doc.getPageCount() - 1);
    const col = i % 2, row = Math.floor((i % 4) / 2);
    const x = M + col * (cellW + 16), top = H - 112 - row * (cellH + 16);
    const capH = 30, s = Math.min(cellW / img.width, (cellH - capH) / img.height);
    const w = img.width * s, h = img.height * s;
    page.drawImage(img, { x: x + (cellW - w) / 2, y: top - h, width: w, height: h });
    drawText(page, font, [clockFull(p.takenAt), p.caption].filter(Boolean).join(" — "), [x, top - h - capH, x + cellW, top - h - 2], { size: 8.5, multiline: true, valign: "top", align: "center", color: DARK });
  });

  doc.setTitle(`Rapport d'évacuation — ${r.client || "sans nom"} — ${dateFr(r.date)}`);
  doc.setAuthor(r.author ? `${r.author} (FORMAST)` : "FORMAST");
  doc.setSubject("Exercice d'évacuation incendie");
  doc.setCreationDate(new Date());
  return doc.save();
}
