import { db } from "@/lib/db";
import { audit, consume, requestInfo } from "@/lib/security";
import { mailConfigured, mailCopyTo, parseEmails, sendMail } from "@/lib/mailer";
import { dateFr, evacTime, pdfFileName } from "@/lib/evacuation/model";
import { evacAccess, fail, json, loadReport, reportPdf } from "@/lib/evacuation/server";

const MAX_RECIPIENTS = 5;
const HOUR = 3_600_000;

/** Envoie le rapport PDF (régénéré sur le serveur) en pièce jointe. Le rapport doit d'abord avoir été transféré. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await evacAccess(req, { write: true });
  if (a instanceof Response) return a;
  if (a.kind !== "user") return fail("Non autorisé", 401);
  if (!mailConfigured()) return fail("L'envoi d'e-mails n'est pas configuré sur ce serveur.", 503);

  const body = (await req.json().catch(() => null)) as { to?: unknown; message?: unknown } | null;
  const to = parseEmails(typeof body?.to === "string" ? body.to : "");
  if (!to.length) return fail("Indiquez au moins une adresse e-mail valide.");
  if (to.length > MAX_RECIPIENTS) return fail(`${MAX_RECIPIENTS} destinataires au maximum par envoi.`);
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 1500) : "";

  const found = await loadReport(a, (await params).id);
  if (!found) return fail("Rapport introuvable : transférez-le d'abord.", 404);
  const { report } = found;

  // garde-fous contre l'envoi en masse : par appareil (adresse IP) et pour l'ensemble de l'appli
  const { ip } = await requestInfo();
  const limited = (await consume(`mail:ip:${ip}`, 15, HOUR)).blocked || (await consume("mail:all", 150, 24 * HOUR)).blocked;
  if (limited) {
    await audit("RATE_LIMIT", { userId: a.user.id, email: a.user.email, detail: "envoi d'e-mails" });
    return fail("Trop d'envois en peu de temps. Réessayez plus tard.", 429);
  }

  const site = report.client || "votre établissement";
  const text = [
    "Bonjour,",
    "",
    `Veuillez trouver ci-joint le rapport de l'exercice d'évacuation réalisé${report.date ? ` le ${dateFr(report.date)}` : ""} sur le site ${site}.`,
    ...(evacTime(report) ? [`Temps d'évacuation : ${evacTime(report)}.`] : []),
    ...(message ? ["", message] : []),
    "",
    "Cordialement,",
    report.author || found.row.authorName || "L'équipe FORMAST",
    "FORMAST — Sécurité au travail",
  ].join("\n");

  try {
    const pdf = await reportPdf(report);
    await sendMail({
      to, cc: mailCopyTo().filter((e) => !to.includes(e)),
      subject: `Rapport d'exercice d'évacuation — ${report.client || "site"}${report.date ? ` — ${dateFr(report.date)}` : ""}`,
      text, attachments: [{ filename: pdfFileName(report), content: Buffer.from(pdf) }],
    });
  } catch (e) {
    console.error("Envoi d'e-mail :", e);
    return fail("L'e-mail n'a pas pu être envoyé. Vérifiez la configuration de la messagerie, ou utilisez « Partager ».", 502);
  }
  await db.evacuationReport.update({ where: { id: report.id }, data: { lastEmailAt: new Date(), lastEmailTo: to.join(", ") } });
  await audit("EVAC_EMAIL", { userId: a.user.id, email: a.user.email, detail: `${report.client} → ${to.join(", ")}` });
  return json({ ok: true, to });
}
