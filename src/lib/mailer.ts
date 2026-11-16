/* Envoi d'e-mails, facultatif. Deux façons de le configurer (variables d'environnement) :
   - une boîte e-mail existante : EMAIL_FROM + SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
   - le service Resend          : EMAIL_FROM + RESEND_API_KEY
   Sans configuration, l'appli fonctionne normalement et ne propose simplement pas l'envoi. */
import nodemailer from "nodemailer";

export type Mail = { to: string[]; cc?: string[]; subject: string; text: string; attachments?: { filename: string; content: Buffer }[] };

const env = (k: string) => process.env[k]?.trim() || "";

export function mailConfigured() {
  return !!env("EMAIL_FROM") && (!!env("RESEND_API_KEY") || !!env("SMTP_HOST"));
}
/** Adresses mises en copie de chaque envoi (ex. le secrétariat), séparées par des virgules. */
export const mailCopyTo = () => parseEmails(env("EMAIL_COPY_TO"));

const EMAIL_RE = /^[^\s@<>,;"']+@[^\s@<>,;"']+\.[a-z]{2,}$/i;
/** Découpe « a@x.fr, b@y.fr » en adresses valides, sans doublon. */
export function parseEmails(input: string): string[] {
  const seen = new Set<string>();
  for (const part of input.split(/[\s,;]+/)) {
    const e = part.trim().toLowerCase();
    if (e && e.length <= 200 && EMAIL_RE.test(e)) seen.add(e);
  }
  return [...seen];
}

export async function sendMail(mail: Mail): Promise<void> {
  const from = env("EMAIL_FROM");
  const replyTo = env("EMAIL_REPLY_TO") || undefined;
  if (env("RESEND_API_KEY")) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: mail.to, cc: mail.cc?.length ? mail.cc : undefined, reply_to: replyTo, subject: mail.subject, text: mail.text,
        attachments: mail.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })),
      }),
    });
    if (!res.ok) throw new Error(`Resend a refusé l'envoi (${res.status}) : ${(await res.text()).slice(0, 300)}`);
    return;
  }
  const port = Number(env("SMTP_PORT")) || 587;
  const transport = nodemailer.createTransport({
    host: env("SMTP_HOST"), port, secure: port === 465, // 465 : TLS direct ; 587 : STARTTLS
    auth: env("SMTP_USER") ? { user: env("SMTP_USER"), pass: env("SMTP_PASS") } : undefined,
    connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000,
  });
  await transport.sendMail({ from, to: mail.to, cc: mail.cc, replyTo, subject: mail.subject, text: mail.text, attachments: mail.attachments });
}
