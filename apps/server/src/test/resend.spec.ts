import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, onTestFinished } from "vitest";
import { createResendMailer } from "../email.js";
import { ConfigError, readConfig } from "../env.js";
import { apiClient, signUpAs, startTestServer } from "./server.js";

const API_KEY = "re_test_key";
const FROM = "Edict <edict@mail.example.com>";

interface ResendRequest {
  method: string;
  path: string;
  authorization: string | undefined;
  contentType: string | undefined;
  body: { from: string; to: string[]; subject: string; text: string; html: string };
}

// A stand-in for Resend's API: records each request and answers as told.
async function fakeResend(answer: { status: number; body: unknown } = { status: 200, body: { id: "email-id" } }) {
  const received: ResendRequest[] = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      received.push({
        method: req.method ?? "",
        path: req.url ?? "",
        authorization: req.headers.authorization,
        contentType: req.headers["content-type"],
        body: JSON.parse(raw || "{}"),
      });
      res.writeHead(answer.status, { "content-type": "application/json" });
      res.end(JSON.stringify(answer.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  onTestFinished(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // Better Auth may send in the background, after the response.
  const waitFor = async (to: string, subject: RegExp): Promise<ResendRequest> => {
    for (let i = 0; i < 100; i++) {
      const found = received.find((r) => r.body.to?.includes(to) && subject.test(r.body.subject));
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`No email to ${to} matching ${subject}; sent: ${received.map((r) => r.body.subject).join(", ")}`);
  };
  return { url, received, waitFor };
}

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("email through Resend's API", () => {
  it("sends the sign-up verification as a POST to /emails with the API key", async () => {
    const resend = await fakeResend();
    const t = await startTestServer({ resend: { apiKey: API_KEY, url: resend.url, from: FROM } });

    const res = await post(`${t.baseUrl}/api/auth/sign-up/email`, {
      name: "Mia",
      email: "mia@example.com",
      password: "correct-horse-battery",
    });
    expect(res.status).toBe(200);

    const request = await resend.waitFor("mia@example.com", /verify/i);
    expect(request.method).toBe("POST");
    expect(request.path).toBe("/emails");
    expect(request.authorization).toBe(`Bearer ${API_KEY}`);
    expect(request.contentType).toMatch(/^application\/json/);
    expect(request.body).toMatchObject({ from: FROM, to: ["mia@example.com"], subject: "Verify your email for Edict" });
    expect(request.body.text).toMatch(/https?:\/\//);
    expect(request.body.html).toContain("Verify email");
  });

  it("sends password reset, magic link and invite emails through it", async () => {
    const resend = await fakeResend();
    const t = await startTestServer({ resend: { apiKey: API_KEY, url: resend.url, from: FROM } });
    const owner = await signUpAs(t.baseUrl, "Owner");

    expect(
      (await post(`${t.baseUrl}/api/auth/request-password-reset`, { email: "owner@example.com", redirectTo: "/reset-password" })).status,
    ).toBe(200);
    expect((await resend.waitFor("owner@example.com", /reset/i)).body.subject).toBe("Reset your Edict password");

    expect((await post(`${t.baseUrl}/api/auth/sign-in/magic-link`, { email: "mia@example.com", callbackURL: "/" })).status).toBe(200);
    expect((await resend.waitFor("mia@example.com", /sign in/i)).body.subject).toBe("Sign in to Edict");

    const org = (await owner.post("/organizations", { name: "Acme", slug: "acme" })).body.organization;
    const invite = await owner.post(`/organizations/${org.id}/invites`, { email: "bob@example.com" });
    expect(invite.status).toBe(201);
    expect(invite.body.emailSent).toBe(true);
    const sent = await resend.waitFor("bob@example.com", /invited you/);
    expect(sent.body.text).toContain(invite.body.url);
    expect(resend.received.every((r) => r.authorization === `Bearer ${API_KEY}` && r.body.from === FROM)).toBe(true);
  });

  it("throws Resend's own message when it refuses an email", async () => {
    const resend = await fakeResend({
      status: 403,
      body: { statusCode: 403, name: "validation_error", message: "The mail.example.com domain is not verified." },
    });
    const mailer = createResendMailer(API_KEY, FROM, resend.url);
    await expect(mailer.send({ to: "mia@example.com", subject: "Hi", text: "Hi", html: "<p>Hi</p>" })).rejects.toThrow(
      "The mail.example.com domain is not verified.",
    );
  });

  it("throws with the status when the refusal has no message", async () => {
    const resend = await fakeResend({ status: 502, body: "" });
    const mailer = createResendMailer(API_KEY, FROM, resend.url);
    await expect(mailer.send({ to: "mia@example.com", subject: "Hi", text: "Hi", html: "<p>Hi</p>" })).rejects.toThrow(/502/);
  });

  it("a refused invite email keeps the invite as a link to share by hand", async () => {
    const resend = await fakeResend({
      status: 422,
      body: { statusCode: 422, name: "validation_error", message: "Invalid `to` field." },
    });
    const t = await startTestServer({ resend: { apiKey: API_KEY, url: resend.url, from: FROM } });
    const owner = await signUpAs(t.baseUrl, "Owner");
    const org = (await owner.post("/organizations", { name: "Acme", slug: "acme" })).body.organization;

    const invite = await owner.post(`/organizations/${org.id}/invites`, { email: "bob@example.com" });
    expect(invite.status).toBe(201);
    expect(invite.body.emailSent).toBe(false);
    expect(invite.body.url).toMatch(/\/invite\//);
  });
});

describe("the email transport in the instance status", () => {
  async function transportOf(t: { baseUrl: string }) {
    const admin = await signUpAs(t.baseUrl, "Admin");
    const status = await admin.get("/instance/status");
    expect(status.status).toBe(200);
    return status.body.email;
  }

  it("says resend when email goes through Resend's API", async () => {
    const resend = await fakeResend();
    const t = await startTestServer({ resend: { apiKey: API_KEY, url: resend.url, from: FROM } });
    expect(await transportOf(t)).toEqual({ configured: true, transport: "resend", from: FROM });
    expect((await apiClient(t.baseUrl).get("/instance")).body.sendsEmail).toBe(true);
  });

  it("says smtp when email goes over SMTP", async () => {
    const t = await startTestServer({ smtp: { url: "smtp://127.0.0.1:9", from: FROM } });
    expect(await transportOf(t)).toEqual({ configured: true, transport: "smtp", from: FROM });
  });

  it("says none without email", async () => {
    const t = await startTestServer();
    expect(await transportOf(t)).toEqual({ configured: false, transport: null, from: null });
  });
});

describe("email settings", () => {
  const base = { DATABASE_URL: "postgres://edict@localhost/edict" };

  it("reads RESEND_API_KEY with EMAIL_FROM", () => {
    const config = readConfig({ ...base, RESEND_API_KEY: API_KEY, EMAIL_FROM: FROM });
    expect(config).toMatchObject({ resendApiKey: API_KEY, emailFrom: FROM });
    expect(config.smtpUrl).toBeUndefined();
  });

  it("refuses RESEND_API_KEY and SMTP_URL together", () => {
    const both = () => readConfig({ ...base, RESEND_API_KEY: API_KEY, SMTP_URL: "smtp://localhost:2525", EMAIL_FROM: FROM });
    expect(both).toThrow(ConfigError);
    expect(both).toThrow(/RESEND_API_KEY and SMTP_URL are both set/);
  });

  it("refuses RESEND_API_KEY without EMAIL_FROM", () => {
    const alone = () => readConfig({ ...base, RESEND_API_KEY: API_KEY });
    expect(alone).toThrow(ConfigError);
    expect(alone).toThrow(/RESEND_API_KEY is set but EMAIL_FROM is not/);
  });

  it("still refuses SMTP_URL without EMAIL_FROM", () => {
    expect(() => readConfig({ ...base, SMTP_URL: "smtp://localhost:2525" })).toThrow(/SMTP_URL is set but EMAIL_FROM is not/);
  });
});
