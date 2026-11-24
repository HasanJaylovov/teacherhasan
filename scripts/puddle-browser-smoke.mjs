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

    await page.route("**/api/me", route => {
        const authorization = route.request().headers()["authorization"] || "";
        const data = ["Bearer smoke-test-token", "Bearer smoke-login-token"].includes(authorization)
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
    const adminApiAuthorization = [];
    const adminLogoutAuthorization = [];
    await page.route("**/api/admin/login", route => {
        adminRequestBodies.login = route.request().postDataJSON();
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, token: "smoke-admin-token", admin: { username: "admin" } }) });
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
            adminApiAuthorization.push({ endpoint, authorization: route.request().headers()["authorization"] || "" });
            return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
        });
    }
    await page.route("**/api/admin/logout", route => {
        adminLogoutAuthorization.push(route.request().headers()["authorization"] || "");
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
    });

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

    // Re-check authenticated API headers and per-user history with a mocked learner session.
    await page.evaluate(() => localStorage.setItem("th_auth_token", "smoke-test-token"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator('.desktop-sidebar [data-view="chat"]').click();
    await page.locator("#chatInput").fill("Please help me practise Past Simple.");
    await page.locator("#sendBtn").click();
    await page.getByText("Mock AI reply: Excellent work!", { exact: true }).waitFor();
    assert.equal(chatRequests, 2, "authenticated chat should issue a second API request");
    assert.equal(chatAuthorization[1], "Bearer smoke-test-token", "authenticated chat must send the learner Bearer token");
    const userChat = await page.evaluate(() => {
        const key = Object.keys(localStorage).find(k => k === "th_puddle_chat_v1_user_smoke-user");
        return key ? JSON.parse(localStorage.getItem(key)) : [];
    });
    assert.ok(userChat.some(m => m.role === "user" && m.text.includes("Past Simple")), "authenticated chat history should be scoped to the returned user id");
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
    await page.locator("#logout").click();
    await page.waitForURL("**/login.html?returnTo=%2Fpuddle-redesign%2F");
    assert.equal(await page.evaluate(() => localStorage.getItem("th_auth_token")), null, "profile logout should clear learner token");
    assert.deepEqual(logoutAuthorization, ["Bearer smoke-login-token"], "profile logout should revoke the current learner session with Bearer auth");

    // Admin browser flow uses a separate token namespace and protected API Bearer headers.
    await page.evaluate(() => {
        localStorage.removeItem("th_admin_token");
        localStorage.setItem("th_auth_token", "smoke-learner-token");
    });
    await page.goto("http://127.0.0.1:4173/admin.html", { waitUntil: "domcontentloaded" });
    await page.locator("#username").fill("admin");
    await page.locator("#password").fill("mocked-admin-password");
    await page.locator("#loginForm button").click();
    await page.waitForFunction(() => !document.querySelector("#app")?.classList.contains("hidden"));
    await page.waitForFunction(() => document.querySelector("#usersN")?.textContent === "0");
    assert.deepEqual(adminRequestBodies.login, { username: "admin", password: "mocked-admin-password" });
    assert.equal(await page.evaluate(() => localStorage.getItem("th_admin_token")), "smoke-admin-token");
    assert.equal(await page.evaluate(() => localStorage.getItem("th_auth_token")), "smoke-learner-token",
        "admin login must not overwrite the learner token");
    assert.equal(adminApiAuthorization.length, 5, "admin dashboard should load all five protected read endpoints");
    assert.ok(adminApiAuthorization.every(item => item.authorization === "Bearer smoke-admin-token"),
        "all admin API requests must use the dedicated admin Bearer token");
    const adminLogoutResponse = page.waitForResponse(response => response.url().endsWith("/api/admin/logout"));
    await page.locator("#logout").click();
    await adminLogoutResponse;
    assert.equal(await page.evaluate(() => localStorage.getItem("th_admin_token")), null,
        "admin logout should clear the admin token");
    assert.equal(await page.evaluate(() => localStorage.getItem("th_auth_token")), "smoke-learner-token",
        "admin logout must not clear the learner token");
    assert.deepEqual(adminLogoutAuthorization, ["Bearer smoke-admin-token"],
        "admin logout should revoke the dedicated admin session");

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
    await page.goto("http://127.0.0.1:4173/puddle-redesign/index.html", { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("#speakingHistory").count(), 1, "learner profile should include saved Speaking Exam history");

    console.log("Browser smoke passed: Uzbek dashboard labels, local learning module interactions and routes, AI lesson catalog routing, guest/authenticated chat headers and scoped history, login/register returnTo continuity, mocked auth token storage, external redirect blocking, clear chat, theme persistence, responsive desktop/mobile layout, Voice AI iframe/orb/transcript, Speaking Exam screen, and legal-route checks.");
    await context.close();
} finally {
    if (browser) await browser.close();
    await close();
}
