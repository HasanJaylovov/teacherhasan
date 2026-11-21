import fs from 'node:fs';
import path from 'node:path';

const root = path.join(process.cwd(), "public/puddle-redesign");
const publicRoot = path.join(process.cwd(), "public");
const read = file => fs.readFileSync(path.join(process.cwd(), file), "utf8");

const required = [
    "index.html", "styles.css", "app.js", "manifest.json", "sw.js",
    "reading.html", "listening.html", "english-practice.html",
    "cefr-assessment.html", "video-lessons.html", "voice.html", "library-engine.js", "learning-library.css"
];
for (const file of required) {
    const fullPath = path.join(root, file);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).size) {
        throw Error("Missing/empty PWA asset: " + file);
    }
}

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const js = fs.readFileSync(path.join(root, "app.js"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const videoLessons = fs.readFileSync(path.join(root, "video-lessons.html"), "utf8");
const voicePage = fs.readFileSync(path.join(root, "voice.html"), "utf8");
const reading = fs.readFileSync(path.join(root, "reading.html"), "utf8");
const listening = fs.readFileSync(path.join(root, "listening.html"), "utf8");
const practice = fs.readFileSync(path.join(root, "english-practice.html"), "utf8");
const cefr = fs.readFileSync(path.join(root, "cefr-assessment.html"), "utf8");
const legacyVoice = read("public/app.js");
const legacyServer = read("server.js");
const legacyAuth = read("public/auth.js");
const legacyAdmin = read("public/admin.js");
const legacyAdminHtml = read("public/admin.html");
const legacyProfile = read("public/profile.html");
const legacyLogin = read("public/login.html");
const legacyRegister = read("public/register.html");
const speaking = read("public/speaking-exam.html");

const mustHaveIds = [
    "homeView", "chatView", "practiceView", "profileView",
    "chatMessages", "chatForm", "chatInput", "sendBtn",
    "accountAccessCard", "learnerName", "profileName", "profileEmail",
    "accessTitle", "accessBadge", "accessProgress", "menuToggle",
    "themeToggle", "menuLogout", "clearChat", "voiceShortcut"
];
for (const id of mustHaveIds) {
    if (!html.includes('id="' + id + '"')) throw Error("Required PWA UI id missing: " + id);
}
for (const route of ["/api/chat", "/api/me", "/api/auth/logout"]) {
    if (!js.includes(route)) throw Error("PWA API integration missing: " + route);
}
for (const localPage of [
    "./english-practice.html", "./cefr-assessment.html", "./video-lessons.html",
    "./reading.html", "./listening.html"
]) {
    if (!html.includes('href="' + localPage + '"')) throw Error("PWA local link missing: " + localPage);
    if (!fs.existsSync(path.join(root, localPage))) throw Error("PWA local target missing: " + localPage);
}
for (const feature of ["th_auth_token", "Authorization", "data-prompt", "serviceWorker.register"]) {
    if (!js.includes(feature)) throw Error("PWA behavior missing: " + feature);
}
if (/Upper Intermediate.{0,30}75%|75%.{0,30}Upper Intermediate/.test(html)) {
    throw Error("Found demo learner progress on the homepage");
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
if (!manifest.name || !manifest.start_url || !manifest.icons?.length) throw Error("PWA manifest incomplete");
if (!sw.includes("teacherhasan-puddle-v3") || !sw.includes('url.pathname.startsWith("/api/")') ||
    !sw.includes("url.search") || !sw.includes("APP_PATHS.has(url.pathname)")) {
    throw Error("PWA service worker cache scope must exclude API and query routes");
}

// Route compatibility with the existing site pages and Express route.
const routes = [
    { href: "./voice.html", file: "puddle-redesign/voice.html", label: "Voice AI" },
    { href: "/speaking-exam.html", file: "speaking-exam.html", label: "Speaking Exam" },
    { href: "/profile.html?returnTo=%2Fpuddle-redesign%2F", file: "profile.html", label: "Profile" },
    { href: "/offer.html", file: "offer.html", label: "Premium" },
    { href: "/login.html?returnTo=%2Fpuddle-redesign%2F", file: "login.html", label: "Login" },
    { href: "/register.html?returnTo=%2Fpuddle-redesign%2F", file: "register.html", label: "Register" },
    { href: "/admin", file: "admin.html", label: "Admin" }
];
for (const route of routes) {
    if (!html.includes('href="' + route.href + '"')) throw Error("Homepage route link missing: " + route.label);
    if (!fs.existsSync(path.join(publicRoot, route.file))) throw Error("Legacy route file missing: " + route.file);
}
if (!legacyServer.includes('"/admin"') || !legacyServer.includes('"admin.html"')) {
    throw Error("Express admin route does not point to admin.html");
}

// Login/register response contract: both endpoints return success, token, user and access.
for (const endpoint of ["/api/auth/register", "/api/auth/login"]) {
    const start = legacyServer.indexOf('"' + endpoint + '"');
    if (start < 0) throw Error("Legacy auth endpoint missing: " + endpoint);
    const next = legacyServer.indexOf("app.post(", start + endpoint.length);
    const section = legacyServer.slice(start, next < 0 ? start + 5000 : next);
    for (const key of ["success:", "token", "user:", "access:"]) {
        if (!section.includes(key)) throw Error(endpoint + " response missing " + key);
    }
}
for (const endpoint of ["/api/auth/login", "/api/auth/register", "/api/me", "/api/auth/logout"]) {
    if (!legacyAuth.includes(endpoint)) throw Error("Auth client route missing: " + endpoint);
}
if (!legacyAuth.includes('const AUTH_TOKEN_KEY = "th_auth_token"') ||
    !legacyAuth.includes("setAuthToken(data.token)") ||
    !legacyAuth.includes("clearAuthToken()") ||
    !legacyAuth.includes("Authorization")) {
    throw Error("Login/register/profile/logout token behavior incomplete");
}
if (!legacyAuth.includes("getSafeReturnTo") || !legacyAuth.includes("new URL(target, location.origin)") ||
    !legacyAuth.includes("target.startsWith(\"//\")") || !legacyAuth.includes("url.origin === location.origin") || !legacyAuth.includes('"/login.html?returnTo="')) {
    throw Error("Safe returnTo behavior missing from legacy auth flow");
}
if (!js.includes('location.href="./index.html"')) throw Error("PWA logout must return to redesigned home");
if (!legacyProfile.includes('id="profile"') || !legacyProfile.includes('id="logout"')) {
    throw Error("Profile page auth hooks missing");
}
if (!legacyLogin.includes('id="loginForm"') || !legacyRegister.includes('id="registerForm"') ||
    !legacyRegister.includes('id="legalConsent"')) {
    throw Error("Login/register page form hooks missing");
}

// Live Voice AI: verify the client consumes the actual ephemeral-token response.
const liveTokenStart = legacyServer.indexOf('"/api/live-token"');
const speakingApiStart = legacyServer.indexOf('"/api/speaking/upload"');
const liveTokenSection = legacyServer.slice(liveTokenStart, speakingApiStart);
for (const feature of [
    'fetch("/api/live-token"', "client.live.connect", "tokenData.token", "tokenData.model"
]) {
    if (!legacyVoice.includes(feature)) throw Error("Voice AI client integration missing: " + feature);
}
for (const field of ["token:", "model:", "learner:", "access:"]) {
    if (!liveTokenSection.includes(field)) throw Error("Live-token API response missing: " + field);
}

// Speaking Exam is a real upload/evaluation integration, not a static mock.
const chatEndpointStart = legacyServer.indexOf('"/api/chat"', speakingApiStart);
const speakingApiSection = legacyServer.slice(speakingApiStart, chatEndpointStart);
if (!speaking.includes("/api/speaking/upload") || !speaking.includes("data.evaluated") ||
    !speaking.includes("data.evaluation") || !speaking.includes("evaluations.push")) {
    throw Error("Speaking Exam client must require real evaluation data");
}
if (!speakingApiSection.includes("evaluated: true") || !speakingApiSection.includes("evaluation")) {
    throw Error("Speaking Exam server response contract missing");
}

// Video catalog selections now pass a whitelisted lesson context to the live AI room.
const lessonIds = ["present-simple", "past-simple", "present-continuous", "present-perfect"];
for (const lesson of lessonIds) {
    if (!videoLessons.includes("lesson=" + lesson)) throw Error("Video lesson catalog link missing: " + lesson);
    if (!legacyVoice.includes('"' + lesson + '"')) throw Error("Voice AI lesson map missing: " + lesson);
}
for (const feature of ["new URLSearchParams", "selectedVideoLesson", "VIDEO LESSON MODE"]) {
    if (!legacyVoice.includes(feature)) throw Error("Video lesson query integration missing: " + feature);
}
if (!videoLessons.includes("video fayllar mavjudligini anglatmaydi")) {
    throw Error("Video lesson page must disclose that the catalog is not video playback");
}
if (!voicePage.includes('src="/"') || !voicePage.includes('title="Teacher Hasan AI jonli ovozli ustoz"') ||
    !voicePage.includes('aria-label="Ovozli suhbat oynasi"') || !voicePage.includes('loading="eager"') ||
    !voicePage.includes('allow="microphone; autoplay"') || !voicePage.includes('./index.html')) {
    throw Error("Voice AI wrapper must preserve same-origin live client, accessible iframe naming and microphone permissions");
}
if (!voicePage.includes("100dvh - 56px") || !voicePage.includes("min-height:0")) {
    throw Error("Voice AI wrapper must fit short mobile viewports using dynamic viewport units");
}
if ((html.match(/href="\.\/voice\.html"/g) || []).length < 3 || !sw.includes('"./voice.html"')) {
    throw Error("PWA Voice AI navigation or offline shell registration missing");
}
// Voice AI visual redesign must retain every DOM hook consumed by the live client.
const legacyVoiceHtml = read("public/index.html");
for (const id of ["startBtn", "stopBtn", "status", "transcript", "menuButton", "sideMenu", "menuOverlay", "closeMenu"]) {
    if (!legacyVoiceHtml.includes('id="' + id + '"')) throw Error("Legacy Voice AI DOM hook missing: " + id);
}
for (const visual of ["puddle-voice-redesign", "--voice-accent", ".teacher-hero", "#startBtn", "#stopBtn", "#transcript", "@media (max-width: 700px)", "aria-label=\"Ovozli suhbat\"", "role=\"log\"", "aria-live=\"polite\"", "role=\"status\"", ":focus-visible"]) {
    if (!legacyVoiceHtml.includes(visual)) throw Error("Puddle Voice AI visual layer missing: " + visual);
}
for (const liveHook of ["startBtn.addEventListener", "stopBtn.addEventListener", "function startTeacher", "function stopTeacher", 'fetch("/api/live-token"', "client.live.connect", "getUserMedia", "createBufferSource"]) {
    if (!legacyVoice.includes(liveHook)) throw Error("Legacy Voice AI live behavior hook missing: " + liveHook);
}
if (!legacyVoiceHtml.includes('<script type="module" src="/app.js"') && !legacyVoiceHtml.includes('src="/app.js"')) {
    throw Error("Legacy Voice AI client script reference missing");
}

const videoBrandLink = videoLessons.match(/<a class="brand" href="([^"]+)"/);
if (!videoBrandLink || videoBrandLink[1] !== "./index.html") throw Error("Video lesson brand must return to the redesigned PWA");

// Expanded learning library modules: shared engine, generated banks and real interactions.
const libraryEngine = fs.readFileSync(path.join(root, "library-engine.js"), "utf8");
const libraryCss = fs.readFileSync(path.join(root, "learning-library.css"), "utf8");
new Function(libraryEngine);
for (const [page, moduleName] of [
    [practice, "practice"], [cefr, "cefr"], [reading, "reading"],
    [listening, "listening"], [videoLessons, "videos"]
]) {
    if (!page.includes('data-module="' + moduleName + '"') ||
        !page.includes('src="./library-engine.js"') ||
        !page.includes('id="questionCard"') ||
        !page.includes('id="levelFilter"') ||
        !page.includes('id="topicFilter"')) {
        throw Error("Learning module shell or engine integration missing: " + moduleName);
    }
}
for (const feature of [
    "length:1200", "cefr:[...grammar,...reading.map", "speechSynthesis",
    "function renderVideos()", "function answer(", "function finish()",
    "function populateFilters()", "lessonPrev", "lessonNext"
]) {
    if (!libraryEngine.includes(feature)) throw Error("Learning library engine feature missing: " + feature);
}
for (const feature of [".learning-hero", ".library-options", ".lesson-grid", ".lesson-player", ".learning-orb"]) {
    if (!libraryCss.includes(feature)) throw Error("Learning module design component missing: " + feature);
}
if (!reading.includes('data-module="reading"') || !reading.includes('id="passageText"')) {
    throw Error("Reading passage module missing");
}
if (!listening.includes('data-module="listening"') || !listening.includes('id="playScript"') ||
    !libraryEngine.includes('function speak(')) {
    throw Error("Listening playback/check missing");
}
if (!practice.includes("1,200+") || !cefr.includes("3,600+") ||
    !videoLessons.includes("1,200+") || !videoLessons.includes("video fayllar mavjudligini anglatmaydi")) {
    throw Error("Learning bank counts or honest video lesson disclosure missing");
}

// Chat history persistence is account-scoped and identity lookup failure fails closed.
if (!js.includes("CHAT_STORAGE_PREFIX") || !js.includes("user_") || !js.includes("setChatIdentity") || !js.includes("chatIdentityReady") || !js.includes("identityReadyPromise") || !js.includes("await identityReadyPromise") || !js.includes("messagesEl.innerHTML=\"\"") || !js.includes("persistChat()") || !js.includes("restoreChat()") || !js.includes("localStorage.removeItem(CHAT_STORAGE_KEY)") || !js.includes("chatIdentityReady=false;CHAT_STORAGE_KEY=null")) {
    throw Error("Puddle account-scoped chat persistence/clear safety hooks missing");
}
if (!legacyServer.includes("user.id") || !legacyServer.includes("authenticated:")) {
    throw Error("Puddle account chat key must use the actual /api/me identity field");
}

// Admin uses its own token and protected endpoints, separate from learner auth.
if (!legacyAdmin.includes("th_admin_token") || !legacyAdmin.includes("Authorization") ||
    !legacyAdminHtml.includes('id="loginForm"') || !legacyAdminHtml.includes('id="app"')) {
    throw Error("Admin login/session hooks missing");
}
for (const endpoint of [
    "/api/admin/login", "/api/admin/logout", "/api/admin/dashboard",
    "/api/admin/users", "/api/admin/payments", "/api/admin/speaking-results", "/api/admin/settings"
]) {
    if (!legacyAdmin.includes(endpoint) || !legacyServer.includes('"' + endpoint + '"')) {
        throw Error("Admin endpoint compatibility missing: " + endpoint);
}
}
for (const endpoint of [
    "/api/admin/logout", "/api/admin/dashboard", "/api/admin/users",
    "/api/admin/users/:id", "/api/admin/users/:id/premium",
    "/api/admin/payments", "/api/admin/speaking-results", "/api/admin/settings"
]) {
    const start = legacyServer.indexOf('"' + endpoint + '"');
    const section = legacyServer.slice(start, start + 260);
    if (!section.includes("requireAdmin")) throw Error("Admin route is not guarded: " + endpoint);
}

console.log(
    "Puddle smoke passed: " + required.length + " assets, " + mustHaveIds.length +
    " UI hooks, legacy routes, auth tokens, Voice AI, Speaking Exam, lesson query, local modules and admin API guards."
);
