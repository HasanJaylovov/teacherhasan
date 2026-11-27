# Admin OTP — test matrix and execution report

Target branch: `redesign/puddle-pwa`

This file distinguishes tests authored from tests actually executed. A test must not be marked PASS until its command or scenario has been run and its result recorded.

## Automated unit tests

| ID | Scenario | Test location | Status |
|---|---|---|---|
| UT-01 | OTP is always six decimal digits | `tests/admin-auth.test.js` | PASS — isolated local run |
| UT-02 | OTP digest is bound to challenge ID and code | `tests/admin-auth.test.js` | PASS — isolated local run |
| UT-03 | Session token is stored as a one-way SHA-256 digest | `tests/admin-auth.test.js` | PASS — isolated local run |
| UT-04 | scrypt hash accepts only the correct password | `tests/admin-auth.test.js` | PASS — isolated local run |
| UT-05 | Cookie parsing handles encoded and malformed values | `tests/admin-auth.test.js` | PASS — isolated local run |
| UT-06 | Cookie is HttpOnly, SameSite Strict, scoped and Secure by default | `tests/admin-auth.test.js` | PASS — GitHub Actions |
| UT-07 | Every admin data endpoint is guarded by `requireAdmin` | `tests/admin-auth.test.js` | PASS — GitHub Actions |
| UT-08 | Legacy one-step admin login remains retired with HTTP 410 | `tests/admin-auth.test.js` | PASS — GitHub Actions |

Run with:

```bash
npm ci
npm test
node --check server.js
node --check public/admin.js
node --check lib/admin-auth.js
node --check scripts/generate-admin-password-hash.js
```

## API and database integration matrix

Run only against a disposable non-production PostgreSQL database and test Gmail account.

| ID | Scenario | Expected result | Status |
|---|---|---|---|
| IT-01 | Correct email + password | OTP email sent; no admin session yet | Pending |
| IT-02 | Wrong email or password | Generic 401; no OTP and no session | Pending |
| IT-03 | Correct OTP | Session cookie issued; session row created | Pending |
| IT-04 | Wrong OTP | 401; attempt count increments | Pending |
| IT-05 | Five incorrect OTP attempts | Challenge consumed/blocked | Pending |
| IT-06 | OTP older than five minutes | Rejected | Pending |
| IT-07 | Reuse successful OTP | Rejected; no second session | Pending |
| IT-08 | Resend before 60 seconds | Rejected | Pending |
| IT-09 | Resend after cooldown | New code sent; old code rejected | Pending |
| IT-10 | SMTP delivery failure | No usable challenge; generic 503 | Pending |
| IT-11 | Old `POST /api/admin/login` endpoint | HTTP 410; no token/session | Pending |
| IT-12 | No cookie / invalid cookie | Protected admin endpoint returns 401 | Pending |
| IT-13 | Expired session | Protected admin endpoint returns 401 | Pending |
| IT-14 | Logout then replay cookie | Protected endpoint returns 401 | Pending |
| IT-15 | Session survives server restart | Valid unexpired DB-backed session remains valid | Pending |
| IT-16 | Multiple server instances | Both validate the same DB-backed session | Pending |
| IT-17 | Cross-origin unsafe admin request | HTTP 403 | Pending |
| IT-18 | Login rate limit exceeded | HTTP 429 | Pending |
| IT-19 | Admin route inventory | Every data endpoint requires `requireAdmin` | Pending |
| IT-20 | Database inspection | OTP and session token raw values absent | Pending |

## Admin route inventory

The following data routes were checked in source and are protected by `requireAdmin`:

- `GET /api/admin/dashboard`
- `GET /api/admin/users`
- `PATCH /api/admin/users/:id`
- `GET /api/admin/payments`
- `GET /api/admin/speaking-results`
- `GET /api/admin/settings`
- `POST /api/admin/users/:id/premium`

Authentication routes are intentionally public until verification:
- `POST /api/admin/auth/login`
- `POST /api/admin/auth/verify-otp`
- `POST /api/admin/auth/resend-otp`

Authenticated session routes:
- `GET /api/admin/auth/me`
- `POST /api/admin/auth/logout`

Legacy route:
- `POST /api/admin/login` returns 410 and cannot issue a session.

## Browser acceptance checks

1. Open the admin page in a clean browser profile.
2. Submit the configured admin email and password.
3. Confirm the browser remains on the login panel while the OTP is pending.
4. Confirm the OTP arrives at the configured mailbox.
5. Enter the OTP and confirm the dashboard loads.
6. Refresh the page; the valid session should restore without asking for credentials again.
7. Sign out; refresh and replay the old cookie; access must be denied.
8. Confirm browser storage has no `th_admin_token` or raw admin bearer token.
9. Confirm the admin cookie has HttpOnly, SameSite=Strict, Secure in production, and Path=/api/admin.
10. Confirm an expired session returns the user to the login form.

## Current execution record

- Full repository CI completed on Node.js 24.22.3 / npm 11.19.1 for commit `e3cf9d602dc1a103222bc47d3b2a13f316f9018b`: **PASS**.
- CI successfully ran `npm ci`, all eight tests via `npm test`, and JavaScript syntax checks for `server.js`, `public/admin.js`, `lib/admin-auth.js`, and `scripts/generate-admin-password-hash.js`.
- Workflow run: https://github.com/HasanJaylovov/teacherhasan/actions/runs/46031755698
- The dependency installation reported **5 npm audit findings** (1 moderate, 3 high, 1 critical). The audit details have not yet been triaged; this is recorded as a separate dependency-security task and no automatic dependency upgrades were applied.
- Disposable PostgreSQL and Gmail SMTP integration tests remain pending. No staging credentials or staging database have been configured.
- Production has not been deployed or modified; the database schema has not been applied to any database.
