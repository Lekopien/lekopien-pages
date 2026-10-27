// ─────────────────────────────────────────────────────────────
// EDIT HERE: Sarran's details. Leave a field empty ("") to show a
// clearly marked placeholder on the site until the real value is known.
// ─────────────────────────────────────────────────────────────
const SITE = {
  whatsapp: "254711169340",          // international format, no + or spaces
  kndiNumber: "",                    // KNDI registration number, e.g. "KNDI/XXXX"
  degree: "",                        // e.g. "BSc Food, Nutrition & Dietetics"
  university: "",                    // e.g. "University of Nairobi"
  emails: ["mahonyesarran@gmail.com"], // her email addresses; add more separated by commas
  instagram: "honyi_tis",
  prices: {                          // shown on the Services page, e.g. "KES 3,500"
    initial: "",
    program: "",
    mealplan: "",
    caregiver: "",
    corporate: ""
  }
};

const PLACEHOLDER = {
  kndiNumber: "KNDI reg. no. to be added",
  degree: "Degree to be added",
  university: "University to be added"
};

function waLink(text) {
  return "https://wa.me/" + SITE.whatsapp + (text ? "?text=" + encodeURIComponent(text) : "");
}

// Fill [data-fill="key"] with SITE values, or a marked placeholder.
document.querySelectorAll("[data-fill]").forEach((el) => {
  const key = el.dataset.fill;
  const value = key.split(".").reduce((o, k) => (o ? o[k] : ""), SITE);
  if (value) {
    el.textContent = value;
  } else if (key.startsWith("prices.")) {
    el.textContent = "Ask on WhatsApp";
  } else {
    el.textContent = PLACEHOLDER[key] || "to be added";
    el.classList.add("placeholder");
  }
});

// Emails: [data-emails] becomes a list of mailto links.
document.querySelectorAll("[data-emails]").forEach((el) => {
  if (!SITE.emails.length) {
    el.innerHTML = '<span class="placeholder">email to be added</span>';
    return;
  }
  SITE.emails.forEach((address, i) => {
    if (i) el.append(el.tagName === "LI" ? document.createElement("br") : " or ");
    const a = document.createElement("a");
    a.href = "mailto:" + address;
    a.textContent = address;
    el.append(a);
  });
});

// Blog tabs: the dietitian tab shows first; #arbiter opens the chess tab.
document.querySelectorAll(".tabs").forEach((list) => {
  const tabs = [...list.querySelectorAll("[role=tab]")];
  const select = (tab, focus) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", on);
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
    if (focus) tab.focus();
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => {
      select(tab);
      history.replaceState(null, "", tab.id === "tab-chess" ? "#arbiter" : location.pathname + location.search);
    });
    tab.addEventListener("keydown", (e) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (step) select(tabs[(i + step + tabs.length) % tabs.length], true);
    });
  });
  if (location.hash === "#arbiter") select(tabs[1]);
});

// WhatsApp links: [data-wa] or [data-wa="prefilled message"]
document.querySelectorAll("[data-wa]").forEach((a) => {
  a.href = waLink(a.dataset.wa || "Hi Sarran, I found you on your website and would like to book a consultation.");
  a.target = "_blank";
  a.rel = "noopener";
});

// Portrait: show a labelled placeholder if the image is missing.
document.querySelectorAll(".photo img").forEach((img) => {
  const fail = () => img.closest(".photo").classList.add("missing");
  if (img.complete && img.naturalWidth === 0) fail();
  img.addEventListener("error", fail);
});

// Booking form → opens WhatsApp with the request prefilled.
const form = document.querySelector("form.book");
if (form) {
  const params = new URLSearchParams(location.search);
  if (params.get("service")) form.service.value = params.get("service");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const f = new FormData(form);
    const lines = [
      "Hi Sarran, I'd like to book a consultation.",
      "",
      "Name: " + f.get("name"),
      "Service: " + f.get("service"),
      "Format: " + f.get("format"),
      "Preferred day: " + (f.get("day") || "Flexible"),
      "Preferred time: " + f.get("time"),
      f.get("goal") ? "Main goal: " + f.get("goal") : null,
      "",
      "I have read the Privacy Policy & Telehealth Consent and agree to it."
    ].filter((l) => l !== null);
    window.open(waLink(lines.join("\n")), "_blank", "noopener");
  });
}

const year = document.getElementById("year");
if (year) year.textContent = new Date().getFullYear();
