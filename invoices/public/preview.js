// Renders an invoice (and its Annex A terms) as printable A4 HTML, styled after the paper invoice.
import { CURRENCIES } from "./defaults.js";
import { fmt, totals, dueDate, longDate, inWords, liveStatus } from "./money.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const nl = (s) => esc(s).replace(/\n/g, "<br>");
const letters = "abcdefghijklmnopqrstuvwxyz";

/** "(a) one; (b) two; and (c) three" */
function lettered(list) {
  const parts = list.map((s) => s.trim().replace(/[.;]+$/, "")).filter(Boolean).map((s, i) => `(${letters[i] ?? i + 1}) ${s}`);
  if (parts.length < 2) return parts.join("") + (parts.length ? "." : "");
  return `${parts.slice(0, -1).join("; ")}; and ${parts.at(-1)}.`;
}

/** Each milestone's amount, and how much of it the payments received so far cover (applied in order). */
export function scheduleRows(inv) {
  const t = totals(inv);
  let left = t.paid;
  return (inv.schedule ?? []).map((m) => {
    const amount = Math.round(t.total * (Number(m.percent) || 0)) / 100;
    const covered = Math.min(left, amount);
    left -= covered;
    return { ...m, amount, covered, state: amount > 0 && covered >= amount ? "Paid" : covered > 0 ? "Part-paid" : "Due" };
  });
}

export const currencyOf = (inv, s) => inv.currency || s.currency;
export const currencyName = (inv, s) => CURRENCIES[currencyOf(inv, s)] ?? s.currencyName;

/** Values available to terms and annex clauses as {placeholders}. */
function placeholders(inv, s) {
  const t = totals(inv);
  const cur = currencyOf(inv, s);
  const sched = scheduleRows(inv).filter((m) => Number(m.percent));
  return {
    person: s.business.person, tradingAs: s.business.tradingAs, location: s.business.location, business: s.business.name,
    client: inv.client.name || "the Client", invoice: inv.number, dueDays: inv.dueDays, dueDate: longDate(dueDate(inv)),
    total: `${cur} ${fmt(t.total)}`, currency: cur, currencyName: currencyName(inv, s), project: inv.engagement.title,
    deliverables: inv.deliverables.some((d) => d.trim()) ? `Deliverables: ${lettered(inv.deliverables)}` : "",
    exclusions: inv.exclusions.some((d) => d.trim()) ? `Excluded: ${lettered(inv.exclusions)}` : "",
    schedule: sched.length
      ? "It is payable as follows: " + lettered(sched.map((m) => `${m.percent}% (${cur} ${fmt(m.amount)}) ${m.label.toLowerCase()}${m.due ? `, due ${m.due.toLowerCase()}` : ""}`))
      : "",
  };
}

/** Escapes clause text, then swaps in {placeholders}. Unknown names stay visible so typos are noticed. */
export function fill(text, vars) {
  return esc(text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? esc(vars[k]) : m));
}

function partyBox(label, lines, accent) {
  const [first, ...rest] = lines.filter((l) => String(l ?? "").trim());
  return `<div class="party${accent ? " accent" : ""}"><h4>${label}</h4><div class="box"><b>${nl(first ?? "")}</b>${rest.map((l) => `<br>${nl(l)}`).join("")}</div></div>`;
}

export function renderDocument(inv, s) {
  const b = s.business, cur = currencyOf(inv, s), curName = currencyName(inv, s), t = totals(inv), vars = placeholders(inv, s);
  const status = liveStatus(inv);
  const items = inv.items.filter((it) => it.title || it.desc || Number(it.rate));
  const sched = scheduleRows(inv).filter((m) => Number(m.percent));
  const terms = inv.terms.map((x) => fill(x, vars)).filter((x) => x.trim());
  const bank = s.payment.showBank ? Object.entries(s.payment.bank).filter(([, v]) => String(v).trim()) : [];

  const head = (right) => `<header class="doc-head"><div><div class="biz"><img class="mark" src="lekopien-badge.svg" alt="">${esc(b.name)}</div><div class="tag">${esc(b.tagline)}</div>${right ? "" : `<div class="tag">${esc([b.location, b.website].filter(Boolean).join(" · "))}</div>`}</div>${right}</header>`;

  const invoicePage = `
  <section class="page">
    ${head(`<div class="meta"><div class="title">INVOICE</div>
      <dl>
        <dt>Invoice No.</dt><dd><b>${esc(inv.number)}</b></dd>
        <dt>Issue date</dt><dd>${longDate(inv.issueDate)}</dd>
        <dt>Due date</dt><dd>${longDate(dueDate(inv))}</dd>
        ${inv.projectRef ? `<dt>Project ref.</dt><dd>${esc(inv.projectRef)}</dd>` : ""}
        <dt>Currency</dt><dd>${esc(curName)} (${esc(cur)})</dd>
      </dl>${status === "paid" ? `<div class="stamp">Paid in full</div>` : status === "cancelled" ? `<div class="stamp void">Cancelled</div>` : ""}</div>`)}
    <div class="rule"></div>
    <div class="parties">
      ${partyBox("Billed to", [inv.client.name, inv.client.attn && `Attn: ${inv.client.attn}`, inv.client.location, inv.client.email, inv.client.phone])}
      ${partyBox("From", [b.tradingAs, [b.person, b.role].filter(Boolean).join(", "), b.location, b.email, b.phone])}
      ${partyBox("Engagement", [inv.engagement.title, inv.engagement.period && `Service period: ${inv.engagement.period}`, inv.engagement.paymentTerms && `Payment terms: ${inv.engagement.paymentTerms}`], true)}
    </div>

    <h3 class="sec">Schedule of services</h3>
    <table class="items">
      <thead><tr><th>Ref</th><th>Description of service</th><th class="n">Qty</th><th class="n">Rate (${esc(cur)})</th><th class="n">Amount (${esc(cur)})</th></tr></thead>
      <tbody>${items.map((it) => `<tr><td class="ref">${esc(it.ref)}</td><td><b>${esc(it.title)}</b>${it.desc ? `<div class="desc">${nl(it.desc)}</div>` : ""}</td><td class="n">${esc(it.qty)}</td><td class="n">${fmt(it.rate)}</td><td class="n">${fmt((Number(it.qty) || 0) * (Number(it.rate) || 0))}</td></tr>`).join("") || `<tr><td></td><td class="desc">Add services in the editor.</td><td></td><td></td><td></td></tr>`}</tbody>
    </table>

    <div class="sums">
      <dl>
        <dt>Subtotal</dt><dd>${fmt(t.subtotal)}</dd>
        <dt>Discount</dt><dd>${fmt(t.discount)}</dd>
        <dt>Amount paid</dt><dd>${fmt(t.paid)}</dd>
      </dl>
      <div class="due"><span>Total due</span><b>${esc(cur)} ${fmt(t.due)}</b></div>
      <div class="words">${esc(curName)} ${inWords(t.due)} Only</div>
    </div>

    ${sched.length ? `<h3 class="sec">Payment schedule</h3>
    <table class="items sched">
      <thead><tr><th>Milestone</th><th>When</th><th class="n">Share</th><th class="n">Amount (${esc(cur)})</th><th class="n">Status</th></tr></thead>
      <tbody>${sched.map((m) => `<tr><td><b>${esc(m.label)}</b></td><td>${esc(m.due)}</td><td class="n">${esc(m.percent)}%</td><td class="n">${fmt(m.amount)}</td><td class="n st-${m.state.toLowerCase()}">${m.state}</td></tr>`).join("")}</tbody>
    </table>` : ""}

    ${inv.payments.length ? `<h3 class="sec">Payments received</h3>
    <table class="items sched">
      <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th class="n">Amount (${esc(cur)})</th></tr></thead>
      <tbody>${inv.payments.map((p) => `<tr><td>${longDate(p.date)}</td><td>${esc(p.method)}</td><td>${esc(p.ref)}</td><td class="n">${fmt(p.amount)}</td></tr>`).join("")}</tbody>
    </table>` : ""}

    <div class="foot-grid">
      <div><h3 class="sec">Payment details</h3>
        ${s.payment.mpesa ? `<p><b>M-PESA (Send Money):</b> ${esc(s.payment.mpesa)}${s.payment.mpesaName ? ` (${esc(s.payment.mpesaName)})` : ""}</p>
        <p class="small">Please send the M-PESA confirmation message, quoting ${esc(inv.number)}, to the same number once payment is made.</p>` : ""}
        ${bank.length ? `<p><b>Bank transfer</b></p><dl class="bank">${bank.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}
      </div>
      <div><h3 class="sec">Terms</h3><ul class="terms">${terms.map((x) => `<li>${x}</li>`).join("")}</ul></div>
    </div>
    ${!inv.annexEnabled && inv.signatures ? signatures(inv, b) : ""}
  </section>`;

  const annex = inv.annexEnabled ? `
  <section class="page annex">
    ${head(`<div class="meta"><div class="title small">Scope of work &amp;<br>terms of engagement</div></div>`)}
    <div class="tag">Annex A to Invoice ${esc(inv.number)}</div>
    <div class="rule"></div>
    ${inv.annex.map((sec, i) => {
      const clauses = sec.clauses.map((c) => fill(c, vars)).filter((c) => c.trim());
      return `<h4 class="clause-h">${i + 1}. ${esc(sec.title)}</h4>${clauses.map((c, j) => `<p class="clause"><b>${i + 1}.${j + 1}</b> ${c.replace(/^(Deliverables|Excluded):/, "<b>$1:</b>")}</p>`).join("")}`;
    }).join("")}
    ${inv.signatures ? signatures(inv, b) : ""}
    <div class="colophon">${esc([b.tradingAs, b.person, b.location, b.email, b.phone].filter(Boolean).join(" · "))}</div>
  </section>` : "";

  return invoicePage + annex;
}

function signatures(inv, b) {
  return `<div class="sigs"><div><div class="line"></div>For ${esc(b.tradingAs)}: ${esc(b.person)}<br><span>Signature &amp; date</span></div>
    <div><div class="line"></div>For and on behalf of ${esc(inv.client.name || "the Client")}<br><span>Name, title, signature, company stamp &amp; date</span></div></div>`;
}
