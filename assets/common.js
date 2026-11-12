// Shared helpers for both pages.

const CATEGORY_LABELS = {
  official: "Official updates",
  news: "Headlines",
  buzz: "Gossip & buzz",
  research: "Research",
  tools: "New models & tools",
  market: "Market & funding",
};

const IST = "Asia/Kolkata";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Only allow http(s) links from the data files.
function safeUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "#";
  } catch { return "#"; }
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  const d = Math.floor(diff / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

function formatIST(iso, opts = {}) {
  return new Date(iso).toLocaleString("en-IN", { timeZone: IST, dateStyle: "medium", timeStyle: "short", ...opts });
}

function dayKeyIST(iso) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: IST }); // YYYY-MM-DD
}

// Next scheduled run: 01:30 or 13:30 UTC (7:00 AM / 7:00 PM IST).
function nextUpdate() {
  const now = new Date();
  const runs = [];
  for (let d = 0; d < 2; d++) {
    for (const h of [1, 13]) {
      const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + d, h, 30));
      if (t > now) runs.push(t);
    }
  }
  return runs.sort((a, b) => a - b)[0];
}

async function loadJSON(path) {
  const res = await fetch(`${path}?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}
