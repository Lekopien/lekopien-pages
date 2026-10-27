// Invoice generator UI: dashboard (#/), editor with live preview (#/edit/<id>), settings (#/settings).
import { newInvoice, templates } from "./defaults.js";
import { fmt, totals, dueDate, liveStatus, longDate } from "./money.js";
import { renderDocument, esc, scheduleRows } from "./preview.js";
import { db, load, save, replaceAll, onSyncChange, syncState } from "./store.js";

const app = document.getElementById("app");
const STATUS_LABEL = { draft: "Draft", sent: "Sent", "part-paid": "Part-paid", overdue: "Overdue", paid: "Paid", cancelled: "Cancelled" };
const SYNC_LABEL = { local: "Saved in this browser", synced: "Saved · synced", saving: "Saving…", error: "Sync failed · saved in this browser" };
let current = null; // invoice or settings object the open form edits
let filter = "all", query = "";

// ---------- small helpers ----------
const getPath = (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj);
function setPath(obj, path, value) {
  const keys = path.split("."), last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = value;
}
const badge = (st) => `<span class="badge b-${st}">${STATUS_LABEL[st]}</span>`;
const money = (n) => `${esc(db.settings.currency)} ${fmt(n)}`;

function field(label, path, value, { type = "text", wide = false, area = false, rows = 3, step, placeholder = "" } = {}) {
  const ph = placeholder ? ` placeholder="${esc(placeholder)}"` : "";
  const dt = type === "number" ? ` data-type="num"${step ? ` step="${step}"` : ""}` : "";
  const input = area
    ? `<textarea data-bind="${path}" rows="${rows}"${ph}>${esc(value)}</textarea>`
    : `<input type="${type}" data-bind="${path}" value="${esc(value)}"${dt}${ph}>`;
  return `<label class="f${wide ? " wide" : ""}"><span>${label}</span>${input}</label>`;
}
const check = (label, path, on) => `<label class="chk"><input type="checkbox" data-bind="${path}" data-type="bool"${on ? " checked" : ""}> ${label}</label>`;
const rowTools = (list, i, n) => `<div class="tools">
  <button type="button" class="ic" data-act="up" data-list="${list}" data-i="${i}" ${i ? "" : "disabled"} title="Move up">↑</button>
  <button type="button" class="ic" data-act="down" data-list="${list}" data-i="${i}" ${i < n - 1 ? "" : "disabled"} title="Move down">↓</button>
  <button type="button" class="ic del" data-act="remove" data-list="${list}" data-i="${i}" title="Remove">✕</button></div>`;
const addBtn = (list, label) => `<button type="button" class="btn ghost sm" data-act="add" data-list="${list}">+ ${label}</button>`;

/** A list of plain sentences (deliverables, exclusions, terms, clauses). */
function lines(list, arr, label, rows = 2) {
  return `<div class="lines">${arr.map((v, i) => `<div class="line-row"><textarea data-bind="${list}.${i}" rows="${rows}">${esc(v)}</textarea>${rowTools(list, i, arr.length)}</div>`).join("")}${addBtn(list, label)}</div>`;
}

function nextRef(items) {
  const m = items.at(-1)?.ref?.match(/^(.*?)(\d+)$/);
  return m ? m[1] + String(Number(m[2]) + 1).padStart(m[2].length, "0") : `IT-${String(items.length + 1).padStart(2, "0")}`;
}
function blank(list, arr) {
  const key = list.split(".").pop();
  if (key === "items") return { ref: nextRef(arr), title: "", desc: "", qty: 1, rate: 0 };
  if (key === "schedule") return { label: "Milestone", percent: 0, due: "" };
  if (key === "payments") return { date: new Date().toISOString().slice(0, 10), amount: totals(current).due, method: "M-Pesa", ref: "" };
  if (key === "annex") return { title: "New section", clauses: [""] };
  return "";
}

function download(name, text, type = "application/json") {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importBackup() {
  const input = Object.assign(document.createElement("input"), { type: "file", accept: "application/json,.json" });
  input.onchange = async () => {
    try {
      const data = JSON.parse(await input.files[0].text());
      if (!Array.isArray(data.invoices)) throw new Error("no invoices in file");
      if (!confirm(`Replace everything here with ${data.invoices.length} invoice(s) from the backup?`)) return;
      replaceAll(data);
      route();
    } catch (e) { alert("That file isn't an invoices backup: " + e.message); }
  };
  input.click();
}
const exportBackup = () => download(`invoices-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(db, null, 2));

function createInvoice(from) {
  const inv = from
    ? { ...structuredClone(from), id: crypto.randomUUID(), status: "draft", issueDate: new Date().toISOString().slice(0, 10), payments: [], createdAt: Date.now(), updatedAt: Date.now() }
    : newInvoice(db.settings);
  inv.number = newInvoice(db.settings).number;
  db.settings.nextNumber = Number(db.settings.nextNumber) + 1;
  db.invoices.push(inv);
  save();
  location.hash = `#/edit/${inv.id}`;
}

// ---------- dashboard ----------
function dashboard() {
  current = null;
  document.title = "Invoices · Lekopien";
  const year = new Date().getFullYear().toString();
  const rows = db.invoices.map((inv) => ({ inv, st: liveStatus(inv), t: totals(inv) }));
  const open = rows.filter((r) => ["sent", "part-paid", "overdue"].includes(r.st));
  const sum = (list, f) => list.reduce((s, r) => s + f(r), 0);
  const collected = sum(rows.filter((r) => r.st !== "cancelled"), (r) => r.inv.payments.filter((p) => (p.date ?? "").startsWith(year)).reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const counts = rows.reduce((c, r) => ((c[r.st] = (c[r.st] ?? 0) + 1), c), {});
  const q = query.toLowerCase();
  const shown = rows
    .filter((r) => filter === "all" || r.st === filter)
    .filter((r) => !q || [r.inv.number, r.inv.client.name, r.inv.engagement.title, r.inv.projectRef].join(" ").toLowerCase().includes(q))
    .sort((a, b) => b.inv.issueDate.localeCompare(a.inv.issueDate) || b.inv.number.localeCompare(a.inv.number));

  app.innerHTML = `
  ${topbar()}
  <main class="wrap dash">
    <div class="kpis">
      <div class="kpi"><span>Outstanding</span><b>${money(sum(open, (r) => r.t.due))}</b><small>${open.length} open invoice${open.length === 1 ? "" : "s"}</small></div>
      <div class="kpi bad"><span>Overdue</span><b>${money(sum(rows.filter((r) => r.st === "overdue"), (r) => r.t.due))}</b><small>${counts.overdue ?? 0} invoice${counts.overdue === 1 ? "" : "s"}</small></div>
      <div class="kpi ok"><span>Collected in ${year}</span><b>${money(collected)}</b><small>from payments recorded</small></div>
      <div class="kpi"><span>Drafts</span><b>${money(sum(rows.filter((r) => r.st === "draft"), (r) => r.t.total))}</b><small>${counts.draft ?? 0} not sent yet</small></div>
    </div>
    <div class="toolbar">
      <div class="filters">${["all", "draft", "sent", "part-paid", "overdue", "paid", "cancelled"].map((f) => `<button class="pill${filter === f ? " on" : ""}" data-filter="${f}">${f === "all" ? "All" : STATUS_LABEL[f]} <i>${f === "all" ? rows.length : counts[f] ?? 0}</i></button>`).join("")}</div>
      <input type="search" id="q" placeholder="Search client, number, project" value="${esc(query)}">
    </div>
    ${shown.length ? `<div class="table-wrap"><table class="list">
      <thead><tr><th>Invoice</th><th>Client</th><th>Issued</th><th>Due</th><th class="n">Total</th><th class="n">Balance</th><th>Status</th><th></th></tr></thead>
      <tbody>${shown.map(({ inv, st, t }) => `<tr data-open="${inv.id}">
        <td class="mono">${esc(inv.number)}</td>
        <td><b>${esc(inv.client.name || "Untitled client")}</b><small>${esc(inv.engagement.title)}</small></td>
        <td>${longDate(inv.issueDate)}</td><td>${longDate(dueDate(inv))}</td>
        <td class="n">${fmt(t.total)}</td><td class="n">${fmt(t.due)}</td><td>${badge(st)}</td>
        <td class="n row-acts"><button class="ic" data-dup="${inv.id}" title="Duplicate">⧉</button><button class="ic del" data-del="${inv.id}" title="Delete">✕</button></td></tr>`).join("")}</tbody>
    </table></div>` : `<div class="empty">${db.invoices.length ? "No invoices match." : `<h2>No invoices yet</h2><p>Outline the work and prices, set the deliverables and contract terms, then print or save it as a PDF.</p><button class="btn" data-new>New invoice</button>`}</div>`}
  </main>`;
}

function topbar(extra = "") {
  return `<header class="top"><div class="wrap">
    <a class="brand" href="#/">lekopien<span>.</span>invoices</a>
    <nav>${extra}<button class="btn sm" data-new>+ New invoice</button>
      <a href="#/settings">Settings</a><button class="link" data-export>Backup</button><button class="link" data-import>Restore</button><a href="/logout">Sign out</a></nav>
  </div><div class="sync wrap" id="sync">${SYNC_LABEL[syncState]}</div></header>`;
}

// ---------- editor ----------
function editorForm(inv) {
  const t = totals(inv);
  const pct = inv.schedule.reduce((s, m) => s + (Number(m.percent) || 0), 0);
  const sched = scheduleRows(inv);
  return `
  <details open><summary>Invoice</summary><div class="grid">
    ${field("Invoice number", "number", inv.number)}
    <label class="f"><span>Status</span><select data-bind="status">${["draft", "sent", "cancelled"].map((s) => `<option value="${s}"${inv.status === s ? " selected" : ""}>${STATUS_LABEL[s]}</option>`).join("")}</select></label>
    ${field("Issue date", "issueDate", inv.issueDate, { type: "date" })}
    ${field("Days to pay", "dueDays", inv.dueDays, { type: "number" })}
    ${field("Project ref.", "projectRef", inv.projectRef, { placeholder: "e.g. CAPEX-WEB-MIG-01" })}
    <div class="f note"><span>Due</span>${longDate(dueDate(inv))} · ${badge(liveStatus(inv))}</div>
  </div><p class="hint">Paid, part-paid and overdue are worked out from the payments you record below.</p></details>

  <details open><summary>Client</summary><div class="grid">
    ${field("Client name", "client.name", inv.client.name, { placeholder: "Company or person" })}
    ${field("Attention", "client.attn", inv.client.attn, { placeholder: "The Directors" })}
    ${field("Location", "client.location", inv.client.location)}
    ${field("Email", "client.email", inv.client.email, { type: "email" })}
    ${field("Phone", "client.phone", inv.client.phone)}
  </div></details>

  <details open><summary>Engagement</summary><div class="grid">
    ${field("Project title", "engagement.title", inv.engagement.title, { wide: true, placeholder: "Website re-engineering & business email" })}
    ${field("Service period", "engagement.period", inv.engagement.period, { placeholder: "10 Oct – 17 Oct 2026" })}
    ${field("Payment terms", "engagement.paymentTerms", inv.engagement.paymentTerms)}
  </div></details>

  <details open><summary>Work &amp; prices <em>${money(t.subtotal)}</em></summary>
    ${inv.items.map((it, i) => `<div class="item">
      <div class="grid item-grid">
        ${field("Ref", `items.${i}.ref`, it.ref)}
        ${field("Service", `items.${i}.title`, it.title, { wide: true, placeholder: "What you will do" })}
        ${field("Qty", `items.${i}.qty`, it.qty, { type: "number", step: "any" })}
        ${field(`Rate (${esc(db.settings.currency)})`, `items.${i}.rate`, it.rate, { type: "number", step: "any" })}
      </div>
      ${field("Details", `items.${i}.desc`, it.desc, { area: true, rows: 2, wide: true, placeholder: "Scope of this line, shown under the title" })}
      ${rowTools("items", i, inv.items.length)}</div>`).join("")}
    ${addBtn("items", "Add a service")}
    <div class="grid" style="margin-top:12px">${field(`Discount (${esc(db.settings.currency)})`, "discount", inv.discount, { type: "number", step: "any" })}<div class="f note"><span>Total</span>${money(t.total)}</div></div>
  </details>

  <details open><summary>Deliverables</summary>
    <p class="hint">What the client receives. Shown in Annex A as {deliverables}.</p>
    ${lines("deliverables", inv.deliverables, "Add a deliverable", 1)}
    <h5>Not included</h5><p class="hint">Shown as {exclusions}. Spelling these out avoids scope creep.</p>
    ${lines("exclusions", inv.exclusions, "Add an exclusion", 1)}
  </details>

  <details open><summary>Payment schedule <em class="${pct === 100 ? "" : "warn"}">${pct}% of total</em></summary>
    <p class="hint">Milestones as a share of the total. Payments received are applied to them in order.</p>
    ${inv.schedule.map((m, i) => `<div class="row3">
      ${field(`${money(sched[i].amount)} · ${sched[i].state}`, `schedule.${i}.label`, m.label)}
      ${field("%", `schedule.${i}.percent`, m.percent, { type: "number", step: "any" })}
      ${field("When", `schedule.${i}.due`, m.due, { placeholder: "On signature" })}
      ${rowTools("schedule", i, inv.schedule.length)}</div>`).join("")}
    ${addBtn("schedule", "Add a milestone")}
    ${pct === 100 ? "" : `<p class="hint warn">Milestones add up to ${pct}%, not 100%.</p>`}
  </details>

  <details open><summary>Payments received <em>${money(t.paid)} paid · ${money(t.due)} left</em></summary>
    ${inv.payments.map((p, i) => `<div class="row4">
      ${field("Date", `payments.${i}.date`, p.date, { type: "date" })}
      ${field("Amount", `payments.${i}.amount`, p.amount, { type: "number", step: "any" })}
      ${field("Method", `payments.${i}.method`, p.method)}
      ${field("Reference", `payments.${i}.ref`, p.ref, { placeholder: "M-Pesa code" })}
      ${rowTools("payments", i, inv.payments.length)}</div>`).join("")}
    ${addBtn("payments", "Record a payment")}
  </details>

  <details><summary>Terms on the invoice <em>${inv.terms.length}</em></summary>
    <p class="hint">Placeholders: {client} {total} {dueDays} {dueDate} {invoice} {project} {person} {tradingAs}</p>
    ${lines("terms", inv.terms, "Add a term")}
  </details>

  <details><summary>Annex A · contract guardrails <em>${inv.annexEnabled ? `${inv.annex.length} sections` : "off"}</em></summary>
    ${check("Attach Annex A (scope of work &amp; terms of engagement)", "annexEnabled", inv.annexEnabled)}
    ${check("Signature lines for both parties", "signatures", inv.signatures)}
    <p class="hint">Placeholders: {client} {total} {schedule} {deliverables} {exclusions} {person} {tradingAs} {location} {invoice} {project}</p>
    ${inv.annex.map((sec, i) => `<div class="sec-edit">
      <div class="sec-head"><b>${i + 1}.</b>${field("Section title", `annex.${i}.title`, sec.title)}${rowTools("annex", i, inv.annex.length)}</div>
      ${lines(`annex.${i}.clauses`, sec.clauses, "Add a clause", 3)}</div>`).join("")}
    ${addBtn("annex", "Add a section")}
  </details>

  <details><summary>Private notes</summary>
    ${field("Only you see these. Not printed.", "notes", inv.notes, { area: true, rows: 3, wide: true })}
  </details>

  <div class="tpl">
    <button type="button" class="btn ghost sm" data-save-tpl>Save deliverables, schedule, terms &amp; annex as my defaults</button>
    <button type="button" class="btn ghost sm" data-load-tpl>Reset this invoice to my defaults</button>
  </div>`;
}

function editor(id) {
  const inv = db.invoices.find((x) => x.id === id);
  if (!inv) return (location.hash = "#/");
  current = inv;
  document.title = `${inv.number}${inv.client.name ? " " + inv.client.name : ""}`; // becomes the PDF file name
  app.innerHTML = `
  ${topbar()}
  <div class="bar wrap">
    <a href="#/" class="link">← All invoices</a>
    <div class="acts">
      ${inv.status === "draft" ? `<button class="btn ghost sm" data-mark-sent>Mark as sent</button>` : ""}
      <button class="btn ghost sm" data-dup="${inv.id}">Duplicate</button>
      <button class="btn ghost sm del" data-del="${inv.id}">Delete</button>
      <button class="btn sm" data-print>Print / Save PDF</button>
    </div>
  </div>
  <div class="tabs"><button class="on" data-tab="form">Edit</button><button data-tab="preview">Preview</button></div>
  <div class="split" data-show="form">
    <form id="form" autocomplete="off">${editorForm(inv)}</form>
    <div class="preview-wrap" id="pw"><div class="doc" id="doc">${renderDocument(inv, db.settings)}</div></div>
  </div>`;
  fitPreview();
}

// ---------- settings ----------
function settingsView() {
  const s = db.settings;
  current = s;
  document.title = "Settings · Invoices";
  const t = templates(s);
  app.innerHTML = `
  ${topbar()}
  <main class="wrap narrow">
    <h1>Settings</h1>
    <form id="form" autocomplete="off">
    <details open><summary>Your business</summary><div class="grid">
      ${field("Business name (header)", "business.name", s.business.name)}
      ${field("Trading as", "business.tradingAs", s.business.tradingAs)}
      ${field("Tagline", "business.tagline", s.business.tagline, { wide: true })}
      ${field("Your name", "business.person", s.business.person)}
      ${field("Role", "business.role", s.business.role)}
      ${field("Location", "business.location", s.business.location)}
      ${field("Website", "business.website", s.business.website)}
      ${field("Email", "business.email", s.business.email)}
      ${field("Phone", "business.phone", s.business.phone)}
    </div></details>
    <details open><summary>How clients pay you</summary><div class="grid">
      ${field("M-Pesa number", "payment.mpesa", s.payment.mpesa)}
      ${field("M-Pesa name", "payment.mpesaName", s.payment.mpesaName)}
    </div>
    ${check("Show bank details on invoices", "payment.showBank", s.payment.showBank)}
    <div class="grid">${Object.entries(s.payment.bank).map(([k, v]) => field(esc(k), `payment.bank.${k}`, v)).join("")}</div></details>
    <details open><summary>Numbering &amp; currency</summary><div class="grid">
      ${field("Invoice prefix", "prefix", s.prefix)}
      ${field("Next number", "nextNumber", s.nextNumber, { type: "number" })}
      ${field("Default days to pay", "dueDays", s.dueDays, { type: "number" })}
      ${field("Currency code", "currency", s.currency)}
      ${field("Currency name", "currencyName", s.currencyName)}
    </div><p class="hint">Next invoice: ${esc(newInvoice(s).number)}</p></details>
    <details open><summary>Default guardrails for new invoices</summary>
      <p>New invoices start with ${t.deliverables.length} deliverable(s), ${t.exclusions.length} exclusion(s), ${t.schedule.length} payment milestone(s) (${t.schedule.map((m) => m.percent + "%").join(" / ")}), ${t.terms.length} terms and a ${t.annex.length}-section Annex A.
      ${s.templates ? "These are your saved defaults." : "These are the built-in defaults."}</p>
      <p class="hint">To change them, edit any invoice the way you like it and press “Save … as my defaults” at the bottom of the editor.</p>
      ${s.templates ? `<button type="button" class="btn ghost sm" data-reset-tpl>Go back to the built-in defaults</button>` : ""}
    </details>
    </form>
    <details open><summary>Backup</summary>
      <p class="hint">${syncState === "local" ? "Invoices are stored in this browser only. Export a backup now and then, or turn on Cloudflare KV sync (see the README)." : "Invoices sync to Cloudflare KV, so they appear on every device you sign in from."}</p>
      <div class="tpl"><button class="btn ghost sm" data-export>Export backup (.json)</button><button class="btn ghost sm" data-import>Restore from backup</button></div>
    </details>
  </main>`;
}

// ---------- preview sizing ----------
let fitObserver;
function fitPreview() {
  const pw = document.getElementById("pw"), doc = document.getElementById("doc");
  if (!pw) return;
  fitObserver?.disconnect();
  fitObserver = new ResizeObserver(() => doc.style.setProperty("--z", Math.min(1, (pw.clientWidth - 24) / doc.offsetWidth)));
  fitObserver.observe(pw);
}
let previewTimer;
function refreshPreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const doc = document.getElementById("doc");
    if (doc && current?.items) doc.innerHTML = renderDocument(current, db.settings);
  }, 120);
}

/** Re-renders the form after a structural change without losing the scroll position. */
function rerender() {
  const scroller = document.scrollingElement, form = document.getElementById("form");
  const y = scroller.scrollTop, fy = form?.scrollTop ?? 0;
  const openState = [...document.querySelectorAll("#form details")].map((d) => d.open);
  route();
  document.querySelectorAll("#form details").forEach((d, i) => { if (i in openState) d.open = openState[i]; });
  scroller.scrollTop = y;
  if (document.getElementById("form")) document.getElementById("form").scrollTop = fy;
}

function touch() {
  if (current?.items) current.updatedAt = Date.now();
  save();
}

// ---------- events ----------
app.addEventListener("input", (e) => {
  const el = e.target;
  if (el.id === "q") { query = el.value; const pos = el.selectionStart; dashboard(); const q = document.getElementById("q"); q.focus(); q.setSelectionRange(pos, pos); return; }
  const path = el.dataset.bind;
  if (!path || !current) return;
  const v = el.dataset.type === "bool" ? el.checked : el.dataset.type === "num" ? (el.value === "" ? 0 : Number(el.value)) : el.value;
  setPath(current, path, v);
  touch();
  if (current.items) {
    refreshPreview();
    if (el.dataset.type === "bool" || el.tagName === "SELECT") rerender();
  }
});
// Totals and badges in the form update when a field is left, so typing is never interrupted.
app.addEventListener("change", (e) => {
  if (e.target.dataset.bind && current?.items && e.target.dataset.type === "num") rerender();
  if (e.target.dataset.bind && current?.items && e.target.type === "date") rerender();
});

app.addEventListener("click", (e) => {
  const el = e.target.closest("button, [data-open]");
  if (!el) return;
  const d = el.dataset;

  if (d.act) {
    const arr = getPath(current, d.list), i = Number(d.i);
    if (d.act === "add") arr.push(blank(d.list, arr));
    if (d.act === "remove") { if (typeof arr[i] === "object" && !confirm("Remove this row?")) return; arr.splice(i, 1); }
    if (d.act === "up" && i > 0) [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
    if (d.act === "down" && i < arr.length - 1) [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
    touch();
    rerender();
    if (d.act === "add") {
      const fields = [...document.querySelectorAll(`[data-bind^="${d.list}.${arr.length - 1}"]`)];
      (fields.find((f) => f.type !== "date") ?? fields[0])?.focus();
    }
    return;
  }
  if ("new" in d) return createInvoice();
  if (d.dup) return createInvoice(db.invoices.find((x) => x.id === d.dup));
  if (d.del) {
    const inv = db.invoices.find((x) => x.id === d.del);
    if (!confirm(`Delete ${inv.number}${inv.client.name ? ` for ${inv.client.name}` : ""}? This can't be undone.`)) return;
    db.invoices = db.invoices.filter((x) => x.id !== d.del);
    save();
    return location.hash === "#/" ? dashboard() : (location.hash = "#/");
  }
  if (d.open) return (location.hash = `#/edit/${d.open}`);
  if (d.filter) { filter = d.filter; return dashboard(); }
  if ("export" in d) return exportBackup();
  if ("import" in d) return importBackup();
  if ("print" in d) return window.print();
  if ("markSent" in d) { current.status = "sent"; touch(); return rerender(); }
  if (d.tab) {
    document.querySelector(".split").dataset.show = d.tab;
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b === el));
    return fitPreview();
  }
  if ("saveTpl" in d) {
    const { deliverables, exclusions, schedule, terms, annex } = current;
    db.settings.templates = structuredClone({ deliverables, exclusions, schedule, terms, annex });
    save();
    el.textContent = "Saved as your defaults ✓";
    return;
  }
  if ("loadTpl" in d) {
    if (!confirm("Replace this invoice's deliverables, schedule, terms and annex with your defaults?")) return;
    Object.assign(current, structuredClone(templates(db.settings)));
    touch();
    return rerender();
  }
  if ("resetTpl" in d) {
    if (!confirm("Forget your saved defaults and use the built-in ones for new invoices?")) return;
    delete db.settings.templates;
    save();
    return settingsView();
  }
});

onSyncChange((s) => { const el = document.getElementById("sync"); if (el) { el.textContent = SYNC_LABEL[s]; el.dataset.state = s; } });

function route() {
  const [, view, id] = location.hash.split("/");
  if (view === "edit") editor(id);
  else if (view === "settings") settingsView();
  else dashboard();
}
window.addEventListener("hashchange", () => { route(); window.scrollTo(0, 0); });

await load();
route();
