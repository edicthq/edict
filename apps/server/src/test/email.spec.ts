import { describe, expect, it } from "vitest";
import type { EmailMessage, Mailer } from "../email.js";
import { signUpAs, startTestServer } from "./server.js";

function recordingMailer() {
  const sent: EmailMessage[] = [];
  const mailer: Mailer = {
    send: async (message) => {
      sent.push(message);
    },
  };
  return { mailer, sent };
}

async function orgWithOwner(baseUrl: string) {
  const owner = await signUpAs(baseUrl, "Owner");
  const org = (await owner.post("/organizations", { name: "Acme", slug: "acme" })).body.organization;
  return { owner, org: `/organizations/${org.id}` };
}

describe("invite emails", () => {
  it("emails the invite link to the invitee when email is set up", async () => {
    const { mailer, sent } = recordingMailer();
    const t = await startTestServer({ mailer });
    const { owner, org } = await orgWithOwner(t.baseUrl);

    const res = await owner.post(`${org}/invites`, { email: "Mia@Example.com", role: "member" });
    expect(res.status).toBe(201);
    expect(res.body.emailSent).toBe(true);

    expect(sent).toHaveLength(1);
    const [message] = sent;
    expect(message!.to).toBe("mia@example.com");
    expect(message!.subject).toBe("Owner invited you to Acme on Edict");
    expect(message!.text).toContain(res.body.url);
    expect(message!.html).toContain(res.body.url);
  });

  it("without email, the invite still works and says it was not sent", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);

    const res = await owner.post(`${org}/invites`, { email: "mia@example.com" });
    expect(res.status).toBe(201);
    expect(res.body.emailSent).toBe(false);
  });

  it("a failed send keeps the invite and says it was not sent", async () => {
    const mailer: Mailer = {
      send: async () => {
        throw new Error("SMTP said no");
      },
    };
    const t = await startTestServer({ mailer });
    const { owner, org } = await orgWithOwner(t.baseUrl);

    const res = await owner.post(`${org}/invites`, { email: "mia@example.com" });
    expect(res.status).toBe(201);
    expect(res.body.emailSent).toBe(false);
    expect((await owner.get(`${org}/invites`)).body).toHaveLength(1);
  });

  it("escapes names in the email's HTML", async () => {
    const { mailer, sent } = recordingMailer();
    const t = await startTestServer({ mailer });
    const owner = await signUpAs(t.baseUrl, "<b>Eve</b>", "eve@example.com");
    const org = (await owner.post("/organizations", { name: "A & <B>", slug: "ab" })).body.organization;
    await owner.post(`/organizations/${org.id}/invites`, { email: "mia@example.com" });

    expect(sent[0]!.html).toContain("&lt;b&gt;Eve&lt;/b&gt;");
    expect(sent[0]!.html).toContain("A &amp; &lt;B&gt;");
    expect(sent[0]!.html).not.toContain("<b>Eve</b>");
  });
});
