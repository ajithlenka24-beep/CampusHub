import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";

export interface SentMail {
  to: string;
  subject: string;
  text: string;
  sentAt: Date;
}

/**
 * Sends email through SMTP when SMTP_HOST is configured.
 * Without SMTP (local development) emails are printed to the server console,
 * so links like "reset your password" can still be used.
 */
const outbox: SentMail[] = [];
let transporter: Transporter | null = null;

if (env.smtpEnabled) {
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
}

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  const mail = { to, subject, text, sentAt: new Date() };
  if (transporter) {
    await transporter.sendMail({ from: env.MAIL_FROM, to, subject, text });
    return;
  }
  outbox.push(mail);
  if (outbox.length > 50) outbox.shift();
  if (!env.isTest) {
    console.log(`\n[CampusHub mail — SMTP not configured, printing instead]\nTo: ${to}\nSubject: ${subject}\n${text}\n`);
  }
}

/** Development/test helper: the most recent emails that were printed instead of sent. */
export const getDevOutbox = (): readonly SentMail[] => outbox;
