# Admin OTP implementation plan

## Selected configuration

- Login flow: email + password, followed by email OTP.
- Email provider: Gmail SMTP.
- Admin session lifetime: 8 hours.
- Target branch: `redesign/puddle-pwa`.
- Production deployment: requires separate, explicit approval.
- Changes to the existing admin authentication/security behavior: require separate, explicit approval before implementation.

## Verified current implementation

Read-only inspection of `server.js`, `public/admin.html`, `public/admin.js`, and `package.json` on `redesign/puddle-pwa` found:

- `nodemailer` is already a dependency.
- SMTP transport is already configured from `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, and `SMTP_FROM`; it is currently used by password-reset email.
- Admin login currently uses `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `POST /api/admin/login`.
- Admin sessions are currently stored in the in-memory `adminSessions` map.
- `requireAdmin` checks map membership but does not enforce an 8-hour expiry.
- `public/admin.js` stores the bearer token in `localStorage` under `th_admin_token`.
- The current admin page has a single-stage username/password form.
- `package.json` already includes `pg` and `nodemailer`.

These are observations of the target branch at the time this plan was written; re-check the branch before implementation.

## Proposed login flow

1. Admin enters the configured admin email and password.
2. Server validates the email and password. Password verification must use a password hash (prefer Node.js built-in `crypto.scrypt` if avoiding a new native dependency); do not store or log plaintext passwords.
3. Server creates a cryptographically random six-digit OTP, stores only its hash, and emails the OTP to the configured admin email.
4. Admin enters the OTP.
5. Server validates the OTP's hash, expiry, attempt count, and one-time-use status.
6. On success, server creates an authenticated admin session with an absolute 8-hour expiry.
7. Logout revokes the session. Expired/revoked sessions must be rejected by every admin-protected API route.

## Proposed environment variables

Keep secrets out of Git and source files. Configure them privately in Render only after the implementation and deployment are separately approved.

- `ADMIN_EMAIL`: one configured administrator email address.
- `ADMIN_PASSWORD_HASH`: password hash generated offline; never commit the plaintext password.
- `ADMIN_OTP_LENGTH=6`.
- `ADMIN_OTP_TTL_SECONDS=300`.
- `ADMIN_OTP_MAX_ATTEMPTS=5`.
- `ADMIN_OTP_RESEND_COOLDOWN_SECONDS=60`.
- `ADMIN_SESSION_TTL_SECONDS=28800`.
- `SMTP_HOST=smtp.gmail.com`.
- `SMTP_PORT=587`.
- `SMTP_SECURE=false`.
- `SMTP_USER`: Gmail address used to send messages.
- `SMTP_PASSWORD`: Google App Password, not the normal Gmail account password.
- `SMTP_FROM`: verified sender address/name.

Reuse the existing SMTP transport where appropriate; avoid creating a second mail configuration with conflicting variable names. Confirm Gmail account/App Password readiness privately in Render. Never ask the user to paste SMTP credentials into chat.

## Proposed API contract

The final endpoint names and response shapes must be reconciled with the existing frontend before implementation.

- `POST /api/admin/auth/login`: accepts email/password; returns an OTP challenge identifier and expiry, not an admin bearer token.
- `POST /api/admin/auth/verify-otp`: accepts challenge identifier and OTP; on success establishes the admin session.
- `POST /api/admin/auth/resend-otp`: resends only when cooldown and attempt rules permit.
- `GET /api/admin/auth/me`: reports whether the current admin session is valid and its expiry.
- `POST /api/admin/auth/logout`: revokes the current session.

All existing admin data endpoints must continue to require authentication. The implementation must not accidentally leave any dashboard, user, payment, speaking-result, settings, or premium-management endpoint unprotected.

## Persistence and session design

Preferred design: persist OTP challenges and admin sessions in PostgreSQL so a server restart or multiple service instances cannot silently bypass or invalidate the security model.

Proposed records:

- OTP challenge: challenge ID, admin identity, OTP hash, created/expiry timestamps, attempt count, consumed timestamp, resend timestamp.
- Admin session: opaque random token hash, admin identity, created timestamp, expiry timestamp, revoked timestamp.

Do not store raw OTPs or raw session tokens in the database. Add database indexes and cleanup for expired records. Any schema migration must be reviewed and tested against a non-production database first.

For browser session transport, evaluate a Secure, HttpOnly, SameSite cookie to avoid exposing admin credentials to JavaScript. This is a deliberate compatibility change from the current `localStorage` bearer-token flow and requires coordinated frontend/backend updates and explicit approval before modifying existing admin security behavior.

## UI changes after approval

- Stage 1: email + password form.
- Stage 2: six-digit OTP form, resend cooldown/countdown, expiry and attempt feedback.
- Clear error messages in Uzbek without revealing whether the email or password alone was correct.
- Keep the existing admin dashboard views and navigation unchanged.
- Handle expired sessions by returning to login and clearing stale client state.

## Security controls

- Cryptographically secure OTP generation.
- Store OTP hashes only; constant-time comparisons where applicable.
- Five-minute OTP lifetime, maximum five verification attempts, 60-second resend cooldown.
- Rate-limit login, OTP verification, and resend by account and source.
- Invalidate previous challenges when a new OTP is issued.
- Consume OTP exactly once.
- Do not log passwords, OTPs, session tokens, SMTP credentials, or full authentication payloads.
- Use generic login failures and avoid account/email enumeration.
- Enforce server-side 8-hour expiry on every protected request.
- Revoke sessions on logout; consider invalidating all sessions after password changes.
- Verify HTTPS and secure cookie behavior in the deployed environment before enabling cookie-based sessions.

## Implementation phases

1. **Read-only audit (done):** inspect current admin routes, frontend token handling, SMTP setup, dependencies, and session storage.
2. **Design review (this document):** agree on endpoint contract, database persistence, and cookie-vs-bearer session strategy.
3. **Approval gate:** obtain explicit approval before changing the existing admin authentication/security behavior.
4. **Branch implementation:** make changes only on `redesign/puddle-pwa`; add tests for OTP expiry, replay, attempt limits, resend cooldown, session expiry, logout, and route protection.
5. **Non-production verification:** run automated tests and verify Gmail SMTP with test credentials in a non-production environment.
6. **Deployment approval gate:** request separate explicit approval before changing production environment variables, production database schema/data, or deploying to `teacherhasan.uz`.

## Current status

Planning document only. No authentication code, admin UI, database schema, environment variables, production services, or production data have been changed.
