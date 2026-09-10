import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { type MailConfig, mailConfig } from "@/lib/mail/config";

// The transport keeps a connection (or a pool) open and is therefore reused
// instead of being rebuilt for every email. If the configuration changes —
// say, because a test rewrites it between two calls — a new transport is
// created instead of silently continuing to use the old one.
let cached: { config: MailConfig; transport: Transporter } | null = null;

export function getTransport(): Transporter | null {
  const config = mailConfig();
  if (!config) {
    cached = null;
    return null;
  }

  if (cached && sameConfig(cached.config, config)) return cached.transport;

  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
  });
  cached = { config, transport };
  return transport;
}

function sameConfig(a: MailConfig, b: MailConfig): boolean {
  return (
    a.host === b.host &&
    a.port === b.port &&
    a.secure === b.secure &&
    a.user === b.user &&
    a.pass === b.pass &&
    a.from === b.from
  );
}
