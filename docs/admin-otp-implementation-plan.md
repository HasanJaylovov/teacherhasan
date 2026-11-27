# Admin email OTP — implementation record

## Scope and approval

- Target repository: `HasanJaylovov/teacherhasan`
- Target branch: `redesign/puddle-pwa`
- User approved implementation on this branch only.
- No merge to `main`, production deploy, Render configuration change, or production database operation is authorized by this approval.
- Production deployment and any production authentication change require separate explicit approval.

## Implemented flow

1. Admin submits the configured email and password.
2. The server checks the email and an encoded scrypt password hash.
3. The server creates a cryptographically random six-digit OTP.
4. Only an HMAC-SHA256 digest of the OTP is stored, bound to the challenge ID and a server-side pepper.
5. Gmail SMTP sends the code to the configured admin email.
6. OTP verification locks the challenge row, enforces expiry and attempt limits, and consumes the challenge exactly once.
7. Successful verification creates an opaque 48-byte session token. Only its SHA-256 hash is stored.
8. The browser receives an HttpOnly, SameSite=Strict cookie; Secure is enabled in production.
9. Every admin data endpoint checks the persisted session and its absolute expiry. Logout revokes the session in PostgreSQL.

## Implemented controls

- OTP: six digits, default five-minute expiry.
- OTP attempts: five maximum; challenge is consumed after the fifth failed attempt.
- Resend: 60-second cooldown, previous code hash rotated, per-challenge/IP rate limit.
- Login: persistent per-IP/email rate limit.
- Session: eight-hour absolute expiry, enforced by the database query on every protected request.
- Cookie: HttpOnly, SameSite=Strict, scoped to `/api/admin`, Secure in production.
- Unsafe authenticated admin requests: same-origin Origin header required.
- Password: scrypt encoded hash; plaintext is not stored.
- OTP: HMAC-SHA256 with `ADMIN_OTP_PEPPER`; raw OTP is not stored.
- Session: SHA-256 token hash only; raw token is not stored in PostgreSQL.
- SMTP errors: generic client response; logs include only a provider error code, not credentials or OTP.
- Legacy `POST /api/admin/login`: explicitly returns HTTP 410 and never creates a session.
- Admin frontend no longer stores an admin bearer token in localStorage.

## Files changed

- `server.js`: two-stage login, OTP verification/resend, database-backed session middleware, logout and retired legacy endpoint.
- `lib/admin-auth.js`: OTP/password/session/cookie primitives.
- `public/admin.html`, `public/admin.js`: email/password + OTP UI and cookie session flow.
- `database-schema.sql`: OTP challenge, session and rate-limit tables.
- `scripts/generate-admin-password-hash.js`: hidden terminal input utility for scrypt hash generation.
- `tests/admin-auth.test.js`: unit tests for OTP, hashing, password verification and cookies.
- `package.json`: test and password-hash scripts.

## Required environment variables (not configured here)

Keep all values private. No Render settings were changed.

- `ADMIN_EMAIL`: one configured administrator email.
- `ADMIN_PASSWORD_HASH`: generated with `npm run admin:password-hash`; use a password of at least 12 characters.
- `ADMIN_OTP_PEPPER`: random secret of at least 32 bytes; generate privately, for example with `openssl rand -hex 32`.
- `ADMIN_OTP_TTL_SECONDS=300` (server clamps the maximum to 300 seconds)
- `ADMIN_OTP_MAX_ATTEMPTS=5` (server clamps the maximum to five attempts)
- `ADMIN_OTP_RESEND_COOLDOWN_SECONDS=60`
- `ADMIN_SESSION_TTL_SECONDS=28800`
- `ADMIN_LOGIN_RATE_LIMIT=10`
- `ADMIN_COOKIE_SECURE`: optional; cookies are Secure by default except when `NODE_ENV=development` (set true to force Secure locally).
- Existing SMTP variables: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER`, `SMTP_PASSWORD` (Google App Password), and `SMTP_FROM`.

Authentication and protected admin API responses use `Cache-Control: no-store`. The admin session cookie is HttpOnly, SameSite=Strict and Secure by default outside explicit development mode.\n\nThe schema is committed to this branch only. It has not been applied to any database. The app's existing startup migration will apply the additive `CREATE TABLE IF NOT EXISTS` statements only when a deployment is later authorized.

## Verification status

- Static source inspection: completed.
- Automated unit tests: authored; execution still pending in a Node.js environment / branch CI.
- Database integration tests: pending against a disposable non-production PostgreSQL database.
- Gmail SMTP delivery test: pending with privately configured test credentials.
- Browser end-to-end test: pending.
- Production readiness: **not approved** until all test items in `docs/admin-otp-test-report.md` pass and a separate production approval is received.

## Explicit non-actions

- No deployment was triggered.
- No Render environment variables or secrets were created or edited.
- No production database schema or data was changed.
- No production admin credentials were read or changed.
- No branch was merged.
