/* HoundCV editor: Simple and Advanced mode over one shared document (see hcv-core.js). */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = HCV.esc, T = HCV.TYPES;
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const r2 = (v) => Math.round(v * 100) / 100;

  /* ---------- State ---------- */
  const saved = HCV.load();
  let doc = saved || HCV.defaultDoc();
  let sel = null, tab = "doc", zoom = 1, fitMode = true, cleanupDrag = null;
  const qMode = new URLSearchParams(location.search).get("mode");
  let mode = qMode === "simple" || qMode === "advanced" ? qMode : (localStorage.getItem("houndcv.mode") || "advanced");
  const hist = { s: [], i: -1 };
  let saveT, histT, relT;

  const host = $("#page-host"), stage = $("#stage"), tabbody = $("#tabbody");
  const mmPx = () => HCV.MM_PX * zoom;
  const pageEl = () => $(".page", host);
  const blk = (id) => doc.blocks.find((b) => b.id === id);

  /* ---------- History, save, status ---------- */
  function snapshot() {
    const s = JSON.stringify(doc);
    if (hist.s[hist.i] === s) return;
    hist.s = hist.s.slice(0, hist.i + 1); hist.s.push(s);
    if (hist.s.length > 100) hist.s.shift();
    hist.i = hist.s.length - 1; updUndo();
  }
  function updUndo() { $("#undo").disabled = hist.i <= 0; $("#redo").disabled = hist.i >= hist.s.length - 1; }
  function setStatus(t, saving) { const s = $("#status"); s.textContent = t; s.classList.toggle("saving", !!saving); }
  function saveSoon() {
    setStatus("Saving…", true); clearTimeout(saveT);
    saveT = setTimeout(() => { setStatus(HCV.save(doc) ? "Saved" : "Not saved", false); }, 350);
  }
  function undo(d) {
    const i = hist.i + d; if (i < 0 || i >= hist.s.length) return;
    hist.i = i; doc = JSON.parse(hist.s[i]); if (!blk(sel)) sel = null;
    HCV.save(doc); setStatus("Saved"); updUndo(); renderAll();
  }
  /* commit = structural change: snapshot + save + full redraw */
  function commit(keepPanel) { snapshot(); saveSoon(); renderStage(); if (!keepPanel) { renderLeft(); renderPanel(); } else updChecks(); }
  /* touch = typing: light update, history after a pause */
  function touch(reflow) {
    saveSoon(); clearTimeout(histT); histT = setTimeout(snapshot, 700);
    if (reflow && doc.layout === "auto") { clearTimeout(relT); relT = setTimeout(() => { relayout(); renderStage(); }, 120); }
    else renderStage();
  }
  function relayout() {
    const bottom = HCV.autoLayout(doc);
    if (bottom > doc.page.h - doc.page.safe + 0.5) toast("Content is longer than one page. Shorten it, or reduce font size.");
  }
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 3200); }

  /* ---------- Page rendering ---------- */
  function fit() {
    const w = stage.clientWidth - 56;
    zoom = clamp(w / (doc.page.w * HCV.MM_PX), 0.35, 1.6);
  }
  function renderStage() {
    if (fitMode) fit();
    HCV.renderPage(doc, host, { interactive: mode === "advanced", mm: mmPx().toFixed(5) + "px" });
    $("#zfit").textContent = Math.round(zoom * 100) + "%";
    drawSel(); updChecks();
  }
  function setBlockStyle(b) {
    const el = $(`.blk[data-id="${b.id}"]`, host); if (!el) return;
    el.style.left = `calc(${r2(b.x)}*var(--mm))`; el.style.top = `calc(${r2(b.y)}*var(--mm))`;
    el.style.width = `calc(${r2(b.w)}*var(--mm))`; el.style.height = `calc(${r2(b.h)}*var(--mm))`;
  }
  function drawSel() {
    const p = pageEl(); if (!p) return;
    $$(".sel", p).forEach((e) => e.remove());
    const b = mode === "advanced" && sel && blk(sel); if (!b) return;
    const d = document.createElement("div");
    d.className = "sel" + (b.locked ? " locked" : "");
    d.style.cssText = `left:calc(${b.x}*var(--mm));top:calc(${b.y}*var(--mm));width:calc(${b.w}*var(--mm));height:calc(${b.h}*var(--mm))`;
    d.innerHTML = ["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((h) => `<i class="h h-${h}" data-h="${h}"></i>`).join("");
    p.appendChild(d);
  }
  function drawGuides(r) {
    const g = $(".ov-guides", host); if (!g) return;
    g.innerHTML = (r ? r.gx.map((x) => `<i class="gv v" style="left:calc(${x}*var(--mm))"></i>`).join("") + r.gy.map((y) => `<i class="gv h" style="top:calc(${y}*var(--mm))"></i>`).join("") : "");
  }

  /* ---------- Selection, drag, resize ---------- */
  function select(id) {
    sel = id; drawSel();
    if (id && mode === "advanced") { tab = "block"; setTabs(); renderPanel(); } else if (!id && tab === "block") { tab = "doc"; setTabs(); renderPanel(); }
  }
  host.addEventListener("pointerdown", (e) => {
    if (mode !== "advanced" || e.button !== 0) return;
    const h = e.target.closest(".h"), el = e.target.closest(".blk");
    hideCtx();
    if (h && sel) { startResize(e, blk(sel), h.dataset.h); return; }
    if (el) { const b = blk(el.dataset.id); select(b.id); if (!b.locked) startDrag(e, b); return; }
    select(null);
  });
  host.addEventListener("dblclick", (e) => { const el = e.target.closest(".blk"); if (el && mode === "advanced") { select(el.dataset.id); const t = $("#f-text"); if (t) t.focus(); } });

  function startDrag(e, b) {
    const s = { x: e.clientX, y: e.clientY, bx: b.x, by: b.y }, p = doc.page; let moved = false;
    const mv = (ev) => {
      if (!moved && Math.hypot(ev.clientX - s.x, ev.clientY - s.y) < 3) return;
      moved = true; const mm = mmPx();
      const r = HCV.snapMove(doc, b, clamp(s.bx + (ev.clientX - s.x) / mm, 0, p.w - b.w), clamp(s.by + (ev.clientY - s.y) / mm, 0, p.h - b.h), 6 / mm);
      b.x = clamp(r.x, 0, p.w - b.w); b.y = clamp(r.y, 0, p.h - b.h);
      setBlockStyle(b); drawGuides(r); drawSel(); updNums(b);
    };
    const up = () => { cleanup(); drawGuides(null); if (moved) { doc.layout = "custom"; commit(true); } };
    const cleanup = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); };
    addEventListener("pointermove", mv); addEventListener("pointerup", up);
  }
  function startResize(e, b, h) {
    e.preventDefault();
    const o = { x: b.x, y: b.y, w: b.w, h: b.h, cx: e.clientX, cy: e.clientY }, p = doc.page; let moved = false;
    const mv = (ev) => {
      moved = true; const mm = mmPx(), thr = 6 / mm, gx = [], gy = [];
      let l = o.x, t = o.y, r = o.x + o.w, bt = o.y + o.h;
      const dx = (ev.clientX - o.cx) / mm, dy = (ev.clientY - o.cy) / mm;
      const sn = (v, ax, gs) => { const s = HCV.snapEdge(doc, b.id, v, ax, thr); if (s.g !== undefined) gs.push(s.g); return s.v; };
      if (h.includes("w")) l = sn(clamp(o.x + dx, 0, r - 4), "x", gx);
      if (h.includes("e")) r = sn(clamp(o.x + o.w + dx, l + 4, p.w), "x", gx);
      if (h.includes("n")) t = sn(clamp(o.y + dy, 0, bt - 1), "y", gy);
      if (h.includes("s")) bt = sn(clamp(o.y + o.h + dy, t + 1, p.h), "y", gy);
      b.x = r2(l); b.y = r2(t); b.w = r2(r - l); b.h = r2(bt - t);
      setBlockStyle(b); drawGuides({ gx, gy }); drawSel(); updNums(b);
    };
    const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); drawGuides(null); if (moved) { doc.layout = "custom"; commit(true); } };
    addEventListener("pointermove", mv); addEventListener("pointerup", up);
  }

  /* ---------- Block operations ---------- */
  function addBlock(type, x, y) {
    const b = HCV.newBlock(type), p = doc.page;
    if (x == null) { // next free spot below existing blocks
      const bottom = doc.blocks.reduce((m, o) => Math.max(m, o.y + o.h), p.safe);
      x = p.safe; y = Math.min(Math.ceil((bottom + p.grid) / p.grid) * p.grid, Math.max(p.safe, p.h - p.safe - b.h));
    }
    const s = HCV.snapMove(doc, b, x, y, 0);
    b.x = clamp(s.x, 0, p.w - b.w); b.y = clamp(s.y, 0, p.h - b.h);
    b.order = doc.blocks.reduce((m, o) => Math.max(m, o.order), -1) + 1;
    doc.blocks.push(b); doc.layout = "custom"; sel = b.id; tab = "block"; setTabs(); commit();
  }
  function delBlock(id) { doc.blocks = doc.blocks.filter((b) => b.id !== id); if (sel === id) sel = null; if (tab === "block") tab = "doc"; setTabs(); if (doc.layout === "auto") relayout(); commit(); }
  function dupBlock(id) {
    const b = blk(id), c = HCV.newBlock(b.type, Object.assign({}, b, { id: HCV.uid(), x: b.x + 5, y: b.y + 5, order: doc.blocks.length }));
    c.x = clamp(c.x, 0, doc.page.w - c.w); c.y = clamp(c.y, 0, doc.page.h - c.h);
    doc.blocks.push(c); doc.layout = "custom"; sel = c.id; commit();
  }
  function setType(b, t) {
    b.type = t; if (!b.title && T[t].def.title) b.title = T[t].def.title;
    if (T[t].decorative && !b.text) b.text = ""; commit();
  }
  function fitHeight(b) { b.h = HCV.measure(doc, b, b.w); doc.layout = "custom"; commit(); }

  /* ---------- Toolbox (click or drag) ---------- */
  function buildTools() {
    const mk = (type) => `<button class="tool" data-type="${type}">${T[type].label}</button>`;
    $("#tools").innerHTML = Object.keys(T).filter((k) => !T[k].decorative).map(mk).join("");
    $("#tools-decor").innerHTML = Object.keys(T).filter((k) => T[k].decorative).map(mk).join("");
  }
  $("#toolbox").addEventListener("pointerdown", (e) => {
    const tl = e.target.closest(".tool"); if (!tl || e.button !== 0) return;
    const type = tl.dataset.type, sx = e.clientX, sy = e.clientY; let ghost = null;
    const mv = (ev) => {
      if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 5) { ghost = document.createElement("div"); ghost.className = "ghost"; ghost.textContent = T[type].label; document.body.appendChild(ghost); }
      if (ghost) { ghost.style.left = ev.clientX + "px"; ghost.style.top = ev.clientY + "px"; }
    };
    const up = (ev) => {
      removeEventListener("pointermove", mv); removeEventListener("pointerup", up);
      if (!ghost) { addBlock(type); return; }
      ghost.remove();
      const pr = pageEl().getBoundingClientRect(), mm = mmPx();
      if (ev.clientX >= pr.left && ev.clientX <= pr.right && ev.clientY >= pr.top && ev.clientY <= pr.bottom) {
        const d = T[type].def; addBlock(type, (ev.clientX - pr.left) / mm - d.w / 2, (ev.clientY - pr.top) / mm - d.h / 2);
      }
    };
    addEventListener("pointermove", mv); addEventListener("pointerup", up);
  });

  /* ---------- Context menu ---------- */
  const ctx = $("#ctx");
  function hideCtx() { ctx.hidden = true; }
  host.addEventListener("contextmenu", (e) => {
    if (mode !== "advanced") return;
    const el = e.target.closest(".blk"); if (!el) return;
    e.preventDefault(); const b = blk(el.dataset.id); select(b.id);
    const chips = (items, cur, kind) => `<div class="chipset">${items.map(([k, l]) => `<button class="chipb${k === cur ? " on" : ""}" data-${kind}="${k}">${l}</button>`).join("")}</div>`;
    ctx.innerHTML = `<div class="cm-h">Type</div>${chips(Object.keys(T).map((k) => [k, T[k].label]), b.type, "type")}
      <div class="cm-h">Frame</div>${chips(Object.entries(HCV.FRAMES), b.frame, "frame")}<hr>
      <button class="act" data-act="dup">Duplicate</button>
      <button class="act" data-act="front">Bring to front</button><button class="act" data-act="back">Send to back</button>
      <button class="act" data-act="lock">${b.locked ? "Unlock" : "Lock"} position</button>
      <button class="act" data-act="fit">Fit height to text</button><hr>
      <button class="act" data-act="del">Delete</button>`;
    ctx.hidden = false;
    ctx.style.left = Math.min(e.clientX, innerWidth - 262) + "px"; ctx.style.top = Math.min(e.clientY, innerHeight - ctx.offsetHeight - 10) + "px";
    ctx.onclick = (ev) => {
      const t = ev.target.closest("button"); if (!t) return;
      if (t.dataset.type) setType(b, t.dataset.type);
      else if (t.dataset.frame) { b.frame = t.dataset.frame; commit(); }
      else {
        const a = t.dataset.act;
        if (a === "dup") dupBlock(b.id); else if (a === "del") delBlock(b.id);
        else if (a === "front") { doc.blocks.splice(doc.blocks.indexOf(b), 1); doc.blocks.push(b); commit(); }
        else if (a === "back") { doc.blocks.splice(doc.blocks.indexOf(b), 1); doc.blocks.unshift(b); commit(); }
        else if (a === "lock") { b.locked = !b.locked; commit(); }
        else if (a === "fit") fitHeight(b);
      }
      hideCtx();
    };
  });
  addEventListener("pointerdown", (e) => { if (!ctx.hidden && !ctx.contains(e.target)) hideCtx(); });
  addEventListener("scroll", hideCtx, true);

  /* ---------- Right panel ---------- */
  function setTabs() {
    $$("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  }
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; tab = b.dataset.tab; setTabs(); renderPanel(); });
  function field(label, html) { return `<div class="fld"><label>${label}</label>${html}</div>`; }
  function renderPanel() {
    if (tab === "block" && !blk(sel)) tab = "doc";
    setTabs();
    tabbody.style.animation = "none"; void tabbody.offsetWidth; tabbody.style.animation = "";
    if (tab === "doc") panelDoc(); else if (tab === "block") panelBlock(); else if (tab === "order") panelOrder(); else panelChecks();
  }

  function panelDoc() {
    const t = doc.theme, p = doc.page;
    const opt = (o, cur) => Object.entries(o).map(([k, v]) => `<option value="${k}"${k === cur ? " selected" : ""}>${v}</option>`).join("");
    tabbody.innerHTML = `
      ${doc.layout === "custom" ? `<p class="note">Layout is custom (kept from Advanced mode). Edits will not move your blocks.</p>` : ""}
      <div class="lab fld"><label>Look</label><div class="skins">${Object.entries(HCV.SKINS).map(([k, s]) => `<button class="skin${t.skin === k ? " on" : ""}" data-skin="${k}"><i style="background:linear-gradient(90deg,${s.bg} 55%,${s.accent} 55%);border:1px solid ${s.line}"></i>${s.label}</button>`).join("")}</div></div>
      <div class="fld"><label>Colours</label><div class="colors">
        <div><input type="color" data-c="bg" value="${t.bg}"><label>Page</label></div>
        <div><input type="color" data-c="text" value="${t.text}"><label>Text</label></div>
        <div><input type="color" data-c="muted" value="${t.muted}"><label>Soft</label></div>
        <div><input type="color" data-c="accent" value="${t.accent}"><label>Accent</label></div></div></div>
      ${field("Font", `<select id="d-font">${opt({ sans: "Sans", serif: "Serif", mono: "Mono", condensed: "Condensed" }, t.font)}</select>`)}
      <div class="fld"><label>Auto layout</label><div class="chipset">
        <button class="chipb${doc.cols === 2 ? " on" : ""}" data-cols="2">Two columns</button><button class="chipb${doc.cols === 1 ? " on" : ""}" data-cols="1">One column</button></div></div>
      <button class="sbtn" id="d-arrange">Arrange automatically</button>
      <div class="adv-only">
        <div class="sep">Page</div>
        ${field("Background pattern", `<select id="d-pat">${opt({ none: "None", grid: "Grid", lines: "Lines", dots: "Dots" }, p.pattern)}</select>`)}
        <div class="row2">${field("Frame", `<select id="d-frame">${opt({ none: "None", thin: "Thin", double: "Double", bracket: "Bracket" }, p.frame)}</select>`)}
          ${field("Frame inset (mm)", `<input type="number" id="d-inset" min="2" max="20" step="1" value="${p.inset}">`)}</div>
        <div class="row2">${field("Safe zone (mm)", `<input type="number" id="d-safe" min="0" max="30" step="1" value="${p.safe}">`)}
          ${field("Grid (mm)", `<input type="number" id="d-grid" min="1" max="20" step="1" value="${p.grid}">`)}</div>
        <div class="sep">Corner details</div>
        <p class="note">Use {date}, {name} or {page}.</p>
        <div class="row2">${["tl", "tr", "bl", "br"].map((k) => field({ tl: "Top left", tr: "Top right", bl: "Bottom left", br: "Bottom right" }[k], `<input type="text" data-corner="${k}" value="${esc(p.corners[k])}">`)).join("")}</div>
      </div>`;
    tabbody.onclick = (e) => {
      const sk = e.target.closest("[data-skin]"), cb = e.target.closest("[data-cols]");
      if (sk) { Object.assign(doc.theme, HCV.SKINS[sk.dataset.skin], { skin: sk.dataset.skin }); commit(); }
      else if (cb) { doc.cols = +cb.dataset.cols; if (doc.layout === "auto") relayout(); commit(); }
      else if (e.target.id === "d-arrange") { relayout(); commit(); toast("Arranged."); }
    };
    tabbody.oninput = (e) => {
      const t2 = e.target, c = t2.dataset.c, k = t2.dataset.corner;
      if (c) { doc.theme[c] = t2.value; doc.theme.skin = "custom"; touch(); }
      else if (k) { doc.page.corners[k] = t2.value; touch(); }
    };
    tabbody.onchange = (e) => {
      const id = e.target.id, v = e.target.value;
      if (id === "d-font") doc.theme.font = v; else if (id === "d-pat") doc.page.pattern = v; else if (id === "d-frame") doc.page.frame = v;
      else if (id === "d-inset") doc.page.inset = clamp(+v || 6, 2, 20); else if (id === "d-safe") doc.page.safe = clamp(+v || 0, 0, 30);
      else if (id === "d-grid") doc.page.grid = clamp(+v || 5, 1, 20); else { if (e.target.dataset.c || e.target.dataset.corner) { snapshot(); } return; }
      if (doc.layout === "auto" && (id === "d-safe" || id === "d-grid" || id === "d-font")) relayout();
      commit();
    };
  }

  function panelBlock() {
    const b = blk(sel), tp = T[b.type];
    const opt = (cur) => Object.keys(T).map((k) => `<option value="${k}"${k === cur ? " selected" : ""}>${T[k].label}</option>`).join("");
    tabbody.innerHTML = `
      ${field("Type", `<select id="f-type">${opt(b.type)}</select>`)}
      ${tp.decorative ? "" : field("Heading", `<input type="text" id="f-title" value="${esc(b.title)}">`) + field("Content", `<textarea id="f-text" rows="9">${esc(b.text)}</textarea>`) + (tp.hint ? `<p class="note">${esc(tp.hint)}</p>` : "")}
      <div class="row2">${field("Frame", `<select id="f-frame">${Object.entries(HCV.FRAMES).map(([k, v]) => `<option value="${k}"${k === b.frame ? " selected" : ""}>${v}</option>`).join("")}</select>`)}
        ${tp.decorative ? "" : field("Text size (pt)", `<input type="number" id="f-fs" min="5" max="40" step="0.5" value="${b.fs}">`)}</div>
      <div class="sep">Position (mm)</div>
      <div class="row4">${["x", "y", "w", "h"].map((k) => `<div class="fld"><label>${k.toUpperCase()}</label><input type="number" data-n="${k}" step="${doc.page.grid}" value="${b[k]}"></div>`).join("")}</div>
      <div class="chipset"><button class="chipb" id="f-fit">Fit height</button><button class="chipb${b.locked ? " on" : ""}" id="f-lock">${b.locked ? "Locked" : "Lock"}</button></div>
      <div class="sep">Actions</div>
      <button class="sbtn" id="f-dup">Duplicate</button><button class="sbtn danger" id="f-del">Delete block</button>`;
    tabbody.oninput = (e) => {
      const id = e.target.id;
      if (id === "f-title") { b.title = e.target.value; touch(true); } else if (id === "f-text") { b.text = e.target.value; touch(true); }
      else if (id === "f-fs") { b.fs = clamp(+e.target.value || 9.5, 5, 40); touch(true); }
      else if (e.target.dataset.n) { b[e.target.dataset.n] = +e.target.value || 0; doc.layout = "custom"; saveSoon(); renderStage(); }
    };
    tabbody.onchange = (e) => {
      const id = e.target.id;
      if (id === "f-type") setType(b, e.target.value); else if (id === "f-frame") { b.frame = e.target.value; commit(true); }
      else commit(true);
    };
    tabbody.onclick = (e) => {
      const id = e.target.id;
      if (id === "f-fit") fitHeight(b); else if (id === "f-lock") { b.locked = !b.locked; commit(); }
      else if (id === "f-dup") dupBlock(b.id); else if (id === "f-del") delBlock(b.id);
    };
  }
  function updNums(b) { if (tab !== "block" || b.id !== sel) return; ["x", "y", "w", "h"].forEach((k) => { const i = $(`[data-n="${k}"]`, tabbody); if (i) i.value = b[k]; }); }

  function panelOrder() {
    const list = HCV.ordered(doc);
    tabbody.innerHTML = `<p class="note">Applicant tracking systems read blocks in this order, not by where they sit on the page. The plain export follows it too.</p>
      <ol class="olist">${list.map((b, i) => `<li data-id="${b.id}" class="${b.id === sel ? "sel" : ""}"><span class="n">${i + 1}</span><span class="t">${esc(HCV.label(b))}</span>${HCV.isDecor(b) ? '<span class="d">decor</span>' : ""}<button class="mini" data-m="-1">▲</button><button class="mini" data-m="1">▼</button></li>`).join("")}</ol>
      <button class="sbtn" id="o-auto">Auto order (top to bottom)</button>`;
    tabbody.oninput = null; tabbody.onchange = null;
    tabbody.onclick = (e) => {
      if (e.target.id === "o-auto") { HCV.autoOrder(doc); commit(); return; }
      const m = e.target.closest("[data-m]"), li = e.target.closest("li"); if (!li) return;
      if (!m) { select(li.dataset.id); return; }
      const i = list.findIndex((b) => b.id === li.dataset.id), j = i + +m.dataset.m; if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]]; list.forEach((b, k) => { b.order = k; }); commit();
    };
  }

  function panelChecks() {
    const res = HCV.check(doc, host);
    tabbody.innerHTML = res.map((r) => `<div class="chk ${r.level}"><i></i><span>${esc(r.msg)}</span></div>`).join("");
    tabbody.oninput = null; tabbody.onchange = null; tabbody.onclick = null;
  }
  function updChecks() {
    const res = HCV.check(doc, host), n = res.filter((r) => r.level !== "ok").length, b = $("#badge");
    b.textContent = n; b.hidden = !n;
    if (tab === "checks") { tabbody.innerHTML = res.map((r) => `<div class="chk ${r.level}"><i></i><span>${esc(r.msg)}</span></div>`).join(""); }
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
      `<div class="addrow"><select id="s-type">${Object.keys(T).filter((k) => !T[k].decorative).map((k) => `<option value="${k}">${T[k].label}</option>`).join("")}</select><button class="btn" id="s-add">Add section</button></div>`;
  }
  $("#simple-form").addEventListener("input", (e) => {
    const card = e.target.closest(".sec-card"); if (!card) return;
    const b = blk(card.dataset.id), k = e.target.dataset.s;
    if (k === "title") b.title = e.target.value; else if (k === "text") b.text = e.target.value;
    touch(true);
  });
  $("#simple-form").addEventListener("click", (e) => {
    if (e.target.id === "s-add") {
      const b = HCV.newBlock($("#s-type").value); b.order = doc.blocks.length; doc.blocks.push(b);
      if (doc.layout === "auto") relayout(); else { b.y = Math.min(doc.page.h - doc.page.safe - b.h, doc.blocks.reduce((m, o) => Math.max(m, o.y + o.h), 0) + 5); }
      commit(); return;
    }
    const a = e.target.closest("[data-s]"), card = e.target.closest(".sec-card"); if (!a || !card || !["up", "down", "del"].includes(a.dataset.s)) return;
    const list = HCV.ordered(doc).filter((b) => !HCV.isDecor(b)), b = blk(card.dataset.id), i = list.indexOf(b);
    if (a.dataset.s === "del") { doc.blocks = doc.blocks.filter((x) => x !== b); }
    else { const j = i + (a.dataset.s === "up" ? -1 : 1); if (j < 0 || j >= list.length) return; const o = list[j]; [b.order, o.order] = [o.order, b.order]; }
    if (doc.layout === "auto") relayout();
    commit();
  });

  /* ---------- Top bar ---------- */
  function setMode(m, keep) {
    mode = m; localStorage.setItem("houndcv.mode", m); document.body.dataset.mode = m;
    $$(".seg button").forEach((b) => { b.classList.toggle("on", b.dataset.mode === m); b.setAttribute("aria-selected", b.dataset.mode === m); });
    if (m === "simple") { sel = null; if (tab === "block" || tab === "order") tab = "doc"; }
    if (!keep) { renderAll(); }
  }
  $$(".seg button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  $("#undo").onclick = () => undo(-1); $("#redo").onclick = () => undo(1);
  $("#zin").onclick = () => { fitMode = false; zoom = clamp(zoom + 0.1, 0.3, 2.5); renderStage(); };
  $("#zout").onclick = () => { fitMode = false; zoom = clamp(zoom - 0.1, 0.3, 2.5); renderStage(); };
  $("#zfit").onclick = () => { fitMode = true; renderStage(); };
  addEventListener("resize", () => { if (fitMode) renderStage(); });

  const menu = $("#export-menu");
  $("#export-btn").onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; };
  addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true; });
  menu.addEventListener("click", (e) => {
    const a = e.target.closest("[data-act]"); if (!a) return; menu.hidden = true;
    const act = a.dataset.act;
    if (act === "pdf" || act === "pdf-plain") printDoc(act === "pdf-plain");
    else if (act === "backup") backup();
    else if (act === "restore") $("#restore-file").click();
    else if (act === "reset") { if (confirm("Start a new CV? Download a backup first if you want to keep this one.")) { doc = HCV.defaultDoc(); sel = null; relayout(); snapshot(); HCV.save(doc); renderAll(); } }
  });
  function printDoc(plain) {
    const root = $("#print-root"), old = document.title, n = HCV.name(doc);
    const st = document.createElement("style"); st.id = "page-rule";
    st.textContent = plain ? "@page{size:A4;margin:15mm}" : "@page{size:A4;margin:0}";
    document.head.appendChild(st);
    if (plain) root.innerHTML = HCV.plainHTML(doc); else HCV.renderPage(doc, root, { mm: "1mm" });
    document.title = (n && !/your full name/i.test(n) ? n : "CV") + (plain ? " - CV (plain)" : " - CV");
    const done = () => { root.innerHTML = ""; st.remove(); document.title = old; removeEventListener("afterprint", done); };
    addEventListener("afterprint", done); window.print();
  }
  function backup() {
    const a = document.createElement("a"), blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    a.href = URL.createObjectURL(blob); a.download = "houndcv-backup.json"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast("Backup downloaded.");
  }
  $("#restore-file").addEventListener("change", (e) => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then((t) => { doc = HCV.normalize(JSON.parse(t)); sel = null; snapshot(); HCV.save(doc); renderAll(); toast("Backup restored."); })
      .catch(() => toast("That file is not a HoundCV backup.")).finally(() => { e.target.value = ""; });
  });

  addEventListener("keydown", (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if ((e.ctrlKey || e.metaKey) && !typing) {
      if (e.key.toLowerCase() === "z") { e.preventDefault(); undo(e.shiftKey ? 1 : -1); }
      else if (e.key.toLowerCase() === "y") { e.preventDefault(); undo(1); }
      else if (e.key.toLowerCase() === "d" && sel && mode === "advanced") { e.preventDefault(); dupBlock(sel); }
    }
    if (typing || mode !== "advanced" || !sel) { if (e.key === "Escape") { hideCtx(); menu.hidden = true; } return; }
    const b = blk(sel), step = e.shiftKey ? doc.page.grid : 1;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); delBlock(sel); }
    else if (e.key === "Escape") { select(null); hideCtx(); }
    else if (!b.locked && e.key.startsWith("Arrow")) {
      e.preventDefault();
      if (e.key === "ArrowLeft") b.x -= step; if (e.key === "ArrowRight") b.x += step; if (e.key === "ArrowUp") b.y -= step; if (e.key === "ArrowDown") b.y += step;
      b.x = clamp(r2(b.x), 0, doc.page.w - b.w); b.y = clamp(r2(b.y), 0, doc.page.h - b.h);
      doc.layout = "custom"; clearTimeout(histT); histT = setTimeout(snapshot, 500); saveSoon(); setBlockStyle(b); drawSel(); updNums(b);
    }
  });

  function renderAll() { renderStage(); renderLeft(); renderPanel(); setTabs(); }

  /* ---------- Start ---------- */
  buildTools(); setMode(mode, true);
  const start = () => {
    if (!saved) { relayout(); }
    snapshot(); renderAll();
    if (!saved) HCV.save(doc);
  };
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(start);
  window.__hcv = { get doc() { return doc; }, get mode() { return mode; } };   // handy for debugging
})();
