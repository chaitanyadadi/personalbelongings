// Home page: fills the personal sections from content/profile.json
// and shows the newest official AI updates in the "Latest in AI" box.

(async function () {
  try {
    const p = await loadJSON("content/profile.json");
    document.title = `${p.name}, ${p.role}`;
    document.querySelectorAll("[data-field]").forEach((el) => {
      const v = p[el.dataset.field];
      if (v) el.textContent = v;
    });

    document.getElementById("links").innerHTML = (p.links || [])
      .map((l) => `<a href="${esc(safeUrl(l.url))}" rel="me noopener">${esc(l.label)}</a>`).join("");

    document.getElementById("about-body").innerHTML = (p.about || []).map((t) => `<p>${esc(t)}</p>`).join("");

    document.getElementById("skills-body").innerHTML = (p.skills || []).map((g) => `
      <div class="skill-group">
        <h3>${esc(g.group)}</h3>
        <ul class="chips">${g.items.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
      </div>`).join("");

    document.getElementById("interests-body").innerHTML = (p.interests || []).map((i) => `
      <article class="interest"><h3>${esc(i.title)}</h3><p class="muted">${esc(i.text)}</p></article>`).join("");

    document.getElementById("favorites-body").innerHTML = (p.favorites || []).map((f) => `
      <div class="fav"><span class="kind">${esc(f.kind)}</span>
        <div><div class="title">${esc(f.title)}</div>${f.note ? `<div class="muted">${esc(f.note)}</div>` : ""}</div>
      </div>`).join("");

    document.getElementById("wishlist-body").innerHTML = (p.wishlist || []).map((w) => `
      <li class="${w.done ? "done" : ""}">
        <span class="box" role="img" aria-label="${w.done ? "Done" : "Not done yet"}"></span>
        <div><div class="wish-title">${esc(w.title)}</div>${w.note ? `<div class="muted">${esc(w.note)}</div>` : ""}</div>
      </li>`).join("");
  } catch (e) {
    console.error(e);
  }

  // "Latest in AI": five newest official updates.
  const list = document.getElementById("pulse-list");
  const updated = document.getElementById("pulse-updated");
  try {
    const [items, meta] = await Promise.all([loadJSON("data/ai/items.json"), loadJSON("data/ai/meta.json")]);
    const top = items.filter((x) => x.category === "official").slice(0, 5);
    updated.textContent = `Updated ${formatIST(meta.updated)} IST`;
    list.innerHTML = top.map((x) => `
      <li><a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener">${esc(x.title)}</a>
      <div class="meta">${esc(x.source)}, ${esc(timeAgo(x.published))}</div></li>`).join("");
  } catch (e) {
    updated.textContent = "The AI Hub has no data yet. It fills in after the first scheduled run.";
  }
})();
