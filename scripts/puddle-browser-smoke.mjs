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

    await page.route("**/api/me", route => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ authenticated: false })
    }));
    await page.route("**/api/chat", route => {
        chatRequests += 1;
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
    assert.equal(await page.locator(".desktop-sidebar").isVisible(), true, "desktop sidebar should be visible");
    assert.equal(await page.locator(".bottom-nav").isVisible(), false, "desktop bottom navigation should be hidden");
    assert.equal(await page.locator(".hero-card").count(), 1, "home hero should render");
    assert.equal(await page.locator(".topbar").locator(":scope > .brand").count(), 1, "Teacher Hasan AI brand should be anchored in the top bar");
    assert.equal(await page.locator(".topbar").evaluate(el => el.firstElementChild.classList.contains("brand")), true, "brand should be the first top-left header item");

    // Check the new 1,000+ learning libraries and their interactions.
    await page.goto("http://127.0.0.1:4173/puddle-redesign/english-practice.html", { waitUntil: "domcontentloaded" });
    assert.match(await page.locator("#bankCount").innerText(), /1,200/);
    assert.equal(await page.locator("#options .library-option").count(), 4, "Practice should render four answer options");
    await page.locator("#options .library-option").first().click();
    assert.equal(await page.locator("#nextButton").isDisabled(), false, "Practice should unlock next after an answer");
    await page.locator("#nextButton").click();
    assert.match(await page.locator("#positionLabel").innerText(), /2 \/ 20/, "Practice should run a manageable 20-question session");

    await page.goto("http://127.0.0.1:4173/puddle-redesign/cefr-assessment.html", { waitUntil: "domcontentloaded" });
    assert.match(await page.locator("#bankCount").innerText(), /3,600/);
    await page.locator("#levelFilter").selectOption("B2");
    assert.equal(await page.locator("#options .library-option").count(), 4, "CEFR bank should filter by level");

    await page.goto("http://127.0.0.1:4173/puddle-redesign/reading.html", { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("#passagePanel").isVisible(), true, "Reading should show a passage");
    assert.ok((await page.locator("#passageText").innerText()).length > 100, "Reading passage should contain learning text");

    await page.goto("http://127.0.0.1:4173/puddle-redesign/listening.html", { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("#playScript").isVisible(), true, "Listening should expose audio playback");
    assert.ok((await page.locator("#passageText").innerText()).length > 80, "Listening script should be populated");

    await page.goto("http://127.0.0.1:4173/puddle-redesign/video-lessons.html", { waitUntil: "domcontentloaded" });
    assert.match(await page.locator("#bankCount").innerText(), /1,200/);
    assert.equal(await page.locator(".lesson-card").count(), 60, "Video lesson library should render its first catalog page");
    await page.locator("#lessonNext").click();
    assert.match(await page.locator("#lessonPager").innerText(), /Sahifa 2/);
    await page.locator(".lesson-card").first().click();
    assert.equal(await page.locator("#lessonPlayer").isVisible(), true, "Lesson player should open from a catalog card");
    assert.ok((await page.locator("#playerExplain").innerText()).length > 60, "Lesson player should show a real lesson explanation");

    await page.goto("http://127.0.0.1:4173/puddle-redesign/index.html", { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator(".language-chip").count(), 8, "homepage should list all eight supported learning languages");
    assert.deepEqual(await page.locator(".language-chip b").allTextContents(), ["Uzbek", "English", "German", "Arabic", "Russian", "Turkish", "Korean", "Chinese"], "language cards should match the supported eight-language catalog");
    assert.match(await page.locator(".hero-card").innerText(), /8 ta tilni/, "hero should promote eight-language learning");

    // Exercise the real client-side chat flow against a deterministic API stub.
    await page.locator('.desktop-sidebar [data-view="chat"]').click();
    const chatInput = page.locator("#chatInput");
    await chatInput.fill("I want to practise Present Simple.");
    await page.locator("#sendBtn").click();
    await page.getByText("I want to practise Present Simple.", { exact: true }).waitFor();
    await page.getByText("Mock AI reply: Excellent work!", { exact: true }).waitFor();
    assert.equal(chatRequests, 1, "chat should issue exactly one API request");
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
    for (const selector of ["#startBtn", "#stopBtn", "#transcript", "#status", "#teacherOrb", "#organicCanvas", "#bottomWaveCanvas", "#voiceActivityLabel"]) {
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
    assert.equal(await page.locator("#stopBtn").count(), 1, "Stop control should remain available and appear after a session starts");
    assert.equal(await page.locator(".topbar").isVisible(), false, "intro/header copy should be hidden");
    assert.equal(await page.locator(".welcome").isVisible(), false, "welcome copy should be hidden");
    assert.equal(await page.locator('a[href="/offer.html"]').count(), 0, "legal offer link should not appear on speaking page");
    assert.equal(await page.locator('a[href="/privacy.html"]').count(), 0, "privacy link should not appear on speaking page");
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

    console.log("Browser smoke passed: eight-language discovery and first-chat greeting, desktop/mobile navigation, chat API interaction and persistence, clear chat, theme persistence, responsive layout, Voice AI iframe, orb focus layout, independent transcript scrolling, left/right speaker bubbles, and legacy controls.");
    await context.close();
} finally {
    if (browser) await browser.close();
    await close();
}
