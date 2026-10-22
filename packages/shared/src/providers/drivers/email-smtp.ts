import nodemailer from "nodemailer";
import { z } from "zod";
import type { EmailDriver, ProviderDriverDefinition } from "../types.ts";

export const smtpEmailConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65_535).default(587),
  secure: z.boolean().default(false),
  username: z.string().min(1),
  password: z.string().min(1),
  fromAddress: z.string().email(),
  fromName: z.string().min(1),
});
export type SmtpEmailConfig = z.infer<typeof smtpEmailConfigSchema>;

function createTransport(config: SmtpEmailConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.username, pass: config.password },
  });
}

export function createSmtpEmailDriver(config: SmtpEmailConfig): EmailDriver {
  const transport = createTransport(config);
  return {
    async send(message) {
      await transport.sendMail({
        from: `"${config.fromName}" <${config.fromAddress}>`,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
    },
  };
}

export const smtpEmailDriverDefinition: ProviderDriverDefinition<SmtpEmailConfig> = {
  capability: "email",
  driver: "smtp",
  label: { bn: "SMTP", en: "SMTP" },
  configSchema: smtpEmailConfigSchema,
  secretFields: ["password"],
  async testConnection(config) {
    try {
      const transport = createTransport(config);
      await transport.verify();
      return { ok: true, message: "SMTP server accepted the connection." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
    }
  },
};
