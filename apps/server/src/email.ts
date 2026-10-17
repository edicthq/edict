import { createTransport } from "nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// Sends one email or throws. Email is optional (Postgres is the only required
// service), so callers treat a missing mailer and a failed send alike: the
// person gets a link to share by hand.
export interface Mailer {
  send: (message: EmailMessage) => Promise<void>;
}

// Any provider that speaks SMTP: Resend, Postmark, SES, Mailgun or a local
// relay. url is like smtps://user:password@smtp.example.com:465.
export function createSmtpMailer(url: string, from: string): Mailer {
  const transport = createTransport(url);
  return {
    send: async (message) => {
      await transport.sendMail({ from, ...message });
    },
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const roleNames = { owner: "an Owner", admin: "an Admin", member: "a Member", guest: "a Guest" } as const;

export function inviteEmail(invite: {
  to: string;
  inviterName: string;
  organizationName: string;
  role: keyof typeof roleNames;
  url: string;
}): EmailMessage {
  const { inviterName, organizationName, url } = invite;
  const role = roleNames[invite.role];
  const subject = `${inviterName} invited you to ${organizationName} on Edict`;
  const text = [
    `${inviterName} invited you to join ${organizationName} on Edict as ${role}.`,
    "",
    `Accept the invite: ${url}`,
    "",
    `The link works once, for ${invite.to}, for seven days. If you weren't expecting it, ignore this email.`,
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:32px 16px;background:#f8f9fb;color:#161b22;font:14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
    <div style="max-width:480px;margin:0 auto">
      <p style="margin:0 0 24px;font-weight:600">Edict</p>
      <p style="margin:0 0 24px">${escapeHtml(inviterName)} invited you to join <strong>${escapeHtml(organizationName)}</strong> as ${role}.</p>
      <p style="margin:0 0 24px"><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 16px;border-radius:6px;background:#161b22;color:#fefeff;text-decoration:none;font-weight:600">Accept the invite</a></p>
      <p style="margin:0;color:#565b63;font-size:13px">The link works once, for ${escapeHtml(invite.to)}, for seven days. If you weren't expecting it, ignore this email.</p>
    </div>
  </body>
</html>`;
  return { to: invite.to, subject, text, html };
}
