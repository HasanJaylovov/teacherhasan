const TOKEN_KEY = "th_auth_token";
const prices = {1:35000,2:55000,3:99000};

function showError(message) {
  const el = document.getElementById("error");
  if (el) { el.textContent = message; el.style.display = "block"; }
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("payBtn");
  const consent = document.getElementById("legalConsent");
  const months = document.getElementById("months");
  const result = document.getElementById("result");

  if (!localStorage.getItem(TOKEN_KEY)) {
    location.href = "/login.html";
    return;
  }

  btn.addEventListener("click", async () => {
    showError("");
    result.textContent = "";

    if (!consent.checked) {
      showError("Davom etish uchun Ommaviy oferta va Maxfiylik siyosatini qabul qiling.");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Yuklanmoqda...";

    try {
      const response = await fetch("/api/payment/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + localStorage.getItem(TOKEN_KEY)
        },
        body: JSON.stringify({
          months: Number(months.value),
          legalAccepted: true
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "To‘lovni boshlashda xato.");

      result.innerHTML = "<b>Buyurtma yaratildi.</b><br>Invoice: " +
        (data.invoiceId || "—") + "<br>" +
        "Summa: " + Number(data.amount || 0).toLocaleString("uz-UZ") +
        " so‘m<br><small>To‘lov provayderi API hali ulanmagan bo‘lsa, bu sahifada faqat buyurtma yaratiladi.</small>";
    } catch (error) {
      showError(error.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "To‘lovni boshlash →";
    }
  });
});
