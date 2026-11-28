import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const publicRoot = path.resolve("public");
const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/manifest+json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".webp": "image/webp"
};

const server = http.createServer((req, res) => {
    let pathname;
    try {
        pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    } catch {
        res.writeHead(400).end("Bad request");
        return;
    }
    if (pathname === "/") pathname = "/index.html";
    // Mirror the Express alias used by the deployed application.
    if (pathname === "/admin") pathname = "/admin.html";
    const file = path.resolve(publicRoot, "." + pathname);
    if (!file.startsWith(publicRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404).end("Not found");
        return;
    }
    res.writeHead(200, {
        "Content-Type": mime[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
    });
    fs.createReadStream(file).pipe(res);
});

const listen = () => new Promise(resolve => server.listen(4173, "127.0.0.1", resolve));
const close = () => new Promise(resolve => server.close(resolve));

let browser;
try {
    await listen();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    let chatRequests = 0;

    let meScenario = "normal";
    await page.route("**/api/me", route => {
        if (meScenario === "unavailable") {
            return route.fulfill({
                status: 503,
                contentType: "application/json",
                body: JSON.stringify({ success: false, error: "Temporary account API outage" })
            });
        }
        if (meScenario === "malformed") {
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ success: true })
            });
        }
        const authorization = route.request().headers()["authorization"] || "";
        const data = ["Bearer smoke-test-token", "Bearer smoke-login-token", "Bearer smoke-register-token"].includes(authorization)
            ? { authenticated: true, user: { id: "smoke-user", fullName: "Smoke Learner", email: "smoke@example.test" }, access: { mode: "trial", plan: "smoke-test" } }
            : { authenticated: false };
        return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(data)
        });
    });
    const authRequestBodies = {};
    await page.route("**/api/auth/register", route => {
        authRequestBodies.register = route.request().postDataJSON();
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, token: "smoke-register-token", user: { id: "register-user", fullName: "Smoke Learner" }, access: { mode: "trial" } }) });
    });
    await page.route("**/api/auth/login", route => {
        authRequestBodies.login = route.request().postDataJSON();
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, token: "smoke-login-token", user: { id: "login-user", fullName: "Smoke Learner" }, access: { mode: "trial" } }) });
    });
    const logoutAuthorization = [];
    await page.route("**/api/auth/logout", route => {
        logoutAuthorization.push(route.request().headers()["authorization"] || "");
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
    });
    const adminRequestBodies = {};
    const adminAuthMeCookies = [];
    const adminApiCookies = [];
    const adminLogoutCookies = [];

    await page.route("**/api/admin/auth/me", route => {
        const cookie = route.request().headers()["cookie"] || "";
        adminAuthMeCookies.push(cookie);
        const hasSession = cookie.includes("th_admin_session=smoke-admin-cookie");
        return route.fulfill({
            status: hasSession ? 200 : 401,
            contentType: "application/json",
            body: JSON.stringify(hasSession
                ? { success: true, admin: { email: "admin@example.test" }, expiresAt: "2026-11-28T20:00:00.000Z" }
                : { success: false, error: "Admin sessiyasi mavjud emas." })
        });
    });
    await page.route("**/api/admin/auth/login", route => {
        adminRequestBodies.login = route.request().postDataJSON();
        return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                success: true, challengeId: "smoke-admin-challenge",
                expiresInSeconds: 300, resendAfterSeconds: 1,
                message: "Tasdiqlash kodi admin emailingizga yuborildi."
            })
        });
    });
    await page.route("**/api/admin/auth/resend-otp", route => {
        adminRequestBodies.resend = route.request().postDataJSON();
        return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ success: true, expiresInSeconds: 300, resendAfterSeconds: 1, message: "Yangi tasdiqlash kodi yuborildi." })
        });
    });
    await page.route("**/api/admin/auth/verify-otp", async route => {
        adminRequestBodies.verify = route.request().postDataJSON();
        if (adminRequestBodies.verify.otp !== "123456") {
            return route.fulfill({
                status: 401,
                contentType: "application/json",
                body: JSON.stringify({ success: false, error: "Kod noto‘g‘ri yoki uning amal qilish muddati tugagan." })
            });
        }
        await context.addCookies([{
            name: "th_admin_session", value: "smoke-admin-cookie",
            domain: "127.0.0.1", path: "/api/admin",
            httpOnly: true, sameSite: "Strict"
        }]);
        return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ success: true, admin: { email: "admin@example.test" }, expiresAt: "2026-11-28T20:00:00.000Z" })
        });
    });

    const adminResponses = {
        "/api/admin/dashboard": { success: true, stats: { users: 0, premium: 0, trial: 0, blocked: 0, payments: 0, revenue: 0, speakingResults: 0, serverTime: "2026-11-24T00:00:00.000Z" }, recentUsers: [], recentPayments: [] },
        "/api/admin/users": { success: true, users: [] },
        "/api/admin/payments": { success: true, payments: [] },
        "/api/admin/speaking-results": { success: true, results: [] },
        "/api/admin/settings": { success: true, settings: { guestMinutes: 10, trialDays: 1, plans: { oneMonth: 35000, twoMonths: 55000, threeMonths: 99000 } } }
    };
    for (const [endpoint, payload] of Object.entries(adminResponses)) {
        await page.route("**" + endpoint, route => {
            const headers = route.request().headers();
            const cookie = headers["cookie"] || "";
            const authorization = headers["authorization"] || "";
            const hasSession = cookie.includes("th_admin_session=smoke-admin-cookie") && !authorization;
            adminApiCookies.push({ endpoint, cookie, authorization });
            return route.fulfill({
                status: hasSession ? 200 : 401,
                contentType: "application/json",
                body: JSON.stringify(hasSession ? payload : { success: false, error: "Admin sessiyasi mavjud emas." })
            });
        });
    }
    await page.route("**/api/admin/auth/logout", async route => {
        const headers = route.request().headers();
        const cookie = headers["cookie"] || "";
        const authorization = headers["authorization"] || "";
        const hasSession = cookie.includes("th_admin_session=smoke-admin-cookie") && !authorization;
        adminLogoutCookies.push({ cookie, authorization });
        if (hasSession) await context.clearCookies();
        return route.fulfill({
            status: hasSession ? 200 : 401,
            contentType: "application/json",
            body: JSON.stringify(hasSession ? { success: true } : { success: false, error: "Admin sessiyasi mavjud emas." })
        });
    });
    await page.route("**/api/admin/login", route => route.fulfill({
        status: 410,
        contentType: "application/json",
        body: JSON.stringify({ success: false, error: "Eski admin login o‘chirilgan." })
    }));

    const chatAuthorization = [];
    await page.route("**/api/chat", route => {
        chatRequests += 1;
        chatAuthorization.push(route.request().headers()["authorization"] || "");
        return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ success: true, reply: "Mock AI reply: Excellent work!" })
        });
    });
    await page.route("https://esm.sh/@google/genai", route => route.fulfill({
        status: 200,
        contentType: "text/javascript",
        body: "export class GoogleGenAI {}"
    }));

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("http://127.0.0.1:4173/puddle-redesign/index.html", { waitUntil: "domcontentloaded" });
    assert.equal(await page.title(), "Teacher Hasan AI");
    assert.ok(await page.locator('a[href="/profile.html?returnTo=%2Fpuddle-redesign%2F"]').count() >= 3,
        "PWA profile and premium entry points should open the account/subscription page");
    assert.equal(await page.locator('a[href="/offer.html"]').count(), 0,
        "Premium navigation must not lead to the legal offer document");
    assert.equal(await page.locator(".desktop-sidebar").isVisible(), true, "desktop sidebar should be visible");
    assert.equal(await page.locator(".bottom-nav").isVisible(), false, "desktop bottom navigation should be hidden");
    assert.equal(await page.locator(".hero-card").count(), 1, "home hero should render");
    assert.equal(await page.locator(".language-chip").count(), 8, "homepage should list all eight supported learning languages");
    assert.deepEqual(await page.locator(".language-chip b").allTextContents(), ["Uzbek", "English", "German", "Arabic", "Russian", "Turkish", "Korean", "Chinese"], "language cards should match the supported eight-language catalog");
    assert.match(await page.locator(".hero-card").innerText(), /8 ta tilni/, "hero should promote eight-language learning");
    for (const label of ["QAYTA XUSH KELIBSIZ 👋", "O‘rganish yo‘li", "Mashqlarni tanlang", "KO‘NIKMALAR", "HISOB"]) {
        assert.equal(await page.getByText(label, { exact: true }).count(), 1, "Uzbek dashboard label should be visible: " + label);
    }
    const dashboardText = await page.locator("body").innerText();
    for (const staleLabel of ["Learning path", "Explore learning", "Account & achievements"]) {
        assert.equal(dashboardText.includes(staleLabel), false, "outdated English dashboard label should not remain: " + staleLabel);
    }

    // Exercise all local learning modules and their navigation using the actual static quiz scripts.
    await page.goto("http://127.0.0.1:4173/puddle-redesign/english-practice.html", { waitUntil: "domcontentloaded" });
    assert.match(await page.locator("#question").innerText(), /She ___ to school every day/);
    await page.locator("#answers button").nth(1).click();
    await page.getByText("To‘g‘ri! 🎉", { exact: false }).waitFor();
    assert.equal(await page.locator("#next").isEnabled(), true);
    await page.locator("#next").click();
    assert.match(await page.locator("#question").innerText(), /They ___ watching TV now/);
    const practiceTutorLink = page.locator('a.primary-btn[href="/"]');
    assert.equal(await practiceTutorLink.count(), 1, "English Practice should provide a direct AI tutor route");
    await practiceTutorLink.click();
    await page.waitForURL("http://127.0.0.1:4173/");
    assert.equal(await page.locator("#teacherOrb").isVisible(), true, "English Practice AI tutor CTA should reach the live Voice AI room");
    await page.goto("http://127.0.0.1:4173/puddle-redesign/english-practice.html", { waitUntil: "domcontentloaded" });

    await page.goto("http://127.0.0.1:4173/puddle-redesign/cefr-assessment.html", { waitUntil: "domcontentloaded" });
    assert.match(await page.locator("body").innerText(), /Rasmiy CEFR sertifikati/);
    const cefrSpeakingLink = page.locator('a.primary-btn[href="/speaking-exam.html"]');
    assert.equal(await cefrSpeakingLink.count(), 1, "CEFR Assessment should link to the real Speaking Exam route");
    await cefrSpeakingLink.click();
    await page.waitForURL("http://127.0.0.1:4173/speaking-exam.html");
    assert.equal(await page.locator("#welcomePanel").isVisible(), true, "CEFR Speaking CTA should reach the Speaking Exam start page");
    await page.goto("http://127.0.0.1:4173/puddle-redesign/cefr-assessment.html", { waitUntil: "domcontentloaded" });
    await page.locator("#answers button").nth(0).click();
    await page.getByText("To‘g‘ri!", { exact: true }).waitFor();
    await page.locator("#next").click();
    assert.match(await page.locator("#question").innerText(), /She ___ coffee every morning/);

    await page.goto("http://127.0.0.1:4173/puddle-redesign/reading.html", { waitUntil: "domcontentloaded" });
    assert.match(await page.locator("body").innerText(), /London is the capital city/);
    await page.locator('#quizChoices [data-answer="1"]').click();
    await page.getByText("To‘g‘ri! Barakalla 🎉", { exact: true }).waitFor();

    await page.goto("http://127.0.0.1:4173/puddle-redesign/listening.html", { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("#playAudio").isVisible(), true);
    await page.locator('[data-answer="yes"]').click();
    await page.getByText("To‘g‘ri! 🎉", { exact: true }).waitFor();

    await page.goto("http://127.0.0.1:4173/puddle-redesign/video-lessons.html", { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator(".list-card a").count(), 4, "AI lesson catalog should contain four lessons");
    await page.locator('.list-card a[href="/?lesson=present-simple"]').click();
    await page.waitForURL(/lesson=present-simple/);
    assert.equal(new URL(page.url()).pathname, "/", "video lesson selection should route into the legacy AI room");
    await page.goto("http://127.0.0.1:4173/puddle-redesign/index.html", { waitUntil: "domcontentloaded" });

    // Exercise the real client-side chat flow against a deterministic API stub.
    await page.locator('.desktop-sidebar [data-view="chat"]').click();
    const chatInput = page.locator("#chatInput");
    await chatInput.fill("I want to practise Present Simple.");
    await page.locator("#sendBtn").click();
    await page.getByText("I want to practise Present Simple.", { exact: true }).waitFor();
    await page.getByText("Mock AI reply: Excellent work!", { exact: true }).waitFor();
    assert.equal(chatRequests, 1, "chat should issue exactly one API request");
    assert.equal(chatAuthorization[0], "", "guest chat should not send an Authorization header");
    assert.equal(await page.locator("#sendBtn").isDisabled(), false, "send button should re-enable after response");
    await page.waitForFunction(() => Object.keys(localStorage).some(k => k.startsWith("th_puddle_chat_v1_guest")));
    const savedChat = await page.evaluate(() => {
        const key = Object.keys(localStorage).find(k => k.startsWith("th_puddle_chat_v1_guest"));
        return key ? JSON.parse(localStorage.getItem(key)) : [];
    });
    assert.ok(savedChat.some(m => m.role === "user" && m.text.includes("Present Simple")), "guest chat should persist user message");
    assert.ok(savedChat.some(m => m.role === "assistant" && m.text.includes("Mock AI reply")), "guest chat should persist AI reply");

    await page.locator("#themeToggle").click();
    assert.equal(await page.locator("body").evaluate(el => el.classList.contains("dark")), true, "theme toggle should activate dark mode");
    assert.equal(await page.evaluate(() => localStorage.getItem("th_theme")), "dark", "theme choice should persist");

    await page.locator("#clearChat").click();
    await page.getByText("Men 8 ta tilni o‘rgata olaman", { exact: false }).waitFor();
    const afterClear = await page.evaluate(() => {
        const key = Object.keys(localStorage).find(k => k.startsWith("th_puddle_chat_v1_guest"));
        return key ? JSON.parse(localStorage.getItem(key)) : [];
    });
    assert.equal(afterClear.some(m => m.text.includes("Present Simple")), false, "clear chat should remove the previous conversation");

    // A stale learner token must be cleared when the real /api/me contract returns authenticated:false.
    await page.evaluate(() => localStorage.setItem("th_auth_token", "smoke-invalid-token"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => localStorage.getItem("th_auth_token") === null);
    await page.waitForFunction(() => document.getElementById("accessTitle")?.textContent === "Mehmon rejimi");
    assert.equal(await page.evaluate(() => localStorage.getItem("th_auth_token")), null,
        "an invalid learner token must be removed after /api/me returns authenticated:false");
    await page.locator('.desktop-sidebar [data-view="chat"]').click();
    await page.locator("#chatInput").fill("Continue as a guest after the session expires.");
    await page.locator("#sendBtn").click();
    await page.getByText("Mock AI reply: Excellent work!", { exact: true }).waitFor();
    assert.equal(chatRequests, 2, "guest fallback after an invalid token should issue a second chat request");
    assert.equal(chatAuthorization[1], "", "guest fallback must not send a stale learner Bearer token");

    // Re-check authenticated API headers and per-user history with a mocked learner session.
    await page.evaluate(() => localStorage.setItem("th_auth_token", "smoke-test-token"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator('.desktop-sidebar [data-view="chat"]').click();
    await page.locator("#chatInput").fill("Please help me practise Past Simple.");
    await page.locator("#sendBtn").click();
    await page.getByText("Mock AI reply: Excellent work!", { exact: true }).waitFor();
    assert.equal(chatRequests, 3, "authenticated chat should issue a third API request after guest fallback");
    assert.equal(chatAuthorization[2], "Bearer smoke-test-token", "authenticated chat must send the learner Bearer token");
    const userChat = await page.evaluate(() => {
        const key = Object.keys(localStorage).find(k => k === "th_puddle_chat_v1_user_smoke-user");
        return key ? JSON.parse(localStorage.getItem(key)) : [];
    });
    assert.ok(userChat.some(m => m.role === "user" && m.text.includes("Past Simple")), "authenticated chat history should be scoped to the returned user id");

    // A temporary /api/me outage must not downgrade an authenticated learner to the shared guest history key.
    await page.evaluate(() => {
        for (const key of Object.keys(localStorage)) {
            if (key.startsWith("th_puddle_chat_v1")) localStorage.removeItem(key);
        }
        localStorage.setItem("th_auth_token", "smoke-test-token");
    });
    meScenario = "unavailable";
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.getElementById("accessTitle")?.textContent === "Ulanish vaqtincha mavjud emas");
    assert.equal(await page.evaluate(() => localStorage.getItem("th_auth_token")), "smoke-test-token",
        "a temporary /api/me failure must preserve the learner token");
    await page.locator('.desktop-sidebar [data-view="chat"]').click();
    await page.locator("#chatInput").fill("Keep this conversation private during an account API outage.");
    await page.locator("#sendBtn").click();
    await page.getByText("Mock AI reply: Excellent work!", { exact: true }).waitFor();
    assert.equal(chatRequests, 4, "chat should remain usable during a temporary account API outage");
    assert.equal(chatAuthorization[3], "Bearer smoke-test-token", "the existing learner token should still be sent to chat");
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("th_puddle_chat_v1")).length), 0,
        "chat messages must not be written to guest or user history while account identity is unknown");

    // A malformed 200 response is also an unknown identity, not a guest session.
    await page.evaluate(() => {
        for (const key of Object.keys(localStorage)) {
            if (key.startsWith("th_puddle_chat_v1")) localStorage.removeItem(key);
        }
    });
    meScenario = "malformed";
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.getElementById("accessTitle")?.textContent === "Ulanish vaqtincha mavjud emas");
    assert.equal(await page.evaluate(() => localStorage.getItem("th_auth_token")), "smoke-test-token",
        "a malformed /api/me response must not clear a potentially valid learner token");
    await page.locator('.desktop-sidebar [data-view="chat"]').click();
    await page.locator("#chatInput").fill("Do not attach my message to a guest identity.");
    await page.locator("#sendBtn").click();
    await page.getByText("Mock AI reply: Excellent work!", { exact: true }).waitFor();
    assert.equal(chatRequests, 5, "chat should remain usable when the account response is malformed");
    assert.equal(chatAuthorization[4], "Bearer smoke-test-token", "malformed account data must not suppress the learner Bearer token");
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("th_puddle_chat_v1")).length), 0,
        "malformed account data must not create shared guest chat history");

    meScenario = "normal";
    await page.evaluate(() => localStorage.removeItem("th_auth_token"));
    await page.goto("http://127.0.0.1:4173/puddle-redesign/index.html", { waitUntil: "domcontentloaded" });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await page.locator(".desktop-sidebar").isVisible(), false, "mobile desktop sidebar should be hidden");
    assert.equal(await page.locator(".bottom-nav").isVisible(), true, "mobile bottom navigation should be visible");
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(mobileOverflow, false, "mobile homepage should not overflow horizontally");

    await page.goto("http://127.0.0.1:4173/puddle-redesign/voice.html", { waitUntil: "domcontentloaded" });
    const iframe = page.locator("iframe");
    assert.equal(await iframe.isVisible(), true, "Voice AI iframe should render");
    assert.match(await iframe.getAttribute("allow"), /microphone/);
    assert.equal(await iframe.getAttribute("title"), "Teacher Hasan AI jonli ovozli ustoz");
    const voice = page.frameLocator("iframe");
    for (const selector of ["#startBtn", "#stopBtn", "#transcript", "#status", "#teacherOrb", "#orbMouth", "#voiceActivityLabel"]) {
        assert.equal(await voice.locator(selector).count(), 1, "Voice AI hook missing: " + selector);
    }

    await page.setViewportSize({ width: 390, height: 640 });
    await page.reload({ waitUntil: "domcontentloaded" });
    const frameBox = await page.locator("iframe").boundingBox();
    assert.ok(frameBox && frameBox.height <= 590 && frameBox.height >= 560,
        "short mobile viewport should size the Voice AI iframe without a forced tall minimum");
    const voiceOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(voiceOverflow, false, "mobile Voice AI wrapper should not overflow horizontally");

    // Verify focused closed-eye orb conversation layout directly (legacy voice page).
    await page.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("#teacherOrb").isVisible(), true, "closed-eye orb should be visible on the focused voice page");
    assert.equal(await page.locator("#startBtn").isVisible(), true, "Start control should remain visible");
    assert.equal(await page.locator("#stopBtn").isVisible(), true, "Stop control should remain visible");
    assert.equal(await page.locator(".topbar").isVisible(), false, "intro/header copy should be hidden");
    assert.equal(await page.locator(".welcome").isVisible(), false, "welcome copy should be hidden");
    assert.equal(await page.locator('a[href="/offer.html"]').count(), 0, "legal offer link should not appear on speaking page");
    assert.equal(await page.locator('a[href="/privacy.html"]').count(), 0, "privacy link should not appear on speaking page");
    // Mocked auth flows: preserve PWA returnTo when switching login/register.
    await page.evaluate(() => localStorage.removeItem("th_auth_token"));
    const pwaReturn = "%2Fpuddle-redesign%2Findex.html";
    await page.goto("http://127.0.0.1:4173/login.html?returnTo=" + pwaReturn, { waitUntil: "domcontentloaded" });
    const registerSwitch = page.locator(".switch a");
    assert.equal(await registerSwitch.getAttribute("href"), "/register.html?returnTo=%2Fpuddle-redesign%2Findex.html", "login-to-register should preserve validated PWA returnTo");
    await registerSwitch.click();
    await page.waitForURL("**/register.html?returnTo=%2Fpuddle-redesign%2Findex.html");
    assert.equal(await page.locator(".switch a").getAttribute("href"), "/login.html?returnTo=%2Fpuddle-redesign%2Findex.html", "register-to-login should preserve validated PWA returnTo");
    await page.locator("#fullName").fill("Smoke Learner");
    await page.locator("#email").fill("smoke@example.test");
    await page.locator("#phone").fill("+998901234567");
    await page.locator("#password").fill("smoke-password");
    await page.locator("#legalConsent").check();
    await page.locator("#registerForm button").click();
    await page.waitForURL("**/puddle-redesign/index.html");
    assert.equal(await page.evaluate(() => localStorage.getItem("th_auth_token")), "smoke-register-token", "registration should store the server token before redirect");
    assert.deepEqual(authRequestBodies.register, { fullName: "Smoke Learner", email: "smoke@example.test", phone: "+998901234567", password: "smoke-password", legalAccepted: true }, "registration should send expected fields and consent");

    await page.evaluate(() => localStorage.removeItem("th_auth_token"));
    await page.goto("http://127.0.0.1:4173/register.html?returnTo=" + pwaReturn, { waitUntil: "domcontentloaded" });
    const backToLogin = page.locator(".switch a");
    assert.equal(await backToLogin.getAttribute("href"), "/login.html?returnTo=%2Fpuddle-redesign%2Findex.html");
    await backToLogin.click();
    await page.waitForURL("**/login.html?returnTo=%2Fpuddle-redesign%2Findex.html");
    await page.locator("#identifier").fill("smoke@example.test");
    await page.locator("#password").fill("smoke-password");
    await page.locator("#loginForm button").click();
    await page.waitForURL("**/puddle-redesign/index.html");
    assert.equal(await page.evaluate(() => localStorage.getItem("th_auth_token")), "smoke-login-token", "login should store the server token before redirect");
    assert.deepEqual(authRequestBodies.login, { identifier: "smoke@example.test", password: "smoke-password" }, "login should send expected fields");

    // Profile must return to the originally requested profile page after login.
    await page.evaluate(() => localStorage.removeItem("th_auth_token"));
    await page.goto("http://127.0.0.1:4173/profile.html?returnTo=%2Fpuddle-redesign%2F", { waitUntil: "domcontentloaded" });
    await page.waitForURL("**/login.html?returnTo=%2Fprofile.html%3FreturnTo%3D%252Fpuddle-redesign%252F");
    assert.equal(
        await page.locator(".switch a").getAttribute("href"),
        "/register.html?returnTo=%2Fprofile.html%3FreturnTo%3D%252Fpuddle-redesign%252F",
        "profile login prompt should preserve the full profile destination when switching to registration"
    );
    await page.locator("#identifier").fill("smoke@example.test");
    await page.locator("#password").fill("smoke-password");
    await page.locator("#loginForm button").click();
    await page.waitForURL("**/profile.html?returnTo=%2Fpuddle-redesign%2F");
    await page.waitForFunction(() => document.querySelector("#pName")?.textContent === "Smoke Learner");
    assert.equal(await page.evaluate(() => localStorage.getItem("th_auth_token")), "smoke-login-token");
    assert.equal(new URL(page.url()).pathname, "/profile.html", "successful login from a profile deep link must return to profile, not dashboard");
    const premiumBuyLink = page.locator('.plans a[href="/payment.html"]');
    assert.equal(await premiumBuyLink.count(), 1, "the profile should expose the real Premium purchase route");
    await premiumBuyLink.click();
    await page.waitForURL("**/payment.html");
    assert.equal(new URL(page.url()).pathname, "/payment.html", "Premium purchase should reach the payment page");
    assert.match(await page.locator("#planPreview").innerText(), /1 oy Premium/);
    await page.goBack();
    await page.waitForURL("**/profile.html?returnTo=%2Fpuddle-redesign%2F");
    await page.locator("#logout").click();
    await page.waitForURL("**/login.html?returnTo=%2Fpuddle-redesign%2F");
    assert.equal(await page.evaluate(() => localStorage.getItem("th_auth_token")), null, "profile logout should clear learner token");
    assert.deepEqual(logoutAuthorization, ["Bearer smoke-login-token"], "profile logout should revoke the current learner session with Bearer auth");

    // Admin browser flow: email/password creates an OTP challenge; only OTP verification sets an HttpOnly cookie.
    await page.evaluate(() => {
        localStorage.removeItem("th_admin_token");
        localStorage.setItem("th_admin_token", "stale-admin-token");
        localStorage.setItem("th_auth_token", "smoke-learner-token");
    });
    await page.goto("http://127.0.0.1:4173/admin", { waitUntil: "domcontentloaded" });
    assert.equal(await page.title(), "Teacher Hasan — Admin", "the Express /admin alias should resolve to the admin page");
    assert.equal(await page.locator("#email").count(), 1, "admin login should request an email address");
    await page.waitForFunction(() => document.querySelector("#loginForm")?.classList.contains("hidden") === false);
    assert.equal(await page.evaluate(() => localStorage.getItem("th_admin_token")), null,
        "legacy admin browser token must be cleared");
    await page.locator("#email").fill("admin@example.test");
    await page.locator("#password").fill("mocked-admin-password");
    await page.locator("#loginForm button[type=submit]").click();
    await page.waitForFunction(() => !document.querySelector("#otpForm")?.classList.contains("hidden"));
    assert.deepEqual(adminRequestBodies.login, { email: "admin@example.test", password: "mocked-admin-password" },
        "admin stage one should send email and password only");
    assert.equal((await page.context().cookies()).filter(cookie => cookie.name === "th_admin_session").length, 0,
        "password verification alone must not create an admin session");
    assert.equal(await page.evaluate(() => localStorage.getItem("th_admin_token")), null,
        "admin OTP challenge must not store a bearer token");

    await page.locator("#otp").fill("000000");
    await page.locator("#otpForm button[type=submit]").click();
    await page.getByText("Kod noto‘g‘ri yoki uning amal qilish muddati tugagan.", { exact: true }).waitFor();
    assert.equal((await page.context().cookies()).filter(cookie => cookie.name === "th_admin_session").length, 0,
        "an invalid OTP must not create an admin session");

    await page.waitForFunction(() => document.querySelector("#resendOtp")?.disabled === false, null, { timeout: 5000 });
    await page.locator("#resendOtp").click();
    await page.getByText("Yangi tasdiqlash kodi yuborildi.", { exact: true }).waitFor();
    assert.deepEqual(adminRequestBodies.resend, { challengeId: "smoke-admin-challenge" },
        "OTP resend should reuse only the active challenge id");

    await page.locator("#otp").fill("123456");
    await page.locator("#otpForm button[type=submit]").click();
    await page.waitForFunction(() => !document.querySelector("#app")?.classList.contains("hidden"));
    await page.waitForFunction(() => document.querySelector("#usersN")?.textContent === "0");
    assert.deepEqual(adminRequestBodies.verify, { challengeId: "smoke-admin-challenge", otp: "123456" },
        "admin stage two should submit the challenge id and six-digit OTP");
    assert.equal(await page.evaluate(() => localStorage.getItem("th_admin_token")), null,
        "admin session must not be stored in localStorage");
    assert.equal(await page.evaluate(() => localStorage.getItem("th_auth_token")), "smoke-learner-token",
        "admin login must not overwrite the learner Bearer token");
    assert.equal(adminApiCookies.length, 5, "admin dashboard should load all five protected read endpoints");
    assert.ok(adminApiCookies.every(item =>
        item.cookie.includes("th_admin_session=smoke-admin-cookie") && item.authorization === ""
    ), "all admin API requests must use the HttpOnly session cookie and no Authorization header");

    const adminMeResponse = await page.evaluate(async () => {
        const response = await fetch("/api/admin/auth/me", { credentials: "same-origin" });
        return { status: response.status, data: await response.json() };
    });
    assert.equal(adminMeResponse.status, 200, "a valid admin cookie should restore the session");
    assert.equal(adminMeResponse.data.admin.email, "admin@example.test");
    assert.ok(adminAuthMeCookies.some(cookie => cookie.includes("th_admin_session=smoke-admin-cookie")),
        "session restoration should send the admin cookie");

    const adminLogoutResponse = page.waitForResponse(response => response.url().endsWith("/api/admin/auth/logout"));
    await page.locator("#logout").click();
    await adminLogoutResponse;
    assert.equal((await page.context().cookies()).filter(cookie => cookie.name === "th_admin_session").length, 0,
        "admin logout should clear the HttpOnly session cookie");
    assert.equal(await page.evaluate(() => localStorage.getItem("th_admin_token")), null,
        "admin logout should leave no legacy admin token");
    assert.equal(await page.evaluate(() => localStorage.getItem("th_auth_token")), "smoke-learner-token",
        "admin logout must not clear the learner token");
    assert.equal(adminLogoutCookies.length, 1);
    assert.ok(adminLogoutCookies[0].cookie.includes("th_admin_session=smoke-admin-cookie") &&
        adminLogoutCookies[0].authorization === "",
        "admin logout should revoke the cookie session without a bearer header");

    const retiredAdminLogin = await page.evaluate(async () => {
        const response = await fetch("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: "admin", password: "legacy-password" })
        });
        return { status: response.status, data: await response.json() };
    });
    assert.equal(retiredAdminLogin.status, 410, "the legacy one-step admin login endpoint must remain retired");
    assert.equal(retiredAdminLogin.data.success, false);

    // External redirect attempts must fail closed to the local root.
    await page.evaluate(() => localStorage.removeItem("th_auth_token"));
    await page.goto("http://127.0.0.1:4173/login.html?returnTo=https%3A%2F%2Fevil.example", { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator(".switch a").getAttribute("href"), "/register.html", "external returnTo should not be forwarded");
    await page.locator("#identifier").fill("smoke@example.test");
    await page.locator("#password").fill("smoke-password");
    await page.locator("#loginForm button").click();
    await page.waitForURL("http://127.0.0.1:4173/");
    assert.equal(new URL(page.url()).origin, "http://127.0.0.1:4173", "external returnTo must never redirect off-origin");
    await page.evaluate(() => localStorage.removeItem("th_auth_token"));

    await page.goto("http://127.0.0.1:4173/login.html", { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator('a[href="/offer.html"]').count(), 1, "offer link should remain on login page");
    assert.equal(await page.locator('a[href="/privacy.html"]').count(), 1, "privacy link should remain on login page");
    await page.goto("http://127.0.0.1:4173/register.html", { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator('a[href="/offer.html"]').count(), 1, "offer consent link should remain on registration page");
    assert.equal(await page.locator('a[href="/privacy.html"]').count(), 1, "privacy consent link should remain on registration page");
    await page.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded" });
    const focusedLayout = await page.evaluate(() => {
        const app = document.querySelector(".app");
        const chat = document.querySelector("#transcript");
        const controls = document.querySelector(".controls");
        return {
            appHeight: app.getBoundingClientRect().height,
            viewportHeight: window.innerHeight,
            chatOverflow: getComputedStyle(chat).overflowY,
            chatHeight: chat.getBoundingClientRect().height,
            controlsBottom: controls.getBoundingClientRect().bottom,
            bodyScroll: document.documentElement.scrollHeight > window.innerHeight
        };
    });
    assert.ok(focusedLayout.appHeight <= focusedLayout.viewportHeight, "voice app should fit the viewport");
    assert.equal(focusedLayout.chatOverflow, "auto", "chat area should scroll independently");
    assert.equal(focusedLayout.bodyScroll, false, "focused page should not create body scrolling");
    await page.evaluate(() => {
        const chat = document.querySelector("#transcript");
        for (let i = 0; i < 12; i++) {
            const bubble = document.createElement("div");
            bubble.className = "chat-bubble " + (i % 2 ? "user" : "assistant");
            bubble.innerHTML = "<span class='chat-bubble-label'>" + (i % 2 ? "Siz" : "Teacher Hasan") + "</span><div class='chat-bubble-text'>Test message " + i + " with overflow content.</div>";
            chat.appendChild(bubble);
        }
    });
    const transcriptAlignment = await page.evaluate(() => ({
        ai: getComputedStyle(document.querySelector(".chat-bubble.assistant")).alignSelf,
        user: getComputedStyle(document.querySelector(".chat-bubble.user")).alignSelf,
        chatScrollHeight: document.querySelector("#transcript").scrollHeight,
        chatClientHeight: document.querySelector("#transcript").clientHeight
    }));
    assert.equal(transcriptAlignment.ai, "flex-start", "AI messages should align left");
    assert.equal(transcriptAlignment.user, "flex-end", "user messages should align right");
    assert.ok(transcriptAlignment.chatScrollHeight > transcriptAlignment.chatClientHeight, "overflowing conversation should be scrollable");


    let speakingUploadAttempts = 0;
    let speakingResultSaveRequests = 0;
    const speakingUploadRequests = [];
    const speakingResultSaveHeaders = [];
    await page.route("**/api/speaking/upload", route => {
        speakingUploadAttempts += 1;
        const headers = route.request().headers();
        speakingUploadRequests.push({
            authorization: headers["authorization"] || "",
            contentType: headers["content-type"] || ""
        });
        if (speakingUploadAttempts === 2) {
            return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ success: false, error: "Temporary Gemini quota limit" }) });
        }
        return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ success: true, evaluated: true, level: "B2", evaluation: {
                transcript: "A clear sample answer.", grammar: 82, vocabulary: 80, fluency: 78,
                pronunciation: 76, overall: 79, feedback: "Good structure.", strengths: ["Clear ideas"],
                improvements: ["Add examples"], correctedVersion: "A clearer sample answer."
            } })
        });
    });
    await page.route("**/api/speaking/results", route => {
        speakingResultSaveRequests += 1;
        const headers = route.request().headers();
        speakingResultSaveHeaders.push({
            authorization: headers["authorization"] || "",
            contentType: headers["content-type"] || ""
        });
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ success: true, saved: true, resultId: "smoke-speaking-result", createdAt: "2026-11-27T00:00:00.000Z" }) });
    });

    await page.evaluate(() => localStorage.setItem("th_auth_token", "smoke-test-token"));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("http://127.0.0.1:4173/speaking-exam.html", { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("#welcomePanel").isVisible(), true, "Speaking Exam start screen should render");
    assert.equal(await page.locator(".exam-layout").evaluate(el => getComputedStyle(el).width), "1440px", "Speaking Exam should use the full desktop viewport");
    await page.locator('[data-level="B2"]').click();
    await page.locator("#startExamBtn").click();
    assert.equal(await page.locator("#examPanel").isVisible(), true, "Speaking Exam should enter the exam flow");
    assert.match(await page.locator("#partBadge").innerText(), /PART 1/);
    assert.match(await page.locator("#questionText").innerText(), /recent development/i);
    assert.equal(await page.locator("#prepBtn").isVisible(), false, "Part 1 should not show preparation timer");

    // A temporary AI quota failure must preserve recorded audio and resume at the failed answer.
    await page.evaluate(() => {
        recordings = [
            { blob: new Blob(["mock answer one"], { type: "audio/webm" }), level: "B2", question: "First mock question", part: 1 },
            { blob: new Blob(["mock answer two"], { type: "audio/webm" }), level: "B2", question: "Second mock question", part: 1 }
        ];
        evaluations = [];
        phase = "exam";
    });
    await page.evaluate(async () => { await submitExam(); });
    await page.waitForFunction(() => document.querySelector("#retryEvaluationBtn")?.hidden === false);
    assert.equal(speakingUploadAttempts, 2, "the first evaluation attempt should upload two answers and encounter the mocked quota error");
    assert.equal(await page.evaluate(() => evaluations.length), 1, "the first successful evaluation should be retained");
    await page.locator("#retryEvaluationBtn").click();
    await page.waitForFunction(() => document.querySelector("#resultLevel")?.textContent.includes("AI taxmini"));
    assert.equal(speakingUploadAttempts, 3, "retry should upload only the previously failed answer, not repeat the successful one");
    assert.equal(await page.evaluate(() => evaluations.length), 2, "retry should complete the remaining evaluation");
    assert.equal(speakingResultSaveRequests, 1, "completed retry should save the result once");
    assert.equal(speakingUploadRequests.length, 3, "each real evaluation attempt should issue one audio upload request");
    assert.ok(speakingUploadRequests.every(item =>
        item.authorization === "Bearer smoke-test-token" && item.contentType.startsWith("multipart/form-data;")
    ), "Speaking audio uploads must use the learner Bearer token and multipart form data");
    assert.deepEqual(speakingResultSaveHeaders, [{
        authorization: "Bearer smoke-test-token", contentType: "application/json"
    }], "Speaking result save must use the learner Bearer token and JSON response contract");
    assert.equal(await page.locator("#retryEvaluationBtn").isHidden(), true, "retry control should hide after successful evaluation");

    await page.goto("http://127.0.0.1:4173/puddle-redesign/index.html", { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("#speakingHistory").count(), 1, "learner profile should include saved Speaking Exam history");

    console.log("Browser smoke passed: Puddle module routes and honest demo labels, learner Bearer-token auth and scoped chat, login/register/logout returnTo, Premium payment route, HttpOnly admin OTP/cookie login-resend-restore-logout, retired legacy admin login, responsive Voice AI iframe/orb/transcript, Speaking Exam multipart AI evaluation/save/retry, and legal-route checks.");
    await context.close();
} finally {
    if (browser) await browser.close();
    await close();
}
