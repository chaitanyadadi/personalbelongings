// AI Hub page: reads data/ai/items.json and data/ai/meta.json.

const state = { cat: "all", days: 7, company: "", hideUnv: false, q: "", limit: 80 };
let ITEMS = [], META = {};

function lastEditionTime() {
  // Items first seen in the latest run get a "New" badge.
  // On the very first edition everything is new, so no badges.
  return (META.editions?.length || 0) > 1 ? META.editions[0].at : null;
}

function filtered(ignoreCat = false) {
  const since = Date.now() - state.days * 86400000;
  const q = state.q.trim().toLowerCase();
  return ITEMS.filter((x) =>
    (ignoreCat || state.cat === "all" || x.category === state.cat) &&
    new Date(x.published).getTime() >= since &&
    (!state.company || (x.companies || []).includes(state.company)) &&
    (!state.hideUnv || !x.unverified) &&
    (!q || `${x.title} ${x.summary} ${x.source} ${x.publisher || ""}`.toLowerCase().includes(q))
  );
}

function renderTabs() {
  const base = filtered(true);
  const counts = { all: base.length };
  for (const x of base) counts[x.category] = (counts[x.category] || 0) + 1;
  const tabs = [["all", "Everything"], ...Object.entries(CATEGORY_LABELS)];
  document.getElementById("tabs").innerHTML = tabs.map(([id, label]) => `
    <button class="tab" role="tab" data-cat="${id}" aria-selected="${state.cat === id}">
      ${esc(label)}<span class="count">${counts[id] || 0}</span>
    </button>`).join("");
}

function storyHTML(x, newSince) {
  const isNew = newSince && x.first_seen && x.first_seen >= newSince;
  const by = x.publisher ? `${x.publisher} via ${x.source}` : x.source;
  const tags = [
    state.cat === "all" ? `<span class="tag cat">${esc(CATEGORY_LABELS[x.category])}</span>` : "",
    x.unverified ? `<span class="tag unv">Unverified</span>` : "",
    ...(x.companies || []).map((c) => `<button type="button" class="tag" data-company="${esc(c)}" title="Show only ${esc(c)}">${esc(c)}</button>`),
  ].join("");
  return `
    <article class="story">
      <h3 class="${isNew ? "is-new" : ""}"><a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener">${esc(x.title)}</a></h3>
      <time datetime="${esc(x.published)}" title="${esc(formatIST(x.published))} IST">${esc(timeAgo(x.published))}</time>
      ${x.summary ? `<p class="sum">${esc(x.summary)}</p>` : ""}
      <div class="meta"><span>${esc(by)}</span>${tags}
        ${x.discussion ? `<a href="${esc(safeUrl(x.discussion))}" target="_blank" rel="noopener">Discussion</a>` : ""}
      </div>
    </article>`;
}

function renderFeed() {
  const list = filtered();
  const feed = document.getElementById("feed");
  document.getElementById("result").textContent = `${list.length} ${list.length === 1 ? "item" : "items"}`;
  if (!list.length) {
    feed.innerHTML = `<p class="empty">Nothing matches these filters. Try a longer time range or clear the search.</p>`;
    return;
  }
  const newSince = lastEditionTime();
  const today = dayKeyIST(new Date().toISOString());
  const yesterday = dayKeyIST(new Date(Date.now() - 86400000).toISOString());
  let html = "", day = null, open = false;
  for (const x of list.slice(0, state.limit)) {
    const k = dayKeyIST(x.published);
    if (k !== day) {
      if (open) html += "</section>";
      const label = k === today ? "Today" : k === yesterday ? "Yesterday"
        : new Date(x.published).toLocaleDateString("en-IN", { timeZone: IST, weekday: "long", day: "numeric", month: "long" });
      html += `<section class="day"><h2>${esc(label)}</h2>`;
      day = k; open = true;
    }
    html += storyHTML(x, newSince);
  }
  if (open) html += "</section>";
  if (list.length > state.limit) {
    html += `<button type="button" class="button more" id="more">Show ${Math.min(80, list.length - state.limit)} more</button>`;
  }
  feed.innerHTML = html;
}

function render() { renderTabs(); renderFeed(); }

function spark(values, up) {
  if (!values || values.length < 2) return "";
  const w = 120, h = 28, min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1) * w).toFixed(1)},${(h - 2 - (v - min) / span * (h - 4)).toFixed(1)}`).join(" ");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5" class="${up ? "up" : "down"}"/></svg>`;
}

function renderMarket() {
  const el = document.getElementById("market");
  const s = META.stocks || [];
  if (!s.length) {
    el.outerHTML = `<p class="wrap market-empty">Stock prices appear after the first scheduled update.</p>`;
    return;
  }
  el.innerHTML = s.map((t) => {
    const up = t.change_pct >= 0;
    return `<li class="tick" title="Last close ${esc(t.as_of)}. One month: ${t.month_pct > 0 ? "+" : ""}${t.month_pct}%">
      <div><span class="t">${esc(t.ticker)}</span><span class="n">${esc(t.name)}</span></div>
      <div><span class="p">$${Number(t.price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      <span class="c ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${Math.abs(t.change_pct).toFixed(2)}%</span></div>
      <span class="${up ? "up" : "down"}">${spark(t.spark, t.month_pct >= 0)}</span>
    </li>`;
  }).join("");
}

function renderBrief() {
  const ed = META.editions?.[0];
  const el = document.getElementById("brief");
  if (!ed) return;
  const byId = Object.fromEntries(ITEMS.map((x) => [x.id, x]));
  const counts = Object.entries(ed.by_category || {}).filter(([, n]) => n)
    .map(([c, n]) => `<li><b>${n}</b>${esc(CATEGORY_LABELS[c])}</li>`).join("");
  if (ed.brief && ed.brief.points?.length) {
    el.innerHTML = `
      <h2 id="brief-title">${esc(ed.brief.headline || "Today's brief")}</h2>
      <ul>${ed.brief.points.map((p) => {
        const src = (p.ids || []).map((id) => byId[id]).filter(Boolean)[0];
        return `<li>${esc(p.text)}${src ? ` <a href="${esc(safeUrl(src.url))}" target="_blank" rel="noopener">Source</a>` : ""}</li>`;
      }).join("")}</ul>`;
  } else {
    el.innerHTML = `
      <h2 id="brief-title">${ed.new_count} new ${ed.new_count === 1 ? "item" : "items"} since the last edition</h2>
      <ul class="counts">${counts}</ul>`;
  }
  el.hidden = false;
}

function renderHeader() {
  const nu = nextUpdate();
  document.getElementById("edition").innerHTML =
    `Updated <strong>${esc(formatIST(META.updated))} IST</strong>. Next update around ${esc(formatIST(nu.toISOString(), { dateStyle: undefined, timeStyle: "short" }))} IST.`;
}

function renderHealth() {
  const h = META.health || [];
  const bad = h.filter((x) => !x.ok).length;
  document.querySelector("#health summary").textContent =
    `Source health: ${h.length - bad} of ${h.length} sources worked in the last update`;
  document.getElementById("health-body").innerHTML = `<table>
    <thead><tr><th>Source</th><th>Section</th><th>Status</th></tr></thead>
    <tbody>${h.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(CATEGORY_LABELS[x.category] || "")}</td>
      <td>${x.ok ? `<span class="good">OK</span>, ${x.count} items` : `<span class="bad">Failed</span> <span class="muted">${esc(x.error || "")}</span>`}</td></tr>`).join("")}
    </tbody></table>`;
}

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get("cat") && (p.get("cat") === "all" || CATEGORY_LABELS[p.get("cat")])) state.cat = p.get("cat");
  if (p.get("company")) state.company = p.get("company");
}
function writeHash() {
  const p = new URLSearchParams();
  if (state.cat !== "all") p.set("cat", state.cat);
  if (state.company) p.set("company", state.company);
  history.replaceState(null, "", p.toString() ? `#${p}` : location.pathname);
}

function bind() {
  document.getElementById("tabs").addEventListener("click", (e) => {
    const b = e.target.closest(".tab"); if (!b) return;
    state.cat = b.dataset.cat; state.limit = 80; writeHash(); render();
  });
  document.getElementById("tabs").addEventListener("keydown", (e) => {
    if (!["ArrowRight", "ArrowLeft"].includes(e.key)) return;
    const tabs = [...document.querySelectorAll(".tab")];
    const i = tabs.findIndex((t) => t.dataset.cat === state.cat);
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    state.cat = next.dataset.cat; writeHash(); render();
    document.querySelector(`.tab[data-cat="${state.cat}"]`).focus();
  });
  document.getElementById("range").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    document.querySelectorAll("#range button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    state.days = Number(b.dataset.days); render();
  });
  const company = document.getElementById("company");
  company.addEventListener("change", () => { state.company = company.value; writeHash(); render(); });
  document.getElementById("hide-unv").addEventListener("change", (e) => { state.hideUnv = e.target.checked; render(); });
  let t; document.getElementById("q").addEventListener("input", (e) => {
    clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; render(); }, 150);
  });
  document.getElementById("feed").addEventListener("click", (e) => {
    const c = e.target.closest("[data-company]");
    if (c) { state.company = c.dataset.company; company.value = state.company; writeHash(); render(); window.scrollTo({ top: document.querySelector(".tabs-bar").offsetTop }); }
    if (e.target.id === "more") { state.limit += 80; renderFeed(); }
  });
}

(async function () {
  readHash();
  try {
    [ITEMS, META] = await Promise.all([loadJSON("data/ai/items.json"), loadJSON("data/ai/meta.json")]);
  } catch (e) {
    document.getElementById("edition").textContent = "No AI data yet. It appears after the first scheduled update runs on GitHub.";
    document.getElementById("feed").innerHTML = `<p class="empty">Open the Actions tab of your repository and run “Update AI Hub and publish site”.</p>`;
    return;
  }
  const companies = [...new Set(ITEMS.flatMap((x) => x.companies || []))].sort();
  const sel = document.getElementById("company");
  sel.innerHTML += companies.map((c) => `<option>${esc(c)}</option>`).join("");
  sel.value = state.company;
  renderHeader(); renderMarket(); renderBrief(); renderHealth(); bind(); render();
})();
