import { afterAll, describe, expect, it } from "vitest";
import { cookieHeader, startTestServer } from "./server.js";

afterAll(async () => {
  for (const close of pending) {
    await close();
  }
});

type Session = { user?: { email?: string; role?: string } } | null;

async function getSession(baseUrl: string, cookie: string): Promise<Session> {
  const res = await fetch(`${baseUrl}/api/auth/get-session`, {
    headers: { cookie },
  });
  return (await res.json()) as Session;
}

const pending: Array<() => Promise<void>> = [];

function signUp(baseUrl: string, body: Record<string, unknown>) {
  return fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function signIn(baseUrl: string, body: Record<string, unknown>) {
  return fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("auth over HTTP", () => {
  it("the first sign-up becomes the instance admin", async () => {
    const t = await startTestServer();
    try {
      const res = await signUp(t.baseUrl, {
        email: "amirali@example.com",
        name: "Amirali",
        password: "correct-horse-battery",
      });
      expect(res.status).toBe(200);

      const cookie = cookieHeader(res);
      const session = await getSession(t.baseUrl, cookie);

      expect(session?.user?.email).toBe("amirali@example.com");
      expect(session?.user?.role).toBe("admin");
    } finally {
      pending.push(t.close);
    }
  });

  it("a later sign-up is not an admin", async () => {
    const t = await startTestServer();
    try {
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

      const cookie = cookieHeader(second);
      const session = await getSession(t.baseUrl, cookie);
      expect(session?.user?.role).toBe("user");
    } finally {
      pending.push(t.close);
    }
  });

  it("rejects a wrong password", async () => {
    const t = await startTestServer();
    try {
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
    } finally {
      pending.push(t.close);
    }
  });
});
