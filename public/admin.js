const $ = id => document.getElementById(id);
try { localStorage.removeItem("th_admin_token"); } catch { /* Storage may be disabled. */ }
let challengeId = null;
let allUsers = [];
let resendInterval = null;

function showError(message) {
    $("error").textContent = message;
    $("error").style.display = "block";
}
function clearError() {
    $("error").textContent = "";
    $("error").style.display = "none";
}
function showLoginStage(stage) {
    $("login").classList.remove("hidden");
    $("app").classList.add("hidden");
    $("loginForm").classList.toggle("hidden", stage !== "credentials");
    $("otpForm").classList.toggle("hidden", stage !== "otp");
}
async function api(url, opt = {}) {
    const headers = { "Content-Type": "application/json", ...(opt.headers || {}) };
    const response = await fetch(url, { ...opt, headers, credentials: "same-origin" });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
        logout(false);
        throw new Error("Admin sessiyasi tugagan. Qayta kiring.");
    }
    if (!response.ok) throw new Error(data.error || "Xatolik yuz berdi.");
    return data;
}
const esc = x => String(x ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));
const money = x => Number(x || 0).toLocaleString("uz-UZ") + " so‘m";
function pill(s) {
    const c = ["success", "premium", "trial"].includes(s) ? "ok" :
        ["error", "failed", "blocked"].includes(s) ? "bad" : "";
    return `<span class="pill ${c}">${esc(s || "—")}</span>`;
}
function table(headers, rows) {
    if (!rows.length) return '<div class="empty">Hozircha ma’lumot yo‘q.</div>';
    return `<div class="tablewrap"><table class="table"><thead><tr>${headers.map(x => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}
function startResendCountdown(seconds = 60) {
    if (resendInterval) clearInterval(resendInterval);
    let remaining = Math.max(1, Number(seconds) || 60);
    const button = $("resendOtp");
    button.disabled = true;
    button.textContent = `Qayta yuborish (${remaining})`;
    resendInterval = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
            clearInterval(resendInterval);
            resendInterval = null;
            button.disabled = false;
            button.textContent = "Kodni qayta yuborish";
        } else button.textContent = `Qayta yuborish (${remaining})`;
    }, 1000);
}
async function login(event) {
    event.preventDefault();
    clearError();
    const button = $("loginForm").querySelector('button[type="submit"]');
    button.disabled = true;
    try {
        const response = await fetch("/api/admin/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ email: $("email").value.trim(), password: $("password").value })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Kirish xatosi.");
        challengeId = data.challengeId;
        $("password").value = "";
        $("otp").value = "";
        $("otpHint").textContent = data.message || "Tasdiqlash kodi emailingizga yuborildi.";
        showLoginStage("otp");
        startResendCountdown(data.resendAfterSeconds || 60);
        $("otp").focus();
    } catch (error) {
        showError(error.message);
    } finally {
        button.disabled = false;
    }
}
async function verifyOtp(event) {
    event.preventDefault();
    clearError();
    if (!challengeId) {
        showLoginStage("credentials");
        showError("Kirish muddati tugadi. Qayta urinib ko‘ring.");
        return;
    }
    const button = $("otpForm").querySelector('button[type="submit"]');
    button.disabled = true;
    try {
        const response = await fetch("/api/admin/auth/verify-otp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ challengeId, otp: $("otp").value.trim() })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Tasdiqlash kodi noto‘g‘ri.");
        challengeId = null;
        if (resendInterval) clearInterval(resendInterval);
        $("login").classList.add("hidden");
        $("app").classList.remove("hidden");
        await load();
    } catch (error) {
        showError(error.message);
    } finally {
        button.disabled = false;
    }
}
async function resendOtp() {
    clearError();
    if (!challengeId) return;
    $("resendOtp").disabled = true;
    try {
        const data = await api("/api/admin/auth/resend-otp", {
            method: "POST", body: JSON.stringify({ challengeId })
        });
        $("otpHint").textContent = data.message || "Yangi kod yuborildi.";
        $("otp").value = "";
        startResendCountdown(data.resendAfterSeconds || 60);
    } catch (error) {
        showError(error.message);
        $("resendOtp").disabled = false;
    }
}
async function load() {
    const data = await api("/api/admin/dashboard");
    const stats = data.stats;
    $("usersN").textContent = stats.users;
    $("premiumN").textContent = stats.premium;
    $("trialN").textContent = stats.trial;
    $("blockedN").textContent = stats.blocked;
    $("paymentsN").textContent = stats.payments;
    $("revenueN").textContent = money(stats.revenue);
    $("recentPayments").innerHTML = table(["User", "Tarif", "Summa", "Status"],
        (data.recentPayments || []).map(p => `<tr><td>${esc(p.userName || p.userId)}</td><td>${esc(p.plan)}</td><td>${money(p.amount)}</td><td>${pill(p.status)}</td></tr>`));
    $("recentUsers").innerHTML = table(["Ism", "Aloqa", "Holat", "Muddat"],
        (data.recentUsers || []).map(u => `<tr><td>${esc(u.fullName)}</td><td>${esc(u.email || u.phone || "—")}</td><td>${u.blocked ? pill("blocked") : pill(u.subscriptionStatus || "trial")}</td><td>${esc(u.expiresAt || u.trialUntil || "—")}</td></tr>`));
    await Promise.all([loadUsers(), loadPayments(), loadSpeaking(), loadSettings()]);
}
async function loadUsers() {
    const data = await api("/api/admin/users");
    allUsers = data.users || [];
    renderUsers(allUsers);
}
function renderUsers(list) {
    $("usersTable").innerHTML = table(["Ism", "Aloqa", "Obuna", "Muddat", "Amal"], list.map(u =>
        `<tr><td>${esc(u.fullName)}</td><td>${esc(u.email || u.phone || "—")}</td><td>${u.blocked ? pill("blocked") : pill(u.subscriptionStatus || "trial")}</td><td>${esc(u.expiresAt || u.trialUntil || "—")}</td><td><div class="user-actions"><button class="action" onclick="blockUser('${esc(u.id)}',${!u.blocked})">${u.blocked ? "Unblock" : "Block"}</button><select id="premiumMonths-${esc(u.id)}" class="premium-select"><option value="1">1 oy bepul</option><option value="2">2 oy bepul</option><option value="3">3 oy bepul</option></select><button class="action premium-action" onclick="grantPremium('${esc(u.id)}')">⭐ Premium berish</button></div></td></tr>`));
}
async function blockUser(id, blocked) {
    await api("/api/admin/users/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify({ blocked }) });
    await loadUsers();
    await load();
}
async function grantPremium(id) {
    const select = $("premiumMonths-" + id);
    const months = Number(select?.value || 1);
    if (![1, 2, 3].includes(months)) return;
    if (!confirm(`${months} oy premiumni bu foydalanuvchiga bepul berasizmi?`)) return;
    try {
        await api("/api/admin/users/" + encodeURIComponent(id) + "/premium", {
            method: "POST", body: JSON.stringify({ months })
        });
        alert(`Premium ${months} oyga bepul faollashtirildi.`);
        await loadUsers();
        await load();
    } catch (error) { alert(error.message); }
}
async function loadPayments() {
    const data = await api("/api/admin/payments");
    $("paymentsTable").innerHTML = table(["Invoice", "User", "Tarif", "Summa", "Method", "Status", "Sana"],
        (data.payments || []).map(p => `<tr><td>${esc(p.invoiceId || "—")}</td><td>${esc(p.userName || p.userId || "—")}</td><td>${esc(p.plan || "—")}</td><td>${money(p.amount)}</td><td>${esc(p.paymentMethod || "—")}</td><td>${pill(p.status)}</td><td>${esc(p.createdAt || "—")}</td></tr>`));
}
async function loadSpeaking() {
    const data = await api("/api/admin/speaking-results");
    $("speakingTable").innerHTML = table(["User", "CEFR", "Grammar", "Vocabulary", "Fluency", "Pronunciation", "Sana"],
        (data.results || []).map(r => `<tr><td>${esc(r.userName || r.userId || "—")}</td><td><b>${esc(r.cefr || "—")}</b></td><td>${esc(r.grammar ?? "—")}</td><td>${esc(r.vocabulary ?? "—")}</td><td>${esc(r.fluency ?? "—")}</td><td>${esc(r.pronunciation ?? "—")}</td><td>${esc(r.createdAt || "—")}</td></tr>`));
}
async function loadSettings() {
    const data = await api("/api/admin/settings");
    const settings = data.settings;
    $("settingsBox").innerHTML = `<div class="cards"><div class="card"><span>MEHMON</span><b>${settings.guestMinutes} daqiqa</b></div><div class="card"><span>TRIAL</span><b>${settings.trialDays} kun</b></div><div class="card"><span>1 OY</span><b>${money(settings.plans.oneMonth)}</b></div><div class="card"><span>2 OY</span><b>${money(settings.plans.twoMonths)}</b></div><div class="card"><span>3 OY</span><b>${money(settings.plans.threeMonths)}</b></div></div><div class="box"><div class="muted">Hozircha qiymatlar Render Environment Variables orqali olinadi. Multicard ulanganidan keyin payment/subscription boshqaruvi shu yerga to‘liq ulanadi.</div></div>`;
}
async function logout(remote = true) {
    if (remote) {
        await fetch("/api/admin/auth/logout", {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json" }
        }).catch(() => {});
    }
    challengeId = null;
    if (resendInterval) clearInterval(resendInterval);
    resendInterval = null;
    $("password").value = "";
    $("otp").value = "";
    clearError();
    showLoginStage("credentials");
}
async function restoreSession() {
    try {
        await api("/api/admin/auth/me");
        $("login").classList.add("hidden");
        $("app").classList.remove("hidden");
        await load();
    } catch {
        showLoginStage("credentials");
    }
}
document.addEventListener("DOMContentLoaded", () => {
    $("loginForm").addEventListener("submit", login);
    $("otpForm").addEventListener("submit", verifyOtp);
    $("resendOtp").addEventListener("click", resendOtp);
    $("backToLogin").addEventListener("click", () => {
        challengeId = null;
        if (resendInterval) clearInterval(resendInterval);
        showLoginStage("credentials");
        clearError();
    });
    $("logout").addEventListener("click", () => logout(true));
    document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => {
        document.querySelectorAll("[data-view]").forEach(item => item.classList.remove("active"));
        button.classList.add("active");
        document.querySelectorAll(".view").forEach(view => view.classList.remove("active"));
        $(button.dataset.view).classList.add("active");
        $("title").textContent = button.textContent.trim();
    }));
    $("search").addEventListener("input", () => {
        const query = $("search").value.toLowerCase();
        renderUsers(allUsers.filter(user => JSON.stringify(user).toLowerCase().includes(query)));
    });
    restoreSession();
});
