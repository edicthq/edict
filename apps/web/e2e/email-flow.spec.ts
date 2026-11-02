import type { Page } from "@playwright/test";
import { expect, linkIn, test, type MailInstance } from "./fixtures.js";

// Every test here runs on the instance that sends email (mailInstance), as
// Nadia, its first user and so its instance admin. A test that finds her
// missing, as on a retry's fresh instance, signs her up through the API.
const nadia = { name: "Nadia Karimi", email: "nadia@example.com", password: "correct-horse-battery" };

async function signInAsNadia(page: Page, mail: MailInstance) {
  const headers = { origin: mail.url };
  const signIn = await page.request.post(`${mail.url}/api/auth/sign-in/email`, {
    headers,
    data: { email: nadia.email, password: nadia.password },
  });
  if (!signIn.ok()) {
    const signUp = await page.request.post(`${mail.url}/api/auth/sign-up/email`, { headers, data: nadia });
    expect(signUp.ok(), await signUp.text()).toBe(true);
  }
  const orgs = (await (await page.request.get(`${mail.url}/api/v1/organizations`)).json()) as { slug: string }[];
  if (!orgs.some((org) => org.slug === "mail")) {
    await page.request.post(`${mail.url}/api/v1/organizations`, { headers, data: { name: "Mail", slug: "mail" } });
  }
}

test("Sign-up with email on says check your inbox, and the link says email verified", async ({ page, mailInstance: mail }) => {
  await page.clock.install();
  await page.goto(`${mail.url}/sign-up`);
  await page.getByLabel("Name").fill(nadia.name);
  await page.getByLabel("Email").fill(nadia.email);
  await page.getByLabel("Password", { exact: true }).fill(nadia.password);
  await page.getByRole("button", { name: "Sign up", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  await expect(page.getByText(`Edict sent a link to ${nadia.email}`)).toBeVisible();
  const resend = page.getByRole("button", { name: /^Send it again/ });
  await expect(resend).toBeDisabled();
  await expect(resend).toHaveText(/in \d+s$/);

  // The cooldown runs out after a minute; then the link goes out again.
  await page.clock.fastForward("01:01");
  await expect(page.getByRole("button", { name: "Send it again", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Send it again", exact: true }).click();
  await expect(page.getByText("Sent again. It can take a minute to arrive.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Send it again in/ })).toBeDisabled();
  await expect.poll(() => mail.emails.filter((e) => e.to === nadia.email && /Verify/.test(e.subject)).length).toBe(2);

  // Verifying never blocks: on into the app, with the banner up.
  await page.getByRole("button", { name: "Continue to Edict" }).click();
  await expect(page.getByRole("heading", { name: "Create an organization" })).toBeVisible();
  await page.getByLabel("Name").fill("Mail");
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Verify ${nadia.email}` })).toBeVisible();

  await page.goto(linkIn(await mail.waitForEmail(nadia.email, /Verify/)));
  await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
  await expect(page.getByText(`${nadia.email} is confirmed.`)).toBeVisible();
  await page.getByRole("link", { name: "Continue to Edict" }).click();
  await expect(page).toHaveURL(/\/mail/);
  await expect(page.getByText(`Verify ${nadia.email}`)).toHaveCount(0);
});

test("A spent or broken verification link says it doesn't work", async ({ page, mailInstance: mail }) => {
  await page.goto(`${mail.url}/api/auth/verify-email?token=not-a-token&callbackURL=${encodeURIComponent("/email-verified?next=/")}`);
  await expect(page.getByRole("heading", { name: "This verification link doesn't work" })).toBeVisible();
});

test("Forgot password says check your inbox, with a resend on a cooldown", async ({ page, mailInstance: mail }) => {
  await page.clock.install();
  await page.goto(`${mail.url}/forgot-password`);
  await page.getByLabel("Email").fill(nadia.email);
  // She may be missing on a retry's fresh instance; the screen reads the same.
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  await expect(page.getByText(nadia.email)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Send it again in \d+s$/ })).toBeDisabled();

  const before = mail.emails.filter((e) => e.to === nadia.email && /Reset/.test(e.subject)).length;
  await page.clock.fastForward("01:01");
  await page.getByRole("button", { name: "Send it again", exact: true }).click();
  await expect(page.getByText("Sent again. It can take a minute to arrive.")).toBeVisible();
  await expect.poll(() => mail.emails.filter((e) => e.to === nadia.email && /Reset/.test(e.subject)).length).toBe(before + 1);
});

test("The instance page names the transport and sends a test email, showing a refusal inline", async ({ page, mailInstance: mail }) => {
  await signInAsNadia(page, mail);
  await page.goto(`${mail.url}/mail/instance`);
  const setup = page.getByRole("region", { name: "Setup" });
  await expect(setup.getByText("Sends through Resend from Edict <edict@mail.example.com>")).toBeVisible();

  await setup.getByRole("button", { name: "Send test email" }).click();
  await expect(setup.getByText(`Sent to ${nadia.email}. Check that inbox.`)).toBeVisible();
  const email = await mail.waitForEmail(nadia.email, /Edict can send email/);
  expect(email.text).toMatch(/through Resend's API/);

  mail.refuse("The mail.example.com domain is not verified.");
  try {
    await setup.getByRole("button", { name: "Send test email" }).click();
    await expect(setup.getByRole("alert")).toHaveText(
      `The test email to ${nadia.email} didn't go out: Resend refused the email (403): The mail.example.com domain is not verified.`,
    );
  } finally {
    mail.refuse(null);
  }
});
