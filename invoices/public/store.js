// Keeps all invoices and settings in this browser, and in Cloudflare KV too when the Worker has it bound.
import { DEFAULT_SETTINGS } from "./defaults.js";

const KEY = "lekopien-invoices-v1";
export const db = { settings: structuredClone(DEFAULT_SETTINGS), invoices: [], savedAt: 0 };
export let syncState = "local"; // "local" | "synced" | "saving" | "error"
let onSync = () => {};
export const onSyncChange = (fn) => (onSync = fn);
const setSync = (s) => { syncState = s; onSync(s); };

function adopt(data) {
  if (!data) return;
  db.invoices = Array.isArray(data.invoices) ? data.invoices : [];
  // Merge so settings added in later versions get their defaults.
  const s = data.settings ?? {};
  db.settings = { ...structuredClone(DEFAULT_SETTINGS), ...s,
    business: { ...DEFAULT_SETTINGS.business, ...s.business },
    payment: { ...DEFAULT_SETTINGS.payment, ...s.payment, bank: { ...(s.payment?.bank ?? DEFAULT_SETTINGS.payment.bank) } } };
  db.savedAt = Number(data.savedAt) || 0;
}

function readLocal() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}

export async function load() {
  adopt(readLocal());
  try {
    const res = await fetch("api/data", { cache: "no-store" });
    if (res.status === 401) return location.reload(); // session expired: show the sign-in page
    if (!res.ok) return setSync("local");
    const remote = await res.json();
    if ((Number(remote.savedAt) || 0) > db.savedAt) {
      adopt(remote);
      writeLocal();
      setSync("synced");
    } else if (db.savedAt > (Number(remote.savedAt) || 0)) {
      setSync("synced");
      push(); // this browser has newer work than the cloud copy
    } else setSync("synced");
  } catch {
    setSync("local"); // opened from disk or offline
  }
}

function writeLocal() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { alert("This browser refused to save. Export a backup now."); }
}

let timer;
async function push() {
  setSync("saving");
  try {
    const res = await fetch("api/data", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(db) });
    setSync(res.ok ? "synced" : "error");
  } catch { setSync("error"); }
}

export function save() {
  db.savedAt = Date.now();
  writeLocal();
  if (syncState === "local") return;
  clearTimeout(timer);
  timer = setTimeout(push, 800);
}

export function replaceAll(data) {
  adopt(data);
  save();
}
