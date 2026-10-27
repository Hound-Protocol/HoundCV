/* HoundCV editor: Simple and Advanced mode over one shared document (see hcv-core.js).
   Advanced mode: grab "New block" / "New divider" (or a placed block), pull it on its cord, drop it into a zone. */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = HCV.esc, T = HCV.TYPES;
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- State ---------- */
  const saved = HCV.load();
  let doc = saved || HCV.defaultDoc();
  let sel = null, tab = "doc", zoom = 1, zoomT = 1, fitMode = true, openC = null;
  const qMode = new URLSearchParams(location.search).get("mode");
  let mode = qMode === "simple" || qMode === "advanced" ? qMode : (localStorage.getItem("houndcv.mode") || "advanced");
  const hist = { s: [], i: -1 };
  let saveT, histT;
  const host = $("#page-host"), stage = $("#stage"), tabbody = $("#tabbody");
  const mmPx = () => HCV.MM_PX * zoom;
  const pageEl = () => $(".page", host);
  const blk = (id) => doc.blocks.find((b) => b.id === id);

  /* ---------- History, save, status ---------- */
  function snapshot() {
    const s = JSON.stringify(doc); if (hist.s[hist.i] === s) return;
    hist.s = hist.s.slice(0, hist.i + 1); hist.s.push(s); if (hist.s.length > 100) hist.s.shift();
    hist.i = hist.s.length - 1; updUndo();
  }
  function updUndo() { $("#undo").disabled = hist.i <= 0; $("#redo").disabled = hist.i >= hist.s.length - 1; }
  function setStatus(t, saving) { const s = $("#status"); s.textContent = t; s.classList.toggle("saving", !!saving); }
  function saveSoon() { setStatus("Saving…", true); clearTimeout(saveT); saveT = setTimeout(() => setStatus(HCV.save(doc) ? "Saved" : "Not saved", false), 350); }
  function undo(d) {
    const i = hist.i + d; if (i < 0 || i >= hist.s.length) return;
    hist.i = i; doc = JSON.parse(hist.s[i]); if (!blk(sel)) sel = null;
    HCV.save(doc); setStatus("Saved"); updUndo(); renderAll();
  }
  function commit(keepPanel) { HCV.settle(doc); snapshot(); saveSoon(); renderStage(); if (!keepPanel) { renderLeft(); renderPanel(); } else updBadge(); }
  function touch() { saveSoon(); clearTimeout(histT); histT = setTimeout(snapshot, 700); renderStage(); }
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 3200); }

  /* ---------- Page rendering & smooth zoom ---------- */
  const fitZoom = () => clamp(Math.min((stage.clientWidth - 56) / (doc.page.w * HCV.MM_PX), (stage.clientHeight - 56) / (doc.page.h * HCV.MM_PX)), 0.35, 1.6);
  function renderStage() {
    if (fitMode) { zoom = zoomT = fitZoom(); }
    HCV.renderPage(doc, host, { interactive: mode === "advanced", mm: mmPx().toFixed(5) + "px" });
    zlabel(); drawSel(); updBadge();
  }
  const zlabel = () => { $("#zfit").textContent = Math.round(zoom * 100) + "%"; };
  let zAnim = 0, zLast = 0, zAnchor = null;
  function applyZoom(nz) {
    const p = pageEl(); if (!p) { zoom = nz; return; }
    const a = zAnchor || (() => { const r = stage.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })();
    let r = p.getBoundingClientRect(); const ux = (a.x - r.left) / mmPx(), uy = (a.y - r.top) / mmPx();
    zoom = nz; p.style.setProperty("--mm", mmPx().toFixed(5) + "px");
    r = p.getBoundingClientRect(); stage.scrollLeft += r.left + ux * mmPx() - a.x; stage.scrollTop += r.top + uy * mmPx() - a.y; zlabel();
  }
  function zoomTo(z, anchor, instant) {
    zoomT = clamp(z, 0.3, 2.5); zAnchor = anchor || null;
    if (instant || reduce) { applyZoom(zoomT); return; }
    if (!zAnim) { zLast = performance.now(); zAnim = requestAnimationFrame(zStep); }
  }
  function zStep(ts) {
    const dt = Math.min(0.05, (ts - zLast) / 1000); zLast = ts;
    let nz = zoom + (zoomT - zoom) * (1 - Math.exp(-dt * 11)); if (Math.abs(zoomT - nz) < 0.0006) nz = zoomT;
    applyZoom(nz); zAnim = nz === zoomT ? 0 : requestAnimationFrame(zStep);
  }
  const zoomBy = (f, a) => { fitMode = false; zoomTo(zoomT * f, a); };
  $("#zin").onclick = () => zoomBy(1.2); $("#zout").onclick = () => zoomBy(1 / 1.2);
  $("#zfit").onclick = () => { fitMode = true; zoomTo(fitZoom()); };
  stage.addEventListener("wheel", (e) => {
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    const dy = clamp(e.deltaY * (e.deltaMode === 1 ? 33 : 1), -120, 120);
    zoomBy(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0016)), { x: e.clientX, y: e.clientY });
  }, { passive: false });
  addEventListener("resize", () => { if (fitMode) { zoomTo(fitZoom(), null, true); zoomT = zoom; } });

  function drawSel() { $$(".zb.sel", host).forEach((e) => e.classList.remove("sel")); const el = sel && $(`.zb[data-id="${sel}"]`, host); if (el && mode === "advanced") el.classList.add("sel"); }
  function select(id) {
    sel = id; drawSel();
    if (id && mode === "advanced") { tab = "block"; renderPanel(); } else if (!id && tab === "block") { tab = "doc"; renderPanel(); }
  }

  /* ---------- Block operations ---------- */
  function addBlock(type, zone, index) {
    const b = HCV.newBlock(type, { order: 1e6 }, doc.template); doc.blocks.push(b);
    HCV.placeBlock(doc, b, zone || HCV.defaultZone(type, doc.template), index == null ? 1e6 : index);
    sel = b.id; tab = "block"; commit(); return b;
  }
  function delBlock(id) { doc.blocks = doc.blocks.filter((b) => b.id !== id); if (sel === id) sel = null; if (tab === "block") tab = "doc"; commit(); }
  function dupBlock(id) {
    const b = blk(id), c = HCV.newBlock(b.type, Object.assign({}, b, { id: HCV.uid(), order: b.order + 0.5 }), doc.template);
    doc.blocks.push(c); sel = c.id; commit();
  }
  function setType(b, t) {
    const was = T[b.type].def;
    b.type = t; if ((!b.title || b.title === was.title) && T[t].def.title !== undefined) b.title = T[t].def.title || "";
    if (!T[t].decorative && !(b.text || "").trim()) b.text = T[t].def.text || "";
    if (T[t].decorative) b.text = "";
    if (!b.zone) b.zone = HCV.defaultZone(t, doc.template);
    if (t === "line") b.frame = "none"; commit();
  }
  const moveToZone = (b, z) => { HCV.placeBlock(doc, b, z, 1e6); commit(); };

  /* ---------- Drag with string physics ---------- */
  let drag = null;
  const zoneEls = () => $$(".zone", host);
  function zoneAt(x, y) {
    let best = null, bd = 1e9;
    zoneEls().forEach((z) => {
      const r = z.getBoundingClientRect(), dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom), d = Math.hypot(dx, dy);
      if (d < bd) { bd = d; best = z; }
    });
    return bd <= 14 ? best : null;
  }
  function slotIndex(z, x, y) {
    const row = z.dataset.dir === "row", kids = $$(".zb:not(.lift):not(.gs)", z), g = $(".gs", z);
    if (g) { const r = g.getBoundingClientRect(); if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return g.__i; }
    let i = 0; kids.forEach((k) => { const r = k.getBoundingClientRect(); if ((row ? x : y) > (row ? r.left + r.width / 2 : r.top + r.height / 2)) i++; });
    return i;
  }
  function showGhost(z, i) {
    const g = $(".gs", host);
    if (g && g.parentNode === z && g.__i === i) return;
    if (g) g.remove();
    if (!z) return;
    const kids = $$(".zb:not(.lift):not(.gs)", z), n = document.createElement("div");
    n.className = "blk zb gs"; n.__i = i; n.style.flex = "0.001 1 0%";
    z.insertBefore(n, kids[i] || $(".zl", z) || null);
    requestAnimationFrame(() => requestAnimationFrame(() => { n.style.flex = "1 1 auto"; }));
  }
  function startDrag(e, o) {
    /* o: { kind: 'new'|'move', el (source element), label, type, block } */
    if (drag) return;
    const r = o.el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let fly = document.createElement("div");
    if (o.kind === "new") { fly = o.el.cloneNode(true); fly.className = "src fly"; fly.style.width = r.width + "px"; fly.style.height = r.height + "px"; }
    else { fly.className = "chipflying"; fly.textContent = o.label; }
    document.body.appendChild(fly);
    const w = fly.offsetWidth, h = fly.offsetHeight;
    fly.style.left = cx - w / 2 + "px"; fly.style.top = cy - h / 2 + "px";
    const body = HCVPhys.add({ el: fly, bx: cx, by: cy, ox: cx, oy: cy });
    const off = { x: cx - e.clientX, y: cy - e.clientY };
    drag = { o, fly, body, off, zone: null, idx: 0, sx: e.clientX, sy: e.clientY, moved: false, cx, cy };
    body.tx = e.clientX + off.x; body.ty = e.clientY + off.y;
    o.el.classList.add(o.kind === "new" ? "out" : "lift");
    if (o.kind === "move") document.body.classList.add("dragging-placed");
    const p = pageEl(); if (p) p.classList.add("dragging");
    addEventListener("pointermove", dMove); addEventListener("pointerup", dUp); addEventListener("pointercancel", dUp);
    dMove(e);
  }
  function dMove(e) {
    if (!drag) return; if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) drag.moved = true;
    drag.body.tx = e.clientX + drag.off.x; drag.body.ty = e.clientY + drag.off.y;
    const left = $("#left").getBoundingClientRect(), overLeft = e.clientX < left.right && drag.o.kind === "move";
    $("#trash").classList.toggle("hot", overLeft);
    const z = overLeft ? null : zoneAt(e.clientX, e.clientY);
    $$(".zone", host).forEach((el) => el.classList.toggle("hot", el === z));
    drag.zone = z; drag.trash = overLeft;
    if (z) { drag.idx = slotIndex(z, e.clientX, e.clientY); showGhost(z, drag.idx); } else showGhost(null);
  }
  function endDrag() {
    removeEventListener("pointermove", dMove); removeEventListener("pointerup", dUp); removeEventListener("pointercancel", dUp);
    document.body.classList.remove("dragging-placed"); $("#trash").classList.remove("hot");
    const p = pageEl(); if (p) p.classList.remove("dragging"); $$(".zone.hot", host).forEach((z) => z.classList.remove("hot"));
    drag = null;
  }
  function dUp() {
    const d = drag; if (!d) return;
    const gs = $(".gs", host), zone = d.zone && d.zone.dataset.zone, idx = d.idx, o = d.o;
    const finish = (fn) => { d.fly.remove(); showGhost(null); $$(".lift", host).forEach((x) => x.classList.remove("lift")); o.el.classList.remove("out", "lift"); endDrag(); if (fn) fn(); };
    if (!d.moved) {   // a plain click
      HCVPhys.remove(d.body); finish(() => { if (o.kind === "new") { addBlock(o.type); } else select(o.block.id); }); return;
    }
    if (d.trash) { HCVPhys.remove(d.body); finish(() => { delBlock(o.block.id); toast("Block removed. Ctrl+Z brings it back."); }); return; }
    if (zone && gs) {
      const gr = gs.getBoundingClientRect();
      HCVPhys.setMode(d.body, "fly", gr.left + gr.width / 2, gr.top + gr.height / 2, () => finish(() => {
        if (o.kind === "new") addBlock(o.type, zone, idx);
        else { HCV.placeBlock(doc, o.block, zone, idx); sel = o.block.id; tab = "block"; commit(); }
      }));
      d.fly.style.transition = "opacity .2s"; d.fly.style.opacity = ".15";
      return;
    }
    HCVPhys.setMode(d.body, "back", d.cx, d.cy, () => finish());
    showGhost(null);
  }
  $("#toolbox").addEventListener("pointerdown", (e) => {
    const s = e.target.closest(".src"); if (!s || e.button !== 0) return; e.preventDefault();
    startDrag(e, { kind: "new", el: s, type: s.dataset.src === "divider" ? "line" : "text" });
  });
  $("#toolbox").addEventListener("keydown", (e) => { const s = e.target.closest(".src"); if (s && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); addBlock(s.dataset.src === "divider" ? "line" : "text"); } });
  host.addEventListener("pointerdown", (e) => {
    if (mode !== "advanced" || e.button !== 0) return; hideCtx();
    const el = e.target.closest(".zb"); if (!el) { select(null); return; }
    const b = blk(el.dataset.id); select(b.id); if (b.locked) return;
    e.preventDefault();
    startDrag(e, { kind: "move", el, label: HCV.label(b), block: b });
  });

  /* ---------- Context menu ---------- */
  const ctx = $("#ctx");
  function hideCtx() { ctx.hidden = true; }
  host.addEventListener("contextmenu", (e) => {
    if (mode !== "advanced") return;
    const el = e.target.closest(".zb"); if (!el) return;
    e.preventDefault(); const b = blk(el.dataset.id); select(b.id);
    const z = HCV.zoneOf(doc, b), zs = HCV.zoneIds(doc);
    ctx.innerHTML = `<div class="cm-h">Type</div><div class="tgrid">${Object.keys(T).map((k) => `<button class="${k === b.type ? "on" : ""}" data-type="${k}">${HCV.icon(k, 16)}${T[k].label}</button>`).join("")}</div>
      <div class="cm-h">Frame</div><div class="chipset">${Object.entries(HCV.FRAMES).map(([k, l]) => `<button class="chipb${k === b.frame ? " on" : ""}" data-frame="${k}">${l}</button>`).join("")}</div>
      <div class="cm-h">Area</div><div class="chipset">${zs.map((k) => `<button class="chipb${k === z ? " on" : ""}" data-zone="${k}">${HCV.ZONES[k].label}</button>`).join("")}</div><hr>
      <button class="act" data-act="grow">Give it more space</button><button class="act" data-act="shrink">Give it less space</button>
      <button class="act" data-act="dup">Duplicate</button><button class="act" data-act="lock">${b.locked ? "Unlock" : "Lock"} position</button><hr><button class="act" data-act="del">Delete</button>`;
    ctx.hidden = false;
    ctx.style.left = Math.min(e.clientX, innerWidth - 274) + "px"; ctx.style.top = Math.max(8, Math.min(e.clientY, innerHeight - ctx.offsetHeight - 10)) + "px";
    ctx.onclick = (ev) => {
      const t = ev.target.closest("button"); if (!t) return;
      if (t.dataset.type) setType(b, t.dataset.type);
      else if (t.dataset.frame) { b.frame = t.dataset.frame; commit(); }
      else if (t.dataset.zone) moveToZone(b, t.dataset.zone);
      else { const a = t.dataset.act;
        if (a === "dup") dupBlock(b.id); else if (a === "del") delBlock(b.id); else if (a === "lock") { b.locked = !b.locked; commit(); }
        else if (a === "grow") { b.weight = Math.min(6, +(b.weight + 0.5).toFixed(1)); commit(); } else if (a === "shrink") { b.weight = Math.max(0.5, +(b.weight - 0.5).toFixed(1)); commit(); } }
      hideCtx();
    };
  });
  addEventListener("pointerdown", (e) => { if (!ctx.hidden && !ctx.contains(e.target)) hideCtx(); });
  addEventListener("scroll", hideCtx, true);

  /* ---------- Right panel ---------- */
  function setTabs() { $$("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab)); }
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; tab = b.dataset.tab; renderPanel(); });
  const field = (label, html) => `<div class="fld"><label>${label}</label>${html}</div>`;
  const opts = (o, cur) => Object.entries(o).map(([k, v]) => `<option value="${k}"${k === cur ? " selected" : ""}>${v}</option>`).join("");
  function renderPanel() {
    if (tab === "block" && (!blk(sel) || mode !== "advanced")) tab = "doc";
    if (mode === "simple" && tab === "order") tab = "doc";
    setTabs(); tabbody.style.animation = "none"; void tabbody.offsetWidth; tabbody.style.animation = "";
    tabbody.oninput = tabbody.onchange = tabbody.onclick = null;
    ({ doc: panelDoc, block: panelBlock, order: panelOrder, done: panelDone })[tab]();
  }

  const PAL = ["#ffffff", "#f2f2f2", "#bdbdbd", "#8a8a8a", "#3a3a3a", "#1b1b1b", "#121212", "#000000", "#ff7a1a", "#ffb15e", "#e24a1a", "#c1b56a", "#6fa86f", "#4aa3c7", "#6b7ce0", "#c46bd6"];
  function colorField(key, label) {
    const v = doc.theme[key], open = openC === key;
    return `<div class="cdrop${open ? " open" : ""}" data-key="${key}"><button type="button" data-ct="${key}"><i class="sw" style="background:${v}"></i>${label}<span class="hx">${v}</span><span class="chev">▾</span></button>
      <div class="cbody"><div><div class="cin"><div class="pal">${PAL.map((c) => `<button type="button" data-cv="${c}" class="${c.toLowerCase() === v.toLowerCase() ? "on" : ""}" style="background:${c}" aria-label="${c}"></button>`).join("")}</div>
      <input type="text" data-hex="${key}" value="${v}" maxlength="7" spellcheck="false" aria-label="${label} hex colour"></div></div></div></div>`;
  }
  function panelDoc() {
    const t = doc.theme, p = doc.page;
    tabbody.innerHTML = `
      <div class="fld"><label>Look</label><div class="skins">${Object.entries(HCV.SKINS).map(([k, s]) => `<button class="skin${t.skin === k ? " on" : ""}" data-skin="${k}"><i style="background:linear-gradient(90deg,${s.bg} 55%,${s.accent} 55%);border:1px solid ${s.line}"></i>${s.label}</button>`).join("")}</div></div>
      <div class="fld"><label>Colours</label>${colorField("bg", "Page")}${colorField("text", "Text")}${colorField("muted", "Soft text")}${colorField("accent", "Accent")}</div>
      ${field("Font", `<select id="d-font">${opts({ sans: "Sans", serif: "Serif", mono: "Mono", condensed: "Condensed" }, t.font)}</select>`)}
      <div class="sep">Layout</div>
      <div class="fld"><label>Template</label><div class="chipset">${Object.entries(HCV.TEMPLATES).map(([k, v]) => `<button class="chipb${doc.template === k ? " on" : ""}" data-tpl="${k}">${v.label}</button>`).join("")}</div></div>
      <div class="adv-only">
        <div class="fld"><label>Space in an area</label><div class="chipset"><button class="chipb${doc.fill === "fill" ? " on" : ""}" data-fill="fill">Fit to content</button><button class="chipb${doc.fill === "equal" ? " on" : ""}" data-fill="equal">Equal parts</button></div></div>
        <div class="row2">${field("Column split (%)", `<input type="number" id="d-split" min="20" max="60" step="2" value="${doc.split}">`)}${field("Gap (mm)", `<input type="number" id="d-gap" min="0" max="12" step="1" value="${p.gap}">`)}</div>
        <div class="sep">Page</div>
        ${field("Background pattern", `<select id="d-pat">${opts({ none: "None", grid: "Grid", lines: "Lines", dots: "Dots" }, p.pattern)}</select>`)}
        <div class="row2">${field("Frame", `<select id="d-frame">${opts({ none: "None", thin: "Thin", double: "Double", bracket: "Bracket" }, p.frame)}</select>`)}${field("Frame inset (mm)", `<input type="number" id="d-inset" min="2" max="20" value="${p.inset}">`)}</div>
        ${field("Safe zone (mm)", `<input type="number" id="d-safe" min="0" max="30" value="${p.safe}">`)}
        <div class="sep">Corner details</div><p class="note">Use {date}, {name} or {page}.</p>
        <div class="row2">${["tl", "tr", "bl", "br"].map((k) => field({ tl: "Top left", tr: "Top right", bl: "Bottom left", br: "Bottom right" }[k], `<input type="text" data-corner="${k}" value="${esc(p.corners[k])}">`)).join("")}</div>
      </div>`;
    tabbody.onclick = (e) => {
      const sk = e.target.closest("[data-skin]"), tp = e.target.closest("[data-tpl]"), fl = e.target.closest("[data-fill]"), ct = e.target.closest("[data-ct]"), cv = e.target.closest("[data-cv]");
      if (sk) { Object.assign(doc.theme, HCV.SKINS[sk.dataset.skin], { skin: sk.dataset.skin }); commit(); }
      else if (tp) { HCV.setTemplate(doc, tp.dataset.tpl); commit(); }
      else if (fl) { doc.fill = fl.dataset.fill; commit(); }
      else if (ct) { const k = ct.dataset.ct; openC = openC === k ? null : k; $$(".cdrop", tabbody).forEach((d) => d.classList.toggle("open", d.dataset.key === openC)); }
      else if (cv) { const k = cv.closest(".cdrop").dataset.key; setColor(k, cv.dataset.cv); }
    };
    tabbody.oninput = (e) => {
      const t2 = e.target;
      if (t2.dataset.hex) { let v = t2.value.trim(); if (v[0] !== "#") v = "#" + v; if (/^#[0-9a-f]{6}$/i.test(v)) setColor(t2.dataset.hex, v, t2); }
      else if (t2.dataset.corner) { doc.page.corners[t2.dataset.corner] = t2.value; touch(); }
    };
    tabbody.onchange = (e) => {
      const id = e.target.id, v = e.target.value;
      if (id === "d-font") doc.theme.font = v; else if (id === "d-pat") doc.page.pattern = v; else if (id === "d-frame") doc.page.frame = v;
      else if (id === "d-inset") doc.page.inset = clamp(+v || 6, 2, 20); else if (id === "d-safe") doc.page.safe = clamp(+v || 0, 0, 30);
      else if (id === "d-split") doc.split = clamp(+v || 38, 20, 60); else if (id === "d-gap") doc.page.gap = clamp(+v || 0, 0, 12);
      else { snapshot(); return; }
      commit(true);
    };
  }
  function setColor(k, v, keepInput) {
    doc.theme[k] = v; doc.theme.skin = "custom"; touch();
    const d = $(`.cdrop[data-key="${k}"]`, tabbody); if (!d) return;
    $(".sw", d).style.background = v; $(".hx", d).textContent = v; if (!keepInput) $("[data-hex]", d).value = v;
    $$("[data-cv]", d).forEach((b) => b.classList.toggle("on", b.dataset.cv.toLowerCase() === v.toLowerCase()));
    $$(".skin", tabbody).forEach((b) => b.classList.remove("on"));
  }

  function panelBlock() {
    const b = blk(sel), tp = T[b.type], z = HCV.zoneOf(doc, b);
    tabbody.innerHTML = `
      <div class="fld"><label>Type</label><div class="tgrid">${Object.keys(T).map((k) => `<button class="${k === b.type ? "on" : ""}" data-type="${k}">${HCV.icon(k, 17)}${T[k].label}</button>`).join("")}</div></div>
      ${tp.decorative ? "" : field("Heading", `<input type="text" id="f-title" value="${esc(b.title)}">`) + field("Content", `<textarea id="f-text" rows="9">${esc(b.text)}</textarea>`) + (tp.hint ? `<p class="note">${esc(tp.hint)}</p>` : "")}
      <div class="row2">${field("Frame", `<select id="f-frame">${opts(HCV.FRAMES, b.frame)}</select>`)}${tp.decorative ? "" : field("Text size (pt)", `<input type="number" id="f-fs" min="5" max="40" step="0.5" value="${b.fs}">`)}</div>
      <div class="fld"><label>Area</label><div class="chipset">${HCV.zoneIds(doc).map((k) => `<button class="chipb${k === z ? " on" : ""}" data-zone="${k}">${HCV.ZONES[k].label}</button>`).join("")}</div></div>
      ${field("Share of the area", `<select id="f-weight">${opts({ 0.5: "Half", 1: "Normal", 1.5: "1½×", 2: "Double", 3: "Triple" }, String(b.weight))}</select>`)}
      <div class="chipset" style="margin-bottom:12px"><button class="chipb${b.locked ? " on" : ""}" id="f-lock">${b.locked ? "Locked" : "Lock position"}</button></div>
      <button class="sbtn" id="f-dup">Duplicate</button><button class="sbtn danger" id="f-del">Delete block</button>`;
    tabbody.oninput = (e) => {
      const id = e.target.id;
      if (id === "f-title") { b.title = e.target.value; touch(); } else if (id === "f-text") { b.text = e.target.value; touch(); } else if (id === "f-fs") { b.fs = clamp(+e.target.value || 9.5, 5, 40); touch(); }
    };
    tabbody.onchange = (e) => {
      const id = e.target.id;
      if (id === "f-frame") { b.frame = e.target.value; commit(true); } else if (id === "f-weight") { b.weight = +e.target.value; commit(true); } else commit(true);
    };
    tabbody.onclick = (e) => {
      const id = e.target.id, ty = e.target.closest("[data-type]"), zn = e.target.closest("[data-zone]");
      if (ty) setType(b, ty.dataset.type); else if (zn) moveToZone(b, zn.dataset.zone);
      else if (id === "f-lock") { b.locked = !b.locked; commit(); } else if (id === "f-dup") dupBlock(b.id); else if (id === "f-del") delBlock(b.id);
    };
  }

  function panelOrder() {
    const list = HCV.ordered(doc);
    tabbody.innerHTML = `<p class="note">Applicant tracking systems read blocks in this order, not by where they sit on the page. It follows the areas: header, left, right, footer. The plain export uses it too.</p>
      <ol class="olist">${list.map((b, i) => { const z = HCV.zoneOf(doc, b), up = i > 0 && HCV.zoneOf(doc, list[i - 1]) === z, dn = i < list.length - 1 && HCV.zoneOf(doc, list[i + 1]) === z;
        return `<li data-id="${b.id}" class="${b.id === sel ? "sel" : ""}"><span class="n">${i + 1}</span><span class="t">${esc(HCV.label(b))}</span>${HCV.isDecor(b) ? '<span class="d">decor</span>' : ""}<button class="mini" data-m="-1"${up ? "" : " disabled"}>▲</button><button class="mini" data-m="1"${dn ? "" : " disabled"}>▼</button></li>`; }).join("")}</ol>`;
    tabbody.onclick = (e) => {
      const m = e.target.closest("[data-m]"), li = e.target.closest("li"); if (!li) return;
      if (!m) { select(li.dataset.id); return; }
      const i = list.findIndex((b) => b.id === li.dataset.id), j = i + +m.dataset.m; if (j < 0 || j >= list.length) return;
      const t = list[i].order; list[i].order = list[j].order; list[j].order = t; commit();
    };
  }

  /* ---------- Complete your CV ---------- */
  function panelDone() {
    const es = HCV.essentials(doc), n = es.filter((x) => x.done).length, res = HCV.check(doc, host).filter((r) => r.level !== "ok");
    tabbody.innerHTML = `<h3 class="lh" style="margin-top:2px">Complete your CV</h3><p class="note">${n} of ${es.length} essentials done. Each action adds or opens the part that is missing.</p>
      <div class="prog"><i style="width:${Math.round(n / es.length * 100)}%"></i></div>
      ${es.map((x) => `<div class="ess${x.done ? " done" : ""}"><span class="ck">✓</span><span class="l">${esc(x.label)}</span>${x.done ? "" : `<button class="go" data-ess="${x.id}">${x.exists ? "Fill in" : "Add"}</button>`}</div>`).join("")}
      ${es.some((x) => !x.exists) ? `<button class="sbtn" id="e-all" style="margin-top:10px">Add all missing sections</button>` : ""}
      <details class="qc"${res.length ? " open" : ""}><summary>Quality checks (${res.length})</summary>${res.length ? res.map((r) => `<div class="chk ${r.level}"><i></i><span>${esc(r.msg)}</span></div>`).join("") : '<div class="chk"><i></i><span>Nothing to fix.</span></div>'}</details>`;
    tabbody.onclick = (e) => {
      const go = e.target.closest("[data-ess]");
      if (e.target.id === "e-all") { HCV.essentials(doc).filter((x) => !x.exists).forEach((x) => { const b = HCV.newBlock(x.type, { order: 1e6 }, doc.template); doc.blocks.push(b); HCV.placeBlock(doc, b, HCV.defaultZone(x.type, doc.template), 1e6); }); commit(); toast("Missing sections added. Fill them in."); return; }
      if (!go) return;
      const x = HCV.ESSENTIALS.find((s) => s.id === go.dataset.ess); let b = doc.blocks.find((o) => o.type === x.type);
      if (!b) { b = HCV.newBlock(x.type, { order: 1e6 }, doc.template); doc.blocks.push(b); HCV.placeBlock(doc, b, HCV.defaultZone(x.type, doc.template), 1e6); }
      if (mode === "simple") { commit(); const c = $(`.sec-card[data-id="${b.id}"] textarea`); if (c) { c.scrollIntoView({ block: "center", behavior: "smooth" }); c.focus(); } }
      else { sel = b.id; tab = "block"; commit(); const t = $("#f-text"); if (t) t.focus(); }
    };
  }
  function updBadge() {
    const es = HCV.essentials(doc), n = es.filter((x) => !x.done).length, b = $("#badge");
    b.textContent = n; b.hidden = !n;
    if (tab === "done" && !drag && !tabbody.contains(document.activeElement)) { const bar = $(".prog i", tabbody); if (bar) bar.style.width = Math.round((es.length - n) / es.length * 100) + "%"; }
  }

  /* ---------- Left: Simple mode guided form ---------- */
  function renderLeft() {
    if (mode !== "simple") return;
    const items = HCV.ordered(doc).filter((b) => !HCV.isDecor(b));
    $("#simple-form").innerHTML = `<h3 class="lh">Your CV</h3><p class="lnote">Fill in each section. The layout is arranged for you.</p>` +
      items.map((b) => `<div class="sec-card" data-id="${b.id}">
        <div class="sec-head"><b>${T[b.type].label}</b><button class="mini" data-s="up" aria-label="Move up">▲</button><button class="mini" data-s="down" aria-label="Move down">▼</button><button class="mini" data-s="del" aria-label="Remove section">×</button></div>
        <span class="hint">${esc(T[b.type].hint || "")}</span>
        ${b.type === "profile" ? "" : `<input type="text" data-s="title" value="${esc(b.title)}" placeholder="Heading">`}
        <textarea data-s="text" rows="${clamp(b.text.split("\n").length + 1, 3, 12)}">${esc(b.text)}</textarea></div>`).join("") +
      `<div class="addrow"><select id="s-type">${Object.keys(T).filter((k) => !T[k].decorative && k !== "text").map((k) => `<option value="${k}">${T[k].label}</option>`).join("")}</select><button class="btn" id="s-add">Add section</button></div>`;
  }
  $("#simple-form").addEventListener("input", (e) => {
    const card = e.target.closest(".sec-card"); if (!card) return;
    const b = blk(card.dataset.id), k = e.target.dataset.s; if (k === "title") b.title = e.target.value; else if (k === "text") b.text = e.target.value; touch();
  });
  $("#simple-form").addEventListener("click", (e) => {
    if (e.target.id === "s-add") { const t = $("#s-type").value, b = HCV.newBlock(t, { order: 1e6 }, doc.template); doc.blocks.push(b); HCV.placeBlock(doc, b, HCV.defaultZone(t, doc.template), 1e6); commit(); return; }
    const a = e.target.closest("[data-s]"), card = e.target.closest(".sec-card"); if (!a || !card || !["up", "down", "del"].includes(a.dataset.s)) return;
    const b = blk(card.dataset.id), list = HCV.ordered(doc).filter((x) => x !== b && HCV.zoneOf(doc, x) === HCV.zoneOf(doc, b) || x === b), i = list.indexOf(b);
    if (a.dataset.s === "del") doc.blocks = doc.blocks.filter((x) => x !== b);
    else { const o = list[i + (a.dataset.s === "up" ? -1 : 1)]; if (!o) return; const t = b.order; b.order = o.order; o.order = t; }
    commit();
  });

  /* ---------- Top bar ---------- */
  function setMode(m, keep) {
    mode = m; try { localStorage.setItem("houndcv.mode", m); } catch (e) { }
    document.body.dataset.mode = m;
    $$(".seg button").forEach((b) => { b.classList.toggle("on", b.dataset.mode === m); b.setAttribute("aria-selected", b.dataset.mode === m); });
    if (m === "simple") { sel = null; if (tab === "block" || tab === "order") tab = "doc"; }
    if (!keep) renderAll();
  }
  $$(".seg button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  $("#undo").onclick = () => undo(-1); $("#redo").onclick = () => undo(1);
  const menu = $("#export-menu");
  $("#export-btn").onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; };
  addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true; });
  menu.addEventListener("click", (e) => {
    const a = e.target.closest("[data-act]"); if (!a) return; menu.hidden = true; const act = a.dataset.act;
    if (act === "pdf" || act === "pdf-plain") printDoc(act === "pdf-plain"); else if (act === "backup") backup(); else if (act === "restore") $("#restore-file").click();
    else if (act === "reset" && confirm("Start a new CV? Download a backup first if you want to keep this one.")) { doc = HCV.defaultDoc(); sel = null; snapshot(); HCV.save(doc); renderAll(); }
  });
  function printDoc(plain) {
    const root = $("#print-root"), old = document.title, n = HCV.name(doc), st = document.createElement("style");
    st.textContent = plain ? "@page{size:A4;margin:15mm}" : "@page{size:A4;margin:0}"; document.head.appendChild(st);
    if (plain) root.innerHTML = HCV.plainHTML(doc); else HCV.renderPage(doc, root, { mm: "1mm" });
    document.title = (n && !/your full name/i.test(n) ? n : "CV") + (plain ? " - CV (plain)" : " - CV");
    const done = () => { root.innerHTML = ""; st.remove(); document.title = old; removeEventListener("afterprint", done); };
    addEventListener("afterprint", done); window.print();
  }
  function backup() {
    const a = document.createElement("a"), blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    a.href = URL.createObjectURL(blob); a.download = "houndcv-backup.json"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast("Backup downloaded.");
  }
  $("#restore-file").addEventListener("change", (e) => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then((t) => { doc = HCV.normalize(JSON.parse(t)); sel = null; snapshot(); HCV.save(doc); renderAll(); toast("Backup restored."); })
      .catch(() => toast("That file is not a HoundCV backup.")).finally(() => { e.target.value = ""; });
  });

  addEventListener("keydown", (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if ((e.ctrlKey || e.metaKey) && !typing) {
      const k = e.key.toLowerCase();
      if (k === "z") { e.preventDefault(); undo(e.shiftKey ? 1 : -1); } else if (k === "y") { e.preventDefault(); undo(1); } else if (k === "d" && sel && mode === "advanced") { e.preventDefault(); dupBlock(sel); }
      else if (k === "=" || k === "+") { e.preventDefault(); zoomBy(1.2); } else if (k === "-") { e.preventDefault(); zoomBy(1 / 1.2); } else if (k === "0") { e.preventDefault(); $("#zfit").click(); }
    }
    if (e.key === "Escape") { hideCtx(); menu.hidden = true; if (!typing && sel) select(null); return; }
    if (typing || mode !== "advanced" || !sel) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); delBlock(sel); }
  });

  function renderAll() { renderStage(); renderLeft(); renderPanel(); }

  /* ---------- Start ---------- */
  setMode(mode, true);
  const start = () => { snapshot(); renderAll(); if (!saved) HCV.save(doc); };
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(start);
  window.__hcv = { get doc() { return doc; }, get mode() { return mode; }, get zoom() { return zoom; }, addBlock, commit };
})();
