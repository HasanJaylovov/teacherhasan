const AUTH_TOKEN_KEY = "th_auth_token";

function getAuthToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

function setAuthToken(token) {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
}

function clearAuthToken() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
}

async function api(url, options = {}) {
    const token = getAuthToken();
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
        credentials: "same-origin",
        ...options,
        headers
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || "Xatolik");
    }

    return data;
}

function showError(message) {
    const element = document.getElementById("error");
    if (element) {
        element.textContent = message;
        element.style.display = "block";
    }
}

function byId(id) {
    return document.getElementById(id);
}

document.addEventListener("DOMContentLoaded", () => {
    const loginForm = byId("loginForm");

    if (loginForm) {
        loginForm.onsubmit = async (event) => {
            event.preventDefault();

            try {
                const data = await api("/api/auth/login", {
                    method: "POST",
                    body: JSON.stringify({
                        identifier: byId("identifier").value,
                        password: byId("password").value
                    })
                });

                // IMPORTANT: the server uses Bearer-token sessions.
                // The old version received the token but discarded it,
                // so /profile.html immediately considered the user logged out.
                setAuthToken(data.token);
                location.href = "/profile.html";
            } catch (error) {
                showError(error.message);
            }
        };
    }

    const registerForm = byId("registerForm");

    if (registerForm) {
        registerForm.onsubmit = async (event) => {
            event.preventDefault();

            try {
                const data = await api("/api/auth/register", {
                    method: "POST",
                    body: JSON.stringify({
                        fullName: byId("fullName").value,
                        email: byId("email").value,
                        phone: byId("phone").value,
                        password: byId("password").value
                    })
                });

                setAuthToken(data.token);
                location.href = "/profile.html";
            } catch (error) {
                showError(error.message);
            }
        };
    }

    if (byId("profile")) {
        (async () => {
            try {
                if (!getAuthToken()) {
                    return location.href = "/login.html";
                }

                const data = await api("/api/me");

                if (!data.authenticated) {
                    clearAuthToken();
                    return location.href = "/login.html";
                }

                const user = data.user;
                const access = data.access;
                const status = byId("pStatus");

                byId("pName").textContent = user.fullName;
                byId("pEmail").textContent = user.email || user.phone || "Teacher Hasan o‘quvchisi";

                if (access.mode === "premium") {
                    status.textContent = "⭐ PREMIUM";
                    byId("pMode").textContent = "Premium obuna";
                    byId("pPlan").textContent = access.plan
                        ? `Faol tarif: ${access.plan}`
                        : "Premium foydalanish faol";
                    byId("pProgress").style.width = "100%";
                } else if (access.mode === "trial") {
                    status.textContent = "🎁 3 KUNLIK TRIAL";
                    byId("pMode").textContent = "Bepul sinov";
                    byId("pPlan").textContent = "3 kunlik bepul foydalanish faol";
                    byId("pProgress").style.width = "70%";
                } else if (access.mode === "blocked") {
                    status.textContent = "⛔ BLOKLANGAN";
                    byId("pMode").textContent = "Akkaunt bloklangan";
                    byId("pPlan").textContent = "Admin bilan bog‘laning";
                    byId("pProgress").style.width = "0%";
                } else {
                    status.textContent = "⌛ MUDDAT TUGAGAN";
                    byId("pMode").textContent = "Premium/trial tugagan";
                    byId("pPlan").textContent = "Premium tarifni faollashtiring";
                    byId("pProgress").style.width = "0%";
                }

                byId("pUntil").textContent = access.until
                    ? new Date(access.until).toLocaleString("uz-UZ")
                    : "—";
            } catch (error) {
                clearAuthToken();
                location.href = "/login.html";
            }
        })();
    }

    const logout = byId("logout");

    if (logout) {
        logout.onclick = async () => {
            try {
                await api("/api/auth/logout", { method: "POST" });
            } catch (_) {
                // Even if the server session has already expired, clear local auth.
            } finally {
                clearAuthToken();
                location.href = "/login.html";
            }
        };
    }
});
