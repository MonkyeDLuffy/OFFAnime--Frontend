#!/usr/bin/env node
/**
 * OFFANIME auth lifecycle check.
 *
 * Verifies the deployed auth system end-to-end against a running frontend
 * (whose same-origin /api/auth/* proxy fronts the real backend):
 *
 *   A. SOURCE ASSERTIONS (always run, no network):
 *      - nothing under src/ ever CALLS /api/auth/resend (deliberately unwired
 *        endpoint — the only allowed reference is the offline seam module
 *        src/lib/auth/resend-future.ts, and nothing may import it);
 *      - no auth code touches localStorage/sessionStorage (tokens live only
 *        in HttpOnly cookies upstream).
 *
 *   B. BEHAVIOR (network; pass --no-email to skip email-consuming steps):
 *      - signup issues a session IMMEDIATELY (no email-verification step);
 *        fresh disposable mail.tm mailbox unless AUTH_TEST_EMAIL is given;
 *      - login works; logout works;
 *      - anti-enumeration: password-reset answers a uniform {ok:true} for an
 *        address that cannot exist (no real email is ever sent for it);
 *      - [email mode] password-reset -> recovery mail (mail.tm) ->
 *        token_hash -> /verify -> password-update -> old password rejected,
 *        new password logs in, logout clean.
 *
 * Politeness/policy built in:
 *   - exactly ONE password-reset request per run, no retries, no resend
 *     calls, abort immediately on 429 (built-in Supabase SMTP ≈ 2 emails/hour);
 *   - session tokens / cookies / passwords are NEVER printed — every log
 *     line is safe to paste.
 *
 * Usage:
 *   node scripts/auth-lifecycle-check.mjs [--base-url http://localhost:3055]
 *                                         [--no-email] [--keep-mailbox]
 *   AUTH_TEST_EMAIL=... AUTH_TEST_PASSWORD=... node scripts/... --no-email
 *
 * Exit code 0 = everything asserted; 1 = at least one failure.
 */

import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomInt } from "node:crypto";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

// --- args -------------------------------------------------------------------

const argv = process.argv.slice(2);
function takeFlag(flagName) {
  const i = argv.indexOf(flagName);
  if (i === -1) return false;
  argv.splice(i, 1);
  return true;
}

const NO_EMAIL = takeFlag("--no-email");
const KEEP_MAILBOX = takeFlag("--keep-mailbox");
const baseIndex = argv.indexOf("--base-url");
const BASE_URL = (baseIndex !== -1 ? argv[baseIndex + 1] : "http://localhost:3000").replace(/\/+$/, "");
if (baseIndex !== -1) argv.splice(baseIndex, 2);
if (argv.length > 0) {
  console.error(`unknown argument(s): ${argv.join(" ")}`);
  process.exit(2);
}

// Passwords are random per run and NEVER printed — the report stays pasteable.
const PASSWORD = `OffCheck!${randomInt(100_000, 999_999)}a`;
const NEW_PASSWORD = `OffCheck!${randomInt(100_000, 999_999)}b`;

// --- tiny report ------------------------------------------------------------

const results = [];
function record(status, label, detail = "") {
  results.push(status);
  const mark = { PASS: "PASS", FAIL: "FAIL", SKIP: "SKIP", INFO: "    " }[status];
  console.error(`${mark}  ${label}${detail ? ` — ${detail}` : ""}`);
}
const pass = (l, d) => record("PASS", l, d);
const fail = (l, d) => record("FAIL", l, d);
const skip = (l, d) => record("SKIP", l, d);
const info = (l, d) => record("INFO", l, d);
const failCount = () => results.filter((status) => status === "FAIL").length;

// --- A. source assertions ----------------------------------------------------

async function assertSource() {
  const srcDir = path.join(repoRoot, "src");
  if (!existsSync(srcDir)) {
    fail("source tree present", "src/ not found");
    return;
  }

  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(p);
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(p);
    }
  }
  await walk(srcDir);

  const seamRel = path.join("src", "lib", "auth", "resend-future.ts");
  let resendCallers = 0;
  let seamImporters = 0;
  let storageTouchers = 0;
  for (const file of files) {
    const rel = path.relative(repoRoot, file);
    const code = await readFile(file, "utf8");
    // A1 — flag only ACTIONABLE call sites, never prose comments.
    if (
      rel !== seamRel &&
      /(`|\"|')\/api\/auth\/resend\1|\bfetch\b.*`\/api\/auth\/resend|\/\*|\/\/|fetch\(/.test(code) &&
      /api\/auth\/resend/.test(code.replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g, ""))
    ) {
      resendCallers++;
    }
    // A2 — seam module must exist as the one documented offline placeholder;
    // nothing else imports it (comments referencing the filename are fine).
    if (/resend-future/.test(code.replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g, "")) && rel !== seamRel) seamImporters++;
    // A3 — flag only real identifier usage of browser storage, never prose.
    if (
      rel.startsWith(path.join("src", "lib", "auth")) ||
      rel.startsWith(path.join("src", "components", "auth"))
    ) {
      if (/\blocalStorage\b|\bsessionStorage\b/.test(code.replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g, "")))
        storageTouchers++;
    }
  }

  if (resendCallers === 0) pass("A1 /api/auth/resend is never called", `${files.length} source files scanned`);
  else fail("A1 /api/auth/resend is never called", `referenced in ${resendCallers} file(s) outside the seam`);

  if (seamImporters === 0) pass("A2 resend-future.ts seam stays unimported (offline placeholder)");
  else fail("A2 resend-future.ts seam stays unimported", `${seamImporters} importer(s)`);

  if (storageTouchers === 0) pass("A3 auth code never touches localStorage/sessionStorage");
  else fail("A3 auth code never touches browser storage", `${storageTouchers} file(s)`);
}

// --- HTTP helpers (cookie jar; tokens/pw never logged) ------------------------

/** Minimal cookie jar: name -> value. Cookies are HttpOnly upstream and the
 *  script replays them without ever printing them. */
function makeJar() {
  const jar = new Map();
  return {
    absorb(res) {
      const set =
        typeof res.headers.getSetCookie === "function"
          ? res.headers.getSetCookie()
          : [res.headers.get("set-cookie")].filter(Boolean);
      for (const raw of set) {
        const [pair] = raw.split(";");
        const eq = pair.indexOf("=");
        if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
    },
    header() {
      return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ") || undefined;
    },
    size: () => jar.size,
  };
}

async function call(pathname, { method = "GET", body, auth, jar } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  const cookie = jar?.header();
  if (cookie) headers.cookie = cookie;
  if (auth) headers.authorization = `Bearer ${auth}`; // in-memory only

  let res;
  try {
    res = await fetch(`${BASE_URL}${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
  } catch (err) {
    return { networkError: String(err?.cause?.code ?? err?.message ?? err) };
  }
  jar?.absorb(res);

  let parsed = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed, cookieCount: jar?.size() ?? 0 };
}

function errorOf(callResult) {
  return callResult?.body?.error?.code ?? null;
}

// --- mail.tm (disposable mailbox; default none survives) ----------------------

const MAILTM = "https://api.mail.tm";

async function mailtmFetch(pathname, { method = "GET", body, token } = {}) {
  const res = await fetch(`${MAILTM}${pathname}`, {
    method,
    headers: {
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/**
 * Reuses AUTH_TEST_EMAIL/AUTH_TEST_PASSWORD when supplied, otherwise
 * provisions a fresh mail.tm address and DELETES it at the end of the run.
 */
async function provisionMailbox() {
  const fixed = process.env.AUTH_TEST_EMAIL;
  if (fixed) {
    const tokenRes = await mailtmFetch("/token", {
      method: "POST",
      body: { address: fixed, password: process.env.AUTH_TEST_PASSWORD ?? "" },
    });
    if (tokenRes.status !== 200) return { error: `AUTH_TEST_EMAIL failed to authenticate against mail.tm (status ${tokenRes.status})` };
    info("mailbox", `reusing ${fixed} (from env; not deleted)`);
    return { address: fixed, token: tokenRes.body?.token, fresh: false, cleanup: async () => {} };
  }
  if (NO_EMAIL) return { error: "--no-email needs AUTH_TEST_EMAIL + AUTH_TEST_PASSWORD of a reusable mailbox" };

  const domains = await mailtmFetch("/domains?page=1");
  const domain = domains.body?.["hydra:member"]?.find((d) => d.isActive && !d.isPrivate)?.domain;
  if (!domain) return { error: `mail.tm returned no usable domain (status ${domains.status})` };

  const address = `offcheck.${randomBytes(6).toString("hex")}@${domain.toLowerCase()}`;
  const created = await mailtmFetch("/accounts", { method: "POST", body: { address, password: PASSWORD } });
  if (created.status !== 201 || !created.body?.id) return { error: `mail.tm account creation failed (status ${created.status})` };

  const tokenRes = await mailtmFetch("/token", { method: "POST", body: { address, password: PASSWORD } });
  if (tokenRes.status !== 200) return { error: `mail.tm token issuance failed (status ${tokenRes.status})` };

  info("mailbox", `fresh disposable address created (deleted after the run)`);
  return {
    address,
    token: tokenRes.body?.token,
    fresh: true,
    cleanup: async () => {
      if (KEEP_MAILBOX) return;
      await mailtmFetch(`/accounts/${created.body.id}`, { method: "DELETE", token: tokenRes.body?.token });
    },
  };
}

/** Polls the mailbox until a message carries our branded hash-token link. */
async function waitForRecoveryLink(mailbox, { timeoutMs = 150_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  const linkPattern = /https?:\/\/[^\s"'<>]+\/reset-password\?token_hash=([A-Za-z0-9_./%=+-]+)&type=recovery/;
  while (Date.now() < deadline) {
    const list = await mailtmFetch("/messages?page=1", { token: mailbox.token });
    for (const msg of list.body?.["hydra:member"] ?? []) {
      if (!/reset/i.test(msg.subject ?? "") || !/offanime/i.test(msg.from?.address ?? "")) continue;
      const detail = await mailtmFetch(`/messages/${msg.id}`, { token: mailbox.token });
      const haystack = `${detail.body?.text ?? ""}\n${(detail.body?.html ?? []).join("\n")}`;
      const match = linkPattern.exec(haystack);
      if (match) {
        info("email", `subject: ${msg.subject} — from: ${msg.from?.address}`);
        return { subject: msg.subject, tokenHash: decodeURIComponent(match[1]) };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  return null;
}

// --- main ---------------------------------------------------------------------

async function main() {
  console.error(`OFFANIME auth lifecycle check — ${BASE_URL}${NO_EMAIL ? "  (email steps skipped)" : ""}\n`);

  // A. source assertions
  await assertSource();

  // 1. Reachability (also proves the same-origin proxy answers).
  const ping = await call("/api/auth/me");
  if (ping.networkError) {
    fail("frontend reachable", `${BASE_URL} unresponsive — start one, e.g. "npx next dev -p 3055"`);
    finish();
  }
  pass("frontend reachable", `/api/auth/me answered (${ping.status} as designed without a session)`);

  // 2. Mailbox
  const mailbox = await provisionMailbox();
  if (mailbox.error) {
    if (NO_EMAIL) skip("mailbox", mailbox.error);
    else {
      fail("mailbox", mailbox.error);
      finish();
    }
  }

  const freshFlow = !NO_EMAIL && mailbox.fresh;

  if (freshFlow) {
    // 3. Signup issues a session IMMEDIATELY — no verification anywhere.
    const signup = await call("/api/auth/signup", { method: "POST", body: { email: mailbox.address, password: PASSWORD } });
    if (signup.networkError) fail("B1 signup issues session immediately", `network error (${signup.networkError})`);
    else if (signup.status === 201 && signup.body?.session) pass("B1 signup issues session immediately", "201 {user, session}; no confirmation step; no resend call");
    else if (signup.status === 201 && (signup.body?.emailConfirmationRequired || signup.body?.session === null))
      fail("B1 signup issues session immediately", `signup returned NO session — upstream "Confirm email" is still ON (toggle OFF per docs/auth/SUPABASE_SETUP.md §1a)`);
    else if (signup.status === 409) fail("B1 signup issues session immediately", "409 AUTH_EMAIL_TAKEN — mailbox address already registered; rerun for a fresh mailbox");
    else fail("B1 signup issues session immediately", `status ${signup.status} code ${errorOf(signup)}`);

    // 4. Login with the fresh credentials (dedicated jar).
    const loginJar = makeJar();
    const login = await call("/api/auth/login", { method: "POST", body: { email: mailbox.address, password: PASSWORD }, jar: loginJar });
    if (login.status === 200 && login.body?.session) pass("B2 login returns session", `${login.cookieCount} HttpOnly cookie(s) set upstream`);
    else if (errorOf(login) === "AUTH_EMAIL_NOT_CONFIRMED")
      fail("B2 login returns session", `AUTH_EMAIL_NOT_CONFIRMED — upstream "Confirm email" still ON (docs/auth/SUPABASE_SETUP.md §1a)`);
    else fail("B2 login returns session", `status ${login.status} code ${errorOf(login)}`);

    // 5. Logout must be clean and idempotent.
    const logout = await call("/api/auth/logout", { method: "POST", jar: loginJar });
    if (logout.status === 200 && logout.body?.ok) pass("B3 logout clean", "200 {ok}; upstream cookies cleared");
    else fail("B3 logout clean", `status ${logout.status} code ${errorOf(logout)}`);
  } else {
    skip("B1 signup issues session immediately", "needs a fresh mailbox — run WITHOUT --no-email");
    skip("B3 logout clean", "needs a fresh session — run WITHOUT --no-email");
    if (mailbox.address) {
      const existing = await call("/api/auth/login", {
        method: "POST",
        body: { email: mailbox.address, password: process.env.AUTH_TEST_PASSWORD ?? "" },
        jar: makeJar(),
      });
      if (existing.status === 200 && existing.body?.session) pass("B2 login (existing account)", "session restored without confirmation friction");
      else if (errorOf(existing) === "AUTH_EMAIL_NOT_CONFIRMED")
        fail("B2 login (existing account)", `AUTH_EMAIL_NOT_CONFIRMED — "Confirm email" still ON upstream (docs/auth/SUPABASE_SETUP.md §1a)`);
      else if (errorOf(existing) === "AUTH_INVALID_CREDENTIALS") fail("B2 login (existing account)", "AUTH_INVALID_CREDENTIALS — AUTH_TEST_PASSWORD does not match this mailbox's account");
      else fail("B2 login (existing account)", `status ${existing.status} code ${errorOf(existing)}`);
    }
  }

  // 6. Anti-enumeration: an address that cannot exist gets the SAME uniform
  //    200 {ok:true}. No email is ever sent for unknown accounts.
  const ghost = await call("/api/auth/password-reset", { method: "POST", body: { email: `ghost.${randomBytes(4).toString("hex")}@example.invalid` } });
  if (ghost.networkError) fail("B4 anti-enumeration", `network error (${ghost.networkError})`);
  else if (ghost.status === 200 && ghost.body?.ok) pass("B4 anti-enumeration", "unknown address → uniform 200 {ok:true}, no existence hint");
  else if (errorOf(ghost) === "RATE_LIMIT_ERROR") skip("B4 anti-enumeration", "429 upstream (SMTP budget) — rerun later");
  else fail("B4 anti-enumeration", `status ${ghost.status} code ${errorOf(ghost)}`);

  // 7. Full recovery round-trip — email mode only.
  if (freshFlow) {
    // Exactly ONE password-reset call per run; abort (not retry) on 429.
    const reset = await call("/api/auth/password-reset", { method: "POST", body: { email: mailbox.address } });
    if (reset.networkError) {
      fail("B5 password-reset", `network error (${reset.networkError})`);
      finish();
    }
    if (reset.status === 200 && reset.body?.ok) pass("B5 password-reset accepted", "200 {ok:true}");
    else if (errorOf(reset) === "RATE_LIMIT_ERROR") {
      fail("B5 password-reset", "429 — built-in SMTP ≈ 2 emails/hour; wait and RERUN the script (no retries within a run by design)");
      finish();
    } else {
      fail("B5 password-reset", `status ${reset.status} code ${errorOf(reset)}`);
      finish();
    }

    const found = await waitForRecoveryLink(mailbox);
    if (!found) {
      fail("B6 recovery email arrives", "no hash-token reset link within 150s — check docs/auth/SUPABASE_SETUP.md §1b (Recovery template) and §1f");
      finish();
    }
    pass("B6 recovery email arrives", "branded template with token_hash link");

    // 8. Exchange the one-time token for a session (fresh jar: the response
    //    sets HttpOnly cookies; the body token stays in memory, never printed).
    const verifyJar = makeJar();
    const verify = await call("/api/auth/verify", { method: "POST", body: { type: "recovery", tokenHash: found.tokenHash }, jar: verifyJar });
    const bearer = verify.body?.session?.accessToken; // in-memory fallback only
    if (verify.status === 200 && (verify.body?.session || verify.cookieCount > 0)) pass("B7 verify → session", "one-time hash token exchanged");
    else {
      fail("B7 verify → session", `status ${verify.status} code ${errorOf(verify)}${errorOf(verify) === "AUTH_SESSION_EXPIRED" ? " — token invalid/consumed/expired" : ""}`);
      finish();
    }

    // 9. Set the NEW password.
    const update = await call("/api/auth/password-update", { method: "POST", body: { password: NEW_PASSWORD }, auth: bearer, jar: verifyJar });
    if (update.status === 200) pass("B8 password-update", "accepted (cookie session, or in-memory Bearer fallback; nothing logged)");
    else {
      fail("B8 password-update", `status ${update.status} code ${errorOf(update)}`);
      finish();
    }

    // 10. OLD password dead; NEW one logs in; logout clean.
    const oldLogin = await call("/api/auth/login", { method: "POST", body: { email: mailbox.address, password: PASSWORD } });
    if (oldLogin.status === 401 && errorOf(oldLogin) === "AUTH_INVALID_CREDENTIALS") pass("B9 old password rejected", "401 AUTH_INVALID_CREDENTIALS");
    else fail("B9 old password rejected", `status ${oldLogin.status} code ${errorOf(oldLogin)}`);

    const newLoginJar = makeJar();
    const newLogin = await call("/api/auth/login", { method: "POST", body: { email: mailbox.address, password: NEW_PASSWORD }, jar: newLoginJar });
    if (newLogin.status === 200 && newLogin.body?.session) pass("B10 new password logs in");
    else fail("B10 new password logs in", `status ${newLogin.status} code ${errorOf(newLogin)}`);

    const finalLogout = await call("/api/auth/logout", { method: "POST", jar: newLoginJar });
    if (finalLogout.status === 200 && finalLogout.body?.ok) pass("B11 logout clean");
    else fail("B11 logout clean", `status ${finalLogout.status} code ${errorOf(finalLogout)}`);

    await mailbox.cleanup?.();
    info("cleanup", "disposable mailbox removed");
  } else {
    skip("B5–B11 recovery round-trip", "requires email mode (fresh mail.tm mailbox) — run WITHOUT --no-email after docs/auth/SUPABASE_SETUP.md §1a–§1d");
  }

  finish();
}

function finish() {
  const fails = failCount();
  const skipped = results.filter((status) => status === "SKIP").length;
  console.error(`\n${fails === 0 ? `ALL CHECKS PASSED${skipped ? ` · ${skipped} skipped` : ""}` : `${fails} FAILURE(S)`}\n`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`CRASH — ${err?.stack ?? err}`);
  process.exit(1);
});
