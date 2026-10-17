import { describe, expect, it } from "vitest";
import { linkIn, recordingMailer } from "./mail.js";
import { apiClient, cookieHeader, signUpAs, startTestServer } from "./server.js";

type Session = { user?: { email?: string; emailVerified?: boolean } } | null;

async function session(baseUrl: string, cookie: string): Promise<Session> {
  const res = await fetch(`${baseUrl}/api/auth/get-session`, { headers: { cookie } });
  return (await res.json()) as Session;
}

function signUp(baseUrl: string, email: string, callbackURL?: string) {
  return fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Mia", email, password: "correct-horse-battery", callbackURL }),
  });
}

describe("instance email capability", () => {
  it("reports whether the instance sends email", async () => {
    const without = await startTestServer();
    expect((await apiClient(without.baseUrl).get("/instance")).body.sendsEmail).toBe(false);

    const { mailer } = recordingMailer();
    const withMail = await startTestServer({ mailer });
    expect((await apiClient(withMail.baseUrl).get("/instance")).body.sendsEmail).toBe(true);
  });
});

describe("email verification", () => {
  it("sign-up sends a link that verifies the address", async () => {
    const { mailer, waitFor } = recordingMailer();
    const t = await startTestServer({ mailer });

    const res = await signUp(t.baseUrl, "mia@example.com", "/welcome");
    expect(res.status).toBe(200);
    const cookie = cookieHeader(res);
    expect((await session(t.baseUrl, cookie))?.user?.emailVerified).toBe(false);

    const message = await waitFor("mia@example.com", /verify/i);
    expect(message.subject).toBe("Verify your email for Edict");
    const verified = await fetch(linkIn(message), { redirect: "manual" });
    expect(verified.status).toBe(302);
    expect(new URL(verified.headers.get("location")!, t.baseUrl).pathname).toBe("/welcome");

    expect((await session(t.baseUrl, cookie))?.user?.emailVerified).toBe(true);
  });

  it("sends nothing when the instance has no email", async () => {
    const t = await startTestServer();
    const res = await signUp(t.baseUrl, "mia@example.com");
    expect(res.status).toBe(200);
  });
});

describe("accepting an invite with email set up", () => {
  async function invited(baseUrl: string) {
    const owner = await signUpAs(baseUrl, "Owner");
    const org = (await owner.post("/organizations", { name: "Acme", slug: "acme" })).body.organization;
    const invite = await owner.post(`/organizations/${org.id}/invites`, { email: "mia@example.com" });
    return new URL(invite.body.url).pathname.split("/").pop()!;
  }

  it("needs the invitee's email verified first", async () => {
    const { mailer, waitFor } = recordingMailer();
    const t = await startTestServer({ mailer });
    const token = await invited(t.baseUrl);

    const res = await signUp(t.baseUrl, "mia@example.com");
    const mia = apiClient(t.baseUrl, cookieHeader(res));
    const early = await mia.post(`/invites/${token}/accept`);
    expect(early.status).toBe(403);
    expect(early.body.error.message).toMatch(/verify/i);

    await fetch(linkIn(await waitFor("mia@example.com", /verify/i)), { redirect: "manual" });
    expect((await mia.post(`/invites/${token}/accept`)).status).toBe(200);
  });
});

describe("password reset", () => {
  it("emails a link that leads to setting a new password", async () => {
    const { mailer, waitFor } = recordingMailer();
    const t = await startTestServer({ mailer });
    await signUpAs(t.baseUrl, "Mia");

    const requested = await fetch(`${t.baseUrl}/api/auth/request-password-reset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "mia@example.com", redirectTo: "/reset-password" }),
    });
    expect(requested.status).toBe(200);

    const message = await waitFor("mia@example.com", /password/i);
    expect(message.subject).toBe("Reset your Edict password");
    const opened = await fetch(linkIn(message), { redirect: "manual" });
    const landing = new URL(opened.headers.get("location")!, t.baseUrl);
    expect(landing.pathname).toBe("/reset-password");
    const token = landing.searchParams.get("token");
    expect(token).toBeTruthy();

    const reset = await fetch(`${t.baseUrl}/api/auth/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, newPassword: "a-brand-new-password" }),
    });
    expect(reset.status).toBe(200);

    const signIn = await fetch(`${t.baseUrl}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "mia@example.com", password: "a-brand-new-password" }),
    });
    expect(signIn.status).toBe(200);
  });

  it("does not reveal whether an address has an account", async () => {
    const { mailer, sent } = recordingMailer();
    const t = await startTestServer({ mailer });
    const res = await fetch(`${t.baseUrl}/api/auth/request-password-reset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.com", redirectTo: "/reset-password" }),
    });
    expect(res.status).toBe(200);
    expect(sent.filter((m) => m.to === "nobody@example.com")).toEqual([]);
  });
});
