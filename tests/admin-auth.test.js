import test from "node:test";
import assert from "node:assert/strict";
import {
    generateOtp,
    hashOtp,
    safeEqualHex,
    hashSessionToken,
    hashAdminPassword,
    verifyAdminPassword,
    readCookie,
    buildAdminSessionCookie,
    clearAdminSessionCookie
} from "../lib/admin-auth.js";

test("OTP generator always returns six decimal digits", () => {
    for (let i = 0; i < 100; i++) {
        assert.match(generateOtp(), /^\d{6}$/);
    }
});

test("OTP hash is bound to both challenge id and code", () => {
    const hash = hashOtp("challenge-a", "123456", "test-pepper");
    assert.equal(safeEqualHex(hash, hashOtp("challenge-a", "123456", "test-pepper")), true);
    assert.equal(safeEqualHex(hash, hashOtp("challenge-b", "123456", "test-pepper")), false);
    assert.equal(safeEqualHex(hash, hashOtp("challenge-a", "654321", "test-pepper")), false);
    assert.equal(safeEqualHex(hash, "not-a-hash"), false);
});

test("session token storage uses a one-way SHA-256 digest", () => {
    const token = "a".repeat(96);
    const digest = hashSessionToken(token);
    assert.match(digest, /^[a-f0-9]{64}$/);
    assert.notEqual(digest, token);
    assert.equal(hashSessionToken(token), digest);
});

test("scrypt password hashes verify only the correct password", async () => {
    const encoded = await hashAdminPassword("correct horse battery staple", Buffer.alloc(16, 7));
    assert.match(encoded, /^scrypt\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    assert.equal(await verifyAdminPassword("correct horse battery staple", encoded), true);
    assert.equal(await verifyAdminPassword("wrong password", encoded), false);
    assert.equal(await verifyAdminPassword("anything", "plaintext-password"), false);
});

test("cookie parser handles values and malformed encoding safely", () => {
    assert.equal(readCookie("a=1; th_admin_session=abc%2F123; b=2", "th_admin_session"), "abc/123");
    assert.equal(readCookie("th_admin_session=%E0%A4%A", "th_admin_session"), null);
    assert.equal(readCookie("a=1", "th_admin_session"), null);
});

test("admin cookie is HttpOnly, scoped, SameSite Strict and Secure by default", () => {
    const cookie = buildAdminSessionCookie("opaque-token");
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Path=\/api\/admin/);
    assert.match(clearAdminSessionCookie(), /Max-Age=0/);
});

test("every admin data endpoint is guarded by requireAdmin", async () => {
    const { readFile } = await import("node:fs/promises");
    const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");
    const protectedRoutes = [
        ["get", "/api/admin/dashboard"],
        ["get", "/api/admin/users"],
        ["patch", "/api/admin/users/:id"],
        ["get", "/api/admin/payments"],
        ["get", "/api/admin/speaking-results"],
        ["get", "/api/admin/settings"],
        ["post", "/api/admin/users/:id/premium"]
    ];

    for (const [method, route] of protectedRoutes) {
        const escapedRoute = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const routePattern = new RegExp(
            `app\\.${method}\\s*\\(\\s*["']${escapedRoute}["']\\s*,\\s*requireAdmin\\s*,`,
            "i"
        );
        assert.match(
            serverSource,
            routePattern,
            `${method.toUpperCase()} ${route} must use requireAdmin`
        );
    }
});

test("legacy one-step admin login is retired with HTTP 410", async () => {
    const { readFile } = await import("node:fs/promises");
    const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");
    const legacyLoginStart = serverSource.indexOf('app.post("/api/admin/login"');
    assert.notEqual(legacyLoginStart, -1, "legacy admin login route must remain explicitly retired");
    const legacyLoginBlock = serverSource.slice(legacyLoginStart, legacyLoginStart + 400);
    assert.ok(
        legacyLoginBlock.includes("res.status(410)"),
        "legacy admin login must return HTTP 410 and never issue a session"
    );
});

