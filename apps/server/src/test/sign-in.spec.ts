import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, onTestFinished } from "vitest";
import { linkIn, recordingMailer } from "./mail.js";
import { createTeam, orgWithOwner } from "./org.js";
import { apiClient, cookieHeader, signUpAs, startTestServer } from "./server.js";

// An OpenID provider's discovery document, which is all Edict reads before
// sending someone there.
async function oidcProvider() {
  const server = createServer((req, res) => {
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        issuer: origin,
        authorization_endpoint: `${origin}/authorize`,
        token_endpoint: `${origin}/token`,
        userinfo_endpoint: `${origin}/userinfo`,
        jwks_uri: `${origin}/jwks`,
        id_token_signing_alg_values_supported: ["RS256"],
      }),
    );
    void req;
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  onTestFinished(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const socialSignIn = (baseUrl: string, provider: string) =>
  fetch(`${baseUrl}/api/auth/sign-in/social`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({ provider, callbackURL: "/" }),
  }).then(async (res) => ({ status: res.status, body: (await res.json()) as { url?: string } }));

const signUp = (baseUrl: string, email: string) =>
  fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: email.split("@")[0], email, password: "correct-horse-battery" }),
  });

describe("sign-in methods", () => {
  it("says which methods the instance offers", async () => {
    const plain = await startTestServer();
    expect((await apiClient(plain.baseUrl).get("/instance")).body.signInMethods).toEqual({
      magicLink: false,
      google: false,
      github: false,
      oidc: null,
    });

    const issuer = await oidcProvider();
    const { mailer } = recordingMailer();
    const full = await startTestServer({
      mailer,
      signIn: {
        google: { clientId: "g-id", clientSecret: "g-secret" },
        github: { clientId: "gh-id", clientSecret: "gh-secret" },
        oidc: { issuer, clientId: "o-id", clientSecret: "o-secret", name: "Authentik" },
      },
    });
    expect((await apiClient(full.baseUrl).get("/instance")).body.signInMethods).toEqual({
      magicLink: true,
      google: true,
      github: true,
      oidc: { name: "Authentik" },
    });

    const google = await socialSignIn(full.baseUrl, "google");
    expect(google.body.url).toMatch(/^https:\/\/accounts\.google\.com\//);
    const github = await socialSignIn(full.baseUrl, "github");
    expect(github.body.url).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize/);
    const oidc = await socialSignIn(full.baseUrl, "oidc");
    expect(oidc.body.url).toMatch(new RegExp(`^${issuer}/authorize\\?`));
    expect(new URL(oidc.body.url!).searchParams.get("client_id")).toBe("o-id");
  });

  it("signs in by a link in an email, and creates the user under the sign-up mode", async () => {
    const { mailer, waitFor } = recordingMailer();
    const t = await startTestServer({ mailer });
    await signUpAs(t.baseUrl, "Admin");

    const sent = await fetch(`${t.baseUrl}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "mia@example.com", callbackURL: "/" }),
    });
    expect(sent.status).toBe(200);
    const message = await waitFor("mia@example.com", /sign in/i);
    const opened = await fetch(linkIn(message), { redirect: "manual" });
    expect(opened.status).toBe(302);
    const me = await fetch(`${t.baseUrl}/api/auth/get-session`, { headers: { cookie: cookieHeader(opened) } });
    expect(((await me.json()) as { user: { email: string; emailVerified: boolean } }).user).toMatchObject({
      email: "mia@example.com",
      emailVerified: true,
    });
  });
});

describe("the domain sign-up mode", () => {
  it("lets in addresses at the instance's domains, once they are verified", async () => {
    const { mailer, waitFor } = recordingMailer();
    const t = await startTestServer({ mailer });
    const admin = await signUpAs(t.baseUrl, "Admin");
    const set = await admin.patch("/instance", { signUpMode: "domain", signUpDomains: ["Acme.test"] });
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({ signUpMode: "domain", signUpDomains: ["acme.test"] });

    expect((await signUp(t.baseUrl, "eve@elsewhere.test")).status).toBe(403);
    const bob = await signUp(t.baseUrl, "bob@acme.test");
    expect(bob.status).toBe(200);
    // Signed in, but nothing works until the address is proven.
    const unproven = apiClient(t.baseUrl, cookieHeader(bob));
    const refused = await unproven.get("/organizations");
    expect(refused.status).toBe(403);
    expect(refused.body.error.message).toMatch(/[Vv]erify/);
    expect((await unproven.get("/instance")).status).toBe(200);
    await fetch(linkIn(await waitFor("bob@acme.test", /verify/i)), { redirect: "manual" });
    expect((await unproven.get("/organizations")).status).toBe(200);
  });

  it("needs email, since only a verified address proves its domain", async () => {
    const t = await startTestServer();
    const admin = await signUpAs(t.baseUrl, "Admin");
    expect((await admin.patch("/instance", { signUpMode: "domain", signUpDomains: ["acme.test"] })).status).toBe(400);
  });
});

describe("an organization's domain rule", () => {
  it("lets anyone with a verified address at its domain join as a Member", async () => {
    const { mailer, waitFor } = recordingMailer();
    const t = await startTestServer({ mailer });
    const { owner, org, orgId } = await orgWithOwner(t.baseUrl);
    await createTeam(owner, org, "ENG");
    const rule = await owner.patch(org, { joinDomain: "Acme.test" });
    expect(rule.status).toBe(200);
    expect(rule.body.joinDomain).toBe("acme.test");

    const res = await signUp(t.baseUrl, "zoe@acme.test");
    const unverified = apiClient(t.baseUrl, cookieHeader(res));
    expect((await unverified.get("/organizations/joinable")).body).toEqual([]);
    expect((await unverified.post(`${org}/join`)).status).toBe(403);

    const verified = await fetch(linkIn(await waitFor("zoe@acme.test", /verify/i)), { redirect: "manual" });
    const zoe = apiClient(t.baseUrl, cookieHeader(verified) || cookieHeader(res));
    expect((await zoe.get("/organizations/joinable")).body).toEqual([expect.objectContaining({ id: orgId, name: "Acme" })]);
    const joined = await zoe.post(`${org}/join`);
    expect(joined.status).toBe(200);
    expect(joined.body.member).toMatchObject({ role: "member" });
    expect((await zoe.get("/organizations/joinable")).body).toEqual([]);

    // Removed, they need an invite to come back.
    await owner.delete(`${org}/members/${joined.body.member.id}`);
    expect((await zoe.post(`${org}/join`)).status).toBe(403);

    const other = await signUpAs(t.baseUrl, "Other", "other@elsewhere.test");
    await fetch(linkIn(await waitFor("other@elsewhere.test", /verify/i)), { redirect: "manual" });
    expect((await other.post(`${org}/join`)).status).toBe(404);
  });
});
