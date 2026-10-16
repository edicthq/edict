import { describe, expect, it } from "vitest";
import { cookieHeader, createTestDatabase, startTestServer } from "./server.js";

type Session = { user?: { email?: string; role?: string } } | null;

async function getSession(baseUrl: string, cookie: string): Promise<Session> {
  const res = await fetch(`${baseUrl}/api/auth/get-session`, {
    headers: { cookie },
  });
  return (await res.json()) as Session;
}

function signUp(baseUrl: string, body: Record<string, unknown>) {
  return fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function signIn(baseUrl: string, body: Record<string, unknown>) {
  return fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("auth over HTTP", () => {
  it("the first sign-up becomes the instance admin", async () => {
    const t = await startTestServer();
    const res = await signUp(t.baseUrl, {
      email: "amirali@example.com",
      name: "Amirali",
      password: "correct-horse-battery",
    });
    expect(res.status).toBe(200);

    const session = await getSession(t.baseUrl, cookieHeader(res));
    expect(session?.user?.email).toBe("amirali@example.com");
    expect(session?.user?.role).toBe("admin");
  });

  it("a later sign-up is not an admin", async () => {
    const t = await startTestServer();
    await signUp(t.baseUrl, {
      email: "first@example.com",
      name: "First",
      password: "correct-horse-battery",
    });
    const second = await signUp(t.baseUrl, {
      email: "second@example.com",
      name: "Second",
      password: "correct-horse-battery",
    });
    expect(second.status).toBe(200);

    const session = await getSession(t.baseUrl, cookieHeader(second));
    expect(session?.user?.role).toBe("user");
  });

  it("rejects a wrong password", async () => {
    const t = await startTestServer();
    await signUp(t.baseUrl, {
      email: "one@example.com",
      name: "One",
      password: "correct-horse-battery",
    });

    const res = await signIn(t.baseUrl, {
      email: "one@example.com",
      password: "wrong-password-entirely",
    });
    expect(res.status).toBe(401);
  });

  it("without a configured secret, sessions survive a restart", async () => {
    const database = await createTestDatabase();
    const first = await startTestServer({ database });
    const res = await signUp(first.baseUrl, {
      email: "amirali@example.com",
      name: "Amirali",
      password: "correct-horse-battery",
    });
    const cookie = cookieHeader(res);
    await first.close();

    const second = await startTestServer({ database });
    const session = await getSession(second.baseUrl, cookie);
    expect(session?.user?.email).toBe("amirali@example.com");
  });

  it("two servers on one database accept each other's sessions", async () => {
    const database = await createTestDatabase();
    const a = await startTestServer({ database });
    const b = await startTestServer({ database });

    const res = await signUp(a.baseUrl, {
      email: "amirali@example.com",
      name: "Amirali",
      password: "correct-horse-battery",
    });
    const session = await getSession(b.baseUrl, cookieHeader(res));
    expect(session?.user?.email).toBe("amirali@example.com");
  });
});
