// The interactive builder on the home page, after the "Make it yours" playbook:
// closed → lift the lid → tap or drag picks into the bowl → seal → stamp + thank-you.
// Picks come from "picks" in content/profile.json.

(function () {
  const proto = document.getElementById("proto");
  const wrap = document.getElementById("proto-wrap");
  if (!proto) return;

  const $ = (id) => document.getElementById(id);
  const tray = $("tray"), piecesBox = $("pieces"), vessel = $("vessel"), lid = $("lid");
  const lines = $("lines"), total = $("total"), say = $("say"), undoBtn = $("undo");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let PICKS = [];
  let picked = [];          // ids, in the order added
  const history = [];       // {op: "add"|"remove", id}
  let scale = 1, tempMsg = null, tempTimer = null;

  // ───────── layout: a fixed canvas scaled to fit, like a slide ─────────
  function fit() {
    const w = wrap.clientWidth;
    const tall = w < 760;
    proto.classList.toggle("tall", tall);
    const W = tall ? 430 : 1200, H = tall ? 1220 : 700;
    scale = Math.min(1, w / W);
    proto.style.transform = `scale(${scale})`;
    wrap.style.height = H * scale + "px";
    if (tall) proto.style.marginLeft = Math.max(0, (w - W * scale) / 2) + "px";
    else proto.style.marginLeft = "0";
    layoutPieces();
  }
  addEventListener("resize", fit);

  // ───────── seeded scatter, so the same pick always makes the same pile ─────────
  function rng(seed) {
    let s = 0; for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }
  function pieceEl(pick, r) {
    const el = document.createElement("span");
    el.className = "pc" + (pick.shape === "round" ? " round" : pick.shape === "leaf" ? " leaf" : "");
    const size = { cube: [18, 18], round: [15, 15], leaf: [28, 12], strip: [30, 5] }[pick.shape] || [18, 18];
    el.style.width = size[0] + "px"; el.style.height = size[1] + "px";
    el.style.background = pick.color;
    el.dataset.rot = Math.round(r() * 360);
    return el;
  }
  function slotPoints(index, n, size, r) {
    const R = size / 2, pts = [];
    let guard = 0;
    while (pts.length < n && guard++ < 600) {
      let ang, rad;
      if (index >= 6) { ang = r() * Math.PI * 2; rad = Math.sqrt(r()) * R * 0.3; }
      else { ang = ((index * 60 + 6 + r() * 48) - 90) * Math.PI / 180; rad = R * (0.42 + r() * 0.46); }
      const x = R + Math.cos(ang) * rad, y = R + Math.sin(ang) * rad;
      if (pts.every((p) => Math.hypot(p.x - x, p.y - y) > 13)) pts.push({ x, y });
    }
    return pts;
  }

  // ───────── tray ─────────
  function renderTray() {
    tray.innerHTML = "";
    PICKS.forEach((pick) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "tub"; b.dataset.id = pick.id;
      b.setAttribute("aria-pressed", "false");
      b.setAttribute("aria-label", `${pick.name}, ${pick.value}`);
      b.innerHTML = `<span class="pot"></span><span class="tag">${esc(pick.name)} <span class="v" style="opacity:.7">${esc(pick.value)}</span></span><span class="tub-tick" aria-hidden="true"></span>`;
      const pot = b.querySelector(".pot"), r = rng(pick.id + "tub");
      for (let i = 0; i < 16; i++) {
        const el = pieceEl(pick, r);
        el.style.left = 8 + r() * 70 + "%"; el.style.top = 10 + r() * 66 + "%";
        el.style.transform = `translate(-50%,-50%) rotate(${el.dataset.rot}deg)`;
        pot.appendChild(el);
      }
      tray.appendChild(b);
    });
  }

  // ───────── bowl ─────────
  function layoutPieces() {
    const size = piecesBox.clientWidth || 360;
    piecesBox.querySelectorAll(".pc").forEach((el) => {
      const pts = slotPoints(+el.dataset.slot, +el.dataset.n, size, rng(el.dataset.pick + "bowl"));
      const p = pts[+el.dataset.i] || { x: size / 2, y: size / 2 };
      el.style.left = p.x + "px"; el.style.top = p.y + "px";
    });
  }
  function tubCenterIn(box, id) {
    const pot = tray.querySelector(`[data-id="${id}"] .pot`);
    const a = pot.getBoundingClientRect(), b = box.getBoundingClientRect();
    return { x: (a.left + a.width / 2 - b.left) / scale, y: (a.top + a.height / 2 - b.top) / scale };
  }
  function addPieces(id, from) {
    const pick = PICKS.find((p) => p.id === id);
    const slot = PICKS.indexOf(pick), size = piecesBox.clientWidth;
    const r = rng(id + "bowl"), n = pick.shape === "strip" ? 14 : 11;
    const pts = slotPoints(slot, n, size, r);
    const src = from || tubCenterIn(piecesBox, id);
    pts.forEach((p, i) => {
      const el = pieceEl(pick, r);
      Object.assign(el.dataset, { pick: id, slot, n: pts.length, i });
      el.style.left = p.x + "px"; el.style.top = p.y + "px";
      const rot = `rotate(${el.dataset.rot}deg)`;
      el.style.transform = `translate(-50%,-50%) ${rot}`;
      piecesBox.appendChild(el);
      if (reduce) return;
      el.animate([
        { transform: `translate(calc(-50% + ${src.x - p.x}px), calc(-50% + ${src.y - p.y}px)) ${rot} scale(.8)` },
        { transform: `translate(calc(-50% + ${(src.x - p.x) * 0.45}px), calc(-50% + ${(src.y - p.y) * 0.45 - 70}px)) ${rot} scale(1.34)`, offset: 0.55 },
        { transform: `translate(-50%,-50%) ${rot} scale(.93)`, offset: 0.85 },
        { transform: `translate(-50%,-50%) ${rot} scale(1)` },
      ], { duration: 660, delay: i * 14, easing: "cubic-bezier(.3,.7,.4,1)", fill: "backwards" });
    });
  }
  function removePieces(id) {
    const dst = tubCenterIn(piecesBox, id);
    piecesBox.querySelectorAll(`.pc[data-pick="${id}"]`).forEach((el, i) => {
      if (reduce) return el.remove();
      const x = parseFloat(el.style.left), y = parseFloat(el.style.top), rot = `rotate(${el.dataset.rot}deg)`;
      el.animate([
        { transform: `translate(-50%,-50%) ${rot}` },
        { transform: `translate(calc(-50% + ${dst.x - x}px), calc(-50% + ${dst.y - y}px)) ${rot} scale(.6)`, opacity: 0 },
      ], { duration: 420, delay: i * 10, easing: "ease-in" }).onfinish = () => el.remove();
    });
  }

  // ───────── state ─────────
  function hint() {
    if (tempMsg) return tempMsg;
    if (proto.dataset.state === "closed") return "Lift the lid to start.";
    if (proto.dataset.state === "done") return "Sealed. Thanks for stopping by.";
    const n = picked.length;
    if (!n) return `Start with ${PICKS[0] ? PICKS[0].name : "anything"}. Tap a tub, or drag it in.`;
    if (n === PICKS.length) return "One very good portfolio. Seal it when you're ready.";
    if (n <= 2) return "Nice. Now the data tools.";
    if (!picked.includes("aihub") && PICKS.some((p) => p.id === "aihub")) return "Add the AI Hub for the daily news.";
    return "Looking good. Add more, or seal it.";
  }
  function flashMsg(text) {
    tempMsg = text; clearTimeout(tempTimer);
    tempTimer = setTimeout(() => { tempMsg = null; render(); }, 1900);
  }
  function render(newId) {
    tray.querySelectorAll(".tub").forEach((b) => b.setAttribute("aria-pressed", picked.includes(b.dataset.id)));
    lines.innerHTML = picked.map((id) => {
      const p = PICKS.find((x) => x.id === id);
      return `<li class="${id === newId ? "flash" : ""}"><span>${esc(p.name)}</span><span>${esc(p.value)}</span></li>`;
    }).join("") || `<li style="color:var(--muted)"><span>Nothing yet</span><span></span></li>`;
    total.textContent = `${picked.length} of ${PICKS.length}`;
    say.textContent = hint();
    undoBtn.disabled = !history.length || proto.dataset.state !== "building";
  }

  function toggle(id, from, record = true) {
    if (proto.dataset.state !== "building") return;
    const pick = PICKS.find((p) => p.id === id);
    if (picked.includes(id)) {
      picked = picked.filter((x) => x !== id);
      removePieces(id);
      if (record) history.push({ op: "remove", id });
      flashMsg(`${pick.name} removed.`);
      render();
    } else {
      picked.push(id);
      addPieces(id, from);
      if (record) history.push({ op: "add", id });
      flashMsg(`${pick.name} added.`);
      render(id);
    }
  }
  function undo() {
    const last = history.pop();
    if (!last) return;
    toggle(last.id, null, false);
    flashMsg("Undone.");
    render();
  }

  function open() {
    if (proto.dataset.state !== "closed") return;
    const done = () => { lid.hidden = true; proto.dataset.state = "building"; render(); };
    if (reduce) return done();
    proto.dataset.state = "building";
    lid.animate([
      { transform: "none", opacity: 1 },
      { transform: "translateY(-30px) scale(1.07)", opacity: 1, offset: 0.28 },
      { transform: "translate(420px,-460px) rotate(26deg) scale(1.07)", opacity: 0 },
    ], { duration: 1050, easing: "cubic-bezier(.5,0,.3,1)" }).onfinish = done;
  }
  function seal() {
    if (!picked.length) { flashMsg("Pick at least one thing first."); render(); return; }
    lid.hidden = false;
    lid.setAttribute("aria-label", "Sealed");
    proto.dataset.state = "done";
    if (!reduce) lid.animate([
      { transform: "translateY(-140px) scale(1.1)", opacity: 0 },
      { transform: "translateY(0) scale(1.04, .94)", opacity: 1, offset: 0.7 },
      { transform: "none", opacity: 1 },
    ], { duration: 520, easing: "cubic-bezier(.3,.8,.4,1)" });
    render();
  }
  function again() {
    picked = []; history.length = 0; piecesBox.innerHTML = "";
    lid.hidden = true; lid.setAttribute("aria-label", "Lift the lid to start");
    proto.dataset.state = "building"; render();
  }

  // ───────── drag a handful in ─────────
  let drag = null;
  tray.addEventListener("pointerdown", (e) => {
    const b = e.target.closest(".tub"); if (!b || proto.dataset.state !== "building") return;
    drag = { id: b.dataset.id, x: e.clientX, y: e.clientY, moved: false, ghost: null };
  });
  addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
    if (!drag.moved) {
      drag.moved = true;
      const pick = PICKS.find((p) => p.id === drag.id);
      if (picked.includes(drag.id)) { drag = null; return; }
      drag.ghost = document.createElement("div");
      drag.ghost.style.cssText = "position:fixed;z-index:99;pointer-events:none;width:60px;height:60px;transform:translate(-50%,-50%)";
      const r = rng(drag.id + "ghost");
      for (let i = 0; i < 7; i++) {
        const el = pieceEl(pick, r);
        el.style.left = 10 + r() * 40 + "px"; el.style.top = 10 + r() * 40 + "px";
        el.style.transform = `rotate(${el.dataset.rot}deg)`;
        drag.ghost.appendChild(el);
      }
      document.body.appendChild(drag.ghost);
    }
    drag.ghost.style.left = e.clientX + "px"; drag.ghost.style.top = e.clientY + "px";
    vessel.classList.toggle("ring", overVessel(e));
  });
  addEventListener("pointerup", (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    vessel.classList.remove("ring");
    if (!d.moved) return;
    d.ghost.remove();
    if (overVessel(e)) {
      const b = piecesBox.getBoundingClientRect();
      toggle(d.id, { x: (e.clientX - b.left) / scale, y: (e.clientY - b.top) / scale });
    }
    d.suppressClick = true;
    suppress = true; setTimeout(() => (suppress = false), 0);
  });
  let suppress = false;
  function overVessel(e) {
    const r = vessel.getBoundingClientRect();
    return Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) < r.width / 2;
  }

  // ───────── wire up ─────────
  tray.addEventListener("click", (e) => {
    if (suppress) return;
    const b = e.target.closest(".tub"); if (!b) return;
    if (!picked.includes(b.dataset.id) && picked.length >= PICKS.length) { b.classList.add("full"); setTimeout(() => b.classList.remove("full"), 400); return; }
    toggle(b.dataset.id);
  });
  proto.querySelectorAll("[data-open]").forEach((el) => el.addEventListener("click", open));
  $("seal").addEventListener("click", seal);
  $("again").addEventListener("click", again);
  undoBtn.addEventListener("click", undo);
  addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && proto.dataset.state === "building" && !/input|textarea/i.test(e.target.tagName)) {
      e.preventDefault(); undo();
    }
  });

  function start(profile) {
    PICKS = (profile && profile.picks) || [];
    renderTray(); fit(); render();
  }
  if (window.PROFILE) start(window.PROFILE);
  else document.addEventListener("profile-ready", (e) => start(e.detail), { once: true });
  fit();
})();
