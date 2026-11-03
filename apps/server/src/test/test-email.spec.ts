import { describe, expect, it } from "vitest";
import type { Mailer } from "../email.js";
import { recordingMailer } from "./mail.js";
import { apiClient, signUpAs, startTestServer } from "./server.js";

describe("the instance admin's test email", () => {
  it("goes to the signed-in instance admin's own address", async () => {
    const { mailer, sent } = recordingMailer();
    const t = await startTestServer({ mailer });
    const admin = await signUpAs(t.baseUrl, "Admin");
    sent.length = 0; // the sign-up's verification email

    const res = await admin.post("/instance/test-email");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ to: "admin@example.com", transport: "smtp", sent: true, error: null });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "admin@example.com", subject: "Edict can send email" });
    expect(sent[0]?.text).toMatch(/sent over SMTP/);
    expect(sent[0]?.html).not.toMatch(/<a /);
  });

  it("is for instance admins only", async () => {
    const { mailer, sent } = recordingMailer();
    const t = await startTestServer({ mailer });
    await signUpAs(t.baseUrl, "Admin");
    const mia = await signUpAs(t.baseUrl, "Mia");
    sent.length = 0;

    expect((await apiClient(t.baseUrl).post("/instance/test-email")).status).toBe(401);
    const refused = await mia.post("/instance/test-email");
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe("forbidden");
    expect(sent).toEqual([]);
  });

  it("says email is not set up when the instance has no mailer", async () => {
    const t = await startTestServer();
    const admin = await signUpAs(t.baseUrl, "Admin");

    const res = await admin.post("/instance/test-email");
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: "invalid_request",
      message: "This instance has no email set up. Set SMTP_URL or RESEND_API_KEY, and EMAIL_FROM, then restart Edict.",
    });
  });

  it("answers with the provider's error when the email is refused", async () => {
    const failing: Mailer = {
      transport: "smtp",
      send: async () => {
        throw new Error("Invalid login: 535 Authentication failed");
      },
    };
    const t = await startTestServer({ mailer: failing });
    const admin = await signUpAs(t.baseUrl, "Admin");

    const res = await admin.post("/instance/test-email");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      to: "admin@example.com",
      transport: "smtp",
      sent: false,
      error: "Invalid login: 535 Authentication failed",
    });
  });
});
