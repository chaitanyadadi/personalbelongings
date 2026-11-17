// Home page: fills the playbook-style sections from content/profile.json.
// The interactive builder at the top lives in assets/builder.js.

const PROJECT_ART = {
  site: `<div style="width:62%;height:62%;background:#fffdf8;border-radius:8px;box-shadow:0 8px 18px -8px rgba(60,40,20,.4);padding:10px;display:flex;flex-direction:column;gap:6px">
           <div style="font-family:var(--font-logo);color:var(--teal);font-size:16px">chaitanya</div>
           <div style="height:8px;width:70%;background:var(--teal);border-radius:2px"></div>
           <div style="height:6px;width:90%;background:#e6ddcf;border-radius:2px"></div>
           <div style="height:6px;width:60%;background:#e6ddcf;border-radius:2px"></div>
           <div style="margin-top:auto;width:42%;height:16px;background:var(--coral);border-radius:999px"></div></div>`,
  hub: `<div style="width:50%;height:74%;background:#fffdf8;transform:rotate(3deg);box-shadow:0 8px 18px -8px rgba(60,40,20,.4);padding:10px;font-family:var(--font-mono);font-size:9px;color:var(--ink);display:flex;flex-direction:column;gap:4px">
           <div style="font-family:var(--font-logo);color:var(--teal);font-size:14px;text-align:center">ai hub</div>
           <div style="display:flex;justify-content:space-between"><span>Official</span><span>16</span></div>
           <div style="display:flex;justify-content:space-between;background:var(--highlight)"><span>Headlines</span><span>10</span></div>
           <div style="display:flex;justify-content:space-between"><span>Research</span><span>6</span></div>
           <div style="display:flex;justify-content:space-between"><span>Market</span><span>3</span></div>
           <div style="margin-top:auto;height:14px;background:repeating-linear-gradient(90deg,var(--ink) 0 2px,transparent 2px 4px)"></div></div>`,
  report: `<div style="width:66%;height:62%;background:#fffdf8;border-radius:8px;box-shadow:0 8px 18px -8px rgba(60,40,20,.4);padding:10px;display:flex;align-items:flex-end;gap:6px">
           <div style="flex:1;height:35%;background:var(--c-salmon);border-radius:2px"></div><div style="flex:1;height:60%;background:var(--c-mango);border-radius:2px"></div>
           <div style="flex:1;height:48%;background:var(--c-avocado);border-radius:2px"></div><div style="flex:1;height:80%;background:var(--teal);border-radius:2px"></div>
           <div style="flex:1;height:66%;background:var(--coral);border-radius:2px"></div></div>`,
};

(async function () {
  let p;
  try { p = await loadJSON("content/profile.json"); } catch (e) { console.error(e); return; }
  window.PROFILE = p;
  document.dispatchEvent(new CustomEvent("profile-ready", { detail: p }));

  if (p.lead) document.getElementById("lead").textContent = p.lead;
  document.getElementById("about-lead").innerHTML = (p.about || []).map((t) => `<p>${esc(t)}</p>`).join("");

  document.getElementById("strengths").innerHTML = (p.strengths || []).map((s, i) => `
    <li><span class="num">${i + 1}</span><div><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div></li>`).join("");

  document.querySelector("#skills-table tbody").innerHTML = (p.skills || []).map((s) => `
    <tr><td>${esc(s.area)}</td><td>${esc(Array.isArray(s.items) ? s.items.join(", ") : s.items)}</td><td>${esc(s.level || "")}</td></tr>`).join("");

  const projects = (p.projects || []).map((pr, i) => `
    <article class="beat">
      <div class="shot">${PROJECT_ART[pr.art] || PROJECT_ART.report}</div>
      <div class="head"><span class="num">${i + 1}</span><h3>${pr.link ? `<a href="${esc(safeUrl(new URL(pr.link, location.href).href))}">${esc(pr.title)}</a>` : esc(pr.title)}</h3></div>
      <p>${esc(pr.text)}</p>
    </article>`);
  projects.push(`<div class="panel-teal"><h3>Built in public</h3><p><b>Plan</b> it in a chat. <b>Ship</b> it on GitHub. <b>Improve</b> it every week. The code for this site is open on GitHub.</p></div>`);
  document.getElementById("projects-grid").innerHTML = projects.join("");

  document.getElementById("interests").innerHTML = (p.interests || []).map((it) => `
    <li><b>${esc(it.title)}.</b> ${esc(it.text)}</li>`).join("");

  document.getElementById("favorites").innerHTML = (p.favorites || []).map((f) => `
    <div class="fav"><div class="k">${esc(f.kind)}</div><div class="n">${esc(f.title)}</div>${f.note ? `<div class="d">${esc(f.note)}</div>` : ""}</div>`).join("");

  document.getElementById("wishlist-list").innerHTML = (p.wishlist || []).map((w) => `
    <li class="${w.done ? "done" : ""}"><span class="box" role="img" aria-label="${w.done ? "Done" : "Not done yet"}"></span>
      <div><div class="t"><b>${esc(w.title)}</b></div>${w.note ? `<div class="note">${esc(w.note)}</div>` : ""}</div></li>`).join("");

  document.getElementById("contact-links").innerHTML = (p.links || [])
    .map((l) => `<a href="${esc(safeUrl(l.url))}" rel="me noopener" target="_blank">${esc(l.label)} ↗</a>`).join("");
})();
