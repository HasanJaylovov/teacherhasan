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

    await page.route("**/api/me", route => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ authenticated: false })
    }));
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
    for (const selector of ["#startBtn", "#stopBtn", "#transcript", "#status"]) {
        assert.equal(await voice.locator(selector).count(), 1, "Voice AI hook missing: " + selector);
    }

    await page.setViewportSize({ width: 390, height: 640 });
    await page.reload({ waitUntil: "domcontentloaded" });
    const frameBox = await page.locator("iframe").boundingBox();
    assert.ok(frameBox && frameBox.height <= 590 && frameBox.height >= 560,
        "short mobile viewport should size the Voice AI iframe without a forced tall minimum");
    const voiceOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(voiceOverflow, false, "mobile Voice AI wrapper should not overflow horizontally");

    console.log("Browser smoke passed: desktop sidebar, mobile navigation, no horizontal overflow, Voice AI iframe, microphone permission and live-client DOM hooks.");
    await context.close();
} finally {
    if (browser) await browser.close();
    await close();
}
