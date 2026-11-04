# Supabase Auth — Operator Runbook

Runs the OFFANIME password-reset email pipeline. **Nothing here touches the
frontend or backend code** — both are already wired and verified; this file is
only about the Supabase dashboard configuration that makes signup
session-immediate and makes reset emails deliver our branded template.

---

## 0. Why Supabase is the email sender (verified, not a guess)

The OFFANIME backend (`OFFAnime-Backend-.git` — the one `backend.md` documents,
equals the deployed service) ships **no mail service of its own**. Its only
email capability is Supabase Auth (GoTrue): `/api/auth/password-reset` asks
Supabase to send the recovery mail, and `POST /api/auth/verify` consumes the
one-time `token_hash` from that email's link. The frontend never sends email,
never renders a verification step, and **never calls `/api/auth/resend`**
(deliberately unwired — see the checklist below).

So every behavior below is configured in **Supabase Dashboard** on project
`tbcuzdhffvfliucdxowb`.

---

## 1. Checklist

### 1a. Turn OFF "Confirm email" *(product requirement)*

> **Authentication → Sign In / Up → Email provider → "Confirm email" → OFF**

The product ships signup with **no email verification**: no verification UI,
no "click to confirm" step, no resend button. With the toggle OFF:

- `POST /api/auth/signup` returns `201 { user, session }` — **session
  immediately**, user lands inside the app right away.
- `POST /api/auth/login` never fails with `AUTH_EMAIL_NOT_CONFIRMED`.

While the toggle is still ON (historically observed on this project):

- signup returns `201 { user, session: null, emailConfirmationRequired: true }`
  **and sends a confirmation email** (why a confirmation mail was seen earlier);
  the frontend surfaces that as `session-not-issued` — an honest
  "automatic sign-in didn't complete" notice offering the normal sign-in, with
  NO verification UI anywhere,
- login on that account fails `403 AUTH_EMAIL_NOT_CONFIRMED`, which the
  frontend maps to a plain failed sign-in notice (no activation wording).

Do **not** solve that state with UI. Toggle it OFF; nothing else is required.

### 1b. Paste the branded Recovery template + subject

> **Authentication → Emails → Templates → "Recovery"** (older layout:
> Authentication → Email Templates → "Recovery")

1. **Subject** — replace everything with exactly:
   ```
   Reset your OFFANIME password
   ```
2. **Body** — open [`docs/auth/reset-password-email.html`](./reset-password-email.html),
   select **all**, copy, and paste it over the entire template body.

Why the template swap matters: Supabase's stock template sends an
**OTP-code link** (`{{ .Token }}`, `redirect_to` fragment flow) which the
backend's `/api/auth/verify` cannot consume — it expects an
**hash-token link**. Our template points the CTA at:

```
{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery
```

`token_hash` is then exchanged once by the backend for a fresh session.
The template contains the exact product-approved copy
("Forgot your password?", "No worries. We've got you covered.",
"RESET PASSWORD", the safe-ignore footer) and no JavaScript.

**Site URL dependency** — `{{ .SiteURL }}` comes from
**Authentication → URL Configuration → Site URL**. Set it to the origin the
user should be on when they click (production domain; temporarily set it to
your dev origin while testing). If Site URL points at production, dev
click-throughs leave the app from production — that is expected, not a bug.

### 1c. Link expiry

Search the dashboard for **"OTP expiry"** (Authentication → Settings).
It is the lifetime of the recovery link itself (default ≈ 1 hour). The email
copy deliberately never quotes a fixed number so it can't lie about this
setting. Links are one-time: a second use returns `401 AUTH_SESSION_EXPIRED`.

### 1d. Redirect URLs (allowlist)

> **Authentication → URL Configuration → Redirect URLs**

Add both environments' reset page exactly:

```
http://localhost:3000/reset-password
https://<production-origin>/reset-password
```

(`http://localhost:3000` is currently allowlisted through this pattern's
ancestor entries; keep it while the project still runs locally.) The email
CTA leaves for `/reset-password?token_hash=…&type=recovery` on the configured
Site URL; Supabase drops redirects to origins not on this list.

### 1e. Email rate limits & SMTP

- **Built-in (default) sender**: engineering-for-testing only — roughly
  **2 emails per hour** were observed before upstream answered
  `429 RATE_LIMIT_ERROR`. A 429 here is the sender, not the app; wait it out.
  Do not "retry" reset requests in a loop (the official resend endpoint is
  never called from the frontend for exactly this reason).
- **Production**: attach real SMTP at **Authentication → Emails → SMTP**
  (custom SMTP provider). The prepared-but-inactive backend "Resend" mode
  stays exactly that — backend-side, future (`src/lib/auth/resend-future.ts`
  keeps the seam with a TODO; no product code path calls it).

### 1f. Backend/frontend wiring (recap — should already be true)

| Setting | Where | Value |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | backend env | this project |
| `AUTH_COOKIES_ENABLED` | backend env | `true` (HttpOnly cookie sessions) |
| `CORS_ORIGIN` | backend env | explicit frontend origins — wildcard `*` cannot send cookies |
| `OFFANIME_BACKEND_URL`, `BACKEND_API_SECRET` | frontend `.env.local` | proxy→backend; **server-side only**, never referenced in client code |

The frontend talks to auth exclusively through same-origin `/api/auth/*`
(a thin proxy of `src/app/api/[...path]/route.ts`), so tokens live only in
HttpOnly cookies — never in `localStorage`/`sessionStorage`, never in logs.

---

## 2. Verify — lifecycle script

After 1a–1d, run:

```bash
# full pool (fresh disposable mailbox via mail.tm, real email round-trip)
node scripts/auth-lifecycle-check.mjs --base-url http://localhost:3055

# skip email-consuming steps (signup/reset/email); reuse an existing account
AUTH_TEST_EMAIL=<addr> AUTH_TEST_PASSWORD=<pw> \
  node scripts/auth-lifecycle-check.mjs --no-email --base-url http://localhost:3055
```

The script asserts (and hard-fails otherwise):

- **source**: nothing under `src/` ever calls `/api/auth/resend`, no auth
  imports touch the offline `resend-future.ts` seam, and no auth code touches
  `localStorage`/`sessionStorage`;
- **behavior**: signup issues a session immediately (no confirmation step)
  — when run with email enabled;
- **anti-enumeration**: `password-reset` answers a globally-uniform
  `{ ok: true }` for unknown addresses;
- **full recovery**: email → `token_hash` → `/verify` → `password-update`
  → old password dead, new password logs in, `logout` clean.

Notes the script will print: tokens are never logged; one password-reset per
run; skip and wait if you've recently burned the SMTP budget.

---

## 3. Auth error codes — what each means for an operator

| Code | HTTP | Meaning / action |
| --- | --- | --- |
| `AUTH_INVALID_CREDENTIALS` | 401 | wrong email/password — normal user-level failure |
| `AUTH_EMAIL_NOT_CONFIRMED` | 403 | **"Confirm email" toggle is back ON** → redo 1a |
| `AUTH_SESSION_EXPIRED` | 401 | reset link consumed/invalid/expired → request a fresh one (verify route) |
| `AUTH_EMAIL_TAKEN` | 409 | signup with an existing address → surface "try signing in" |
| `RATE_LIMIT_ERROR` | 429 | sender budget exhausted (built-in SMTP ≈ 2 emails/h) → wait; production SMTP removes this |
| `AUTH_PROVIDER_ERROR` | 502 | Supabase/GoTrue unreachable or misconfigured (`missing_configuration`) → check backend env |
| `UNAUTHORIZED_ERROR` | 401 | session-required call without cookies/API key |
| `VALIDATION_ERROR` | 400 | malformed email / password (<8 or >128 chars) — client-side validation mirrors this |
| `FORBIDDEN_ERROR` | 403 | CSRF/origin rejection — `CORS_ORIGIN` must list the frontend origin explicitly |
| `PROXY_NOT_CONFIGURED` | 500 | frontend `.env.local` missing `OFFANIME_BACKEND_URL`/`BACKEND_API_SECRET` |
| `TIMEOUT_ERROR` | 504 | backend/proxy didn't answer in time — retry later |
