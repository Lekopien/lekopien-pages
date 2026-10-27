// Money helpers shared by the editor, the preview and the dashboard.

export const fmt = (n) => Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function totals(inv) {
  const subtotal = inv.items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0);
  const discount = Number(inv.discount) || 0;
  const paid = inv.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return { subtotal, discount, paid, due: Math.max(subtotal - discount - paid, 0), total: subtotal - discount };
}

export function dueDate(inv) {
  const d = new Date(inv.issueDate + "T00:00:00");
  d.setDate(d.getDate() + (Number(inv.dueDays) || 0));
  return d.toISOString().slice(0, 10);
}

/** Status shown on the dashboard: stored status, upgraded to "overdue" or "paid" from the numbers. */
export function liveStatus(inv, today = new Date().toISOString().slice(0, 10)) {
  if (inv.status === "cancelled" || inv.status === "draft") return inv.status;
  const t = totals(inv);
  if (t.total > 0 && t.due === 0) return "paid";
  if (dueDate(inv) < today) return "overdue";
  return t.paid > 0 ? "part-paid" : "sent";
}

export const longDate = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function under1000(n) {
  const h = Math.floor(n / 100), r = n % 100;
  const rest = r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? "-" + ONES[r % 10] : "");
  return [h ? ONES[h] + " Hundred" : "", rest].filter(Boolean).join(" and ");
}

/** 42000 → "Forty-Two Thousand"; 1250.5 → "One Thousand Two Hundred and Fifty and Fifty Cents". */
export function inWords(amount) {
  const whole = Math.floor(amount), cents = Math.round((amount - whole) * 100);
  if (!whole && !cents) return "Zero";
  const parts = [];
  [[1e9, "Billion"], [1e6, "Million"], [1e3, "Thousand"], [1, ""]].reduce((n, [size, name]) => {
    const chunk = Math.floor(n / size);
    if (chunk) parts.push(under1000(chunk) + (name ? " " + name : ""));
    return n % size;
  }, whole);
  let words = parts.join(" ");
  if (cents) words += `${words ? " and " : ""}${under1000(cents)} Cents`;
  return words;
}
