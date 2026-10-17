import type { EmailMessage, Mailer } from "../email.js";

// A mailer that keeps what it sends, for tests.
export function recordingMailer() {
  const sent: EmailMessage[] = [];
  const mailer: Mailer = {
    send: async (message) => {
      sent.push(message);
    },
  };
  // Better Auth may send in the background, after the response.
  const waitFor = async (to: string, subject: RegExp): Promise<EmailMessage> => {
    for (let i = 0; i < 100; i++) {
      const found = sent.find((m) => m.to === to && subject.test(m.subject));
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`No email to ${to} matching ${subject}; sent: ${sent.map((m) => m.subject).join(", ")}`);
  };
  return { mailer, sent, waitFor };
}

// The first link in a plain-text email.
export function linkIn(message: EmailMessage): string {
  const match = message.text.match(/https?:\/\/\S+/);
  if (!match) throw new Error(`No link in: ${message.text}`);
  return match[0];
}
