/* HoundCV core: document model, rendering, snapping, auto-layout, checks, storage.
   The CV is stored as structured data (blocks in millimetres), never only as HTML.
   Both Simple and Advanced mode edit this same document. */
(function () {
  "use strict";
  const HCV = (window.HCV = {});
  const MM_PX = 96 / 25.4;   // CSS pixels per millimetre
  const PT = 0.3528;         // millimetres per point
  HCV.MM_PX = MM_PX;

  HCV.FONTS = {
    sans: "'Inter','Segoe UI',system-ui,Arial,sans-serif",
    serif: "Georgia,'Times New Roman',serif",
    mono: "ui-monospace,'SF Mono',Consolas,monospace",
    condensed: "'Arial Narrow','Roboto Condensed',Arial,sans-serif"
  };
  HCV.SKINS = {
    ember:     { label: "Ember",             bg: "#121212", text: "#f2f2f2", muted: "#b3b3b3", accent: "#ff7a1a", line: "#3a3a3a" },
    olive:     { label: "Field Olive",       bg: "#14160f", text: "#f0f0e9", muted: "#b6b9ac", accent: "#c1b56a", line: "#3a4032" },
    aluminium: { label: "Brushed Aluminium", bg: "#202328", text: "#f2f4f6", muted: "#c1c6cd", accent: "#c9d0d8", line: "#454b54" },
    plain:     { label: "Plain (light)",     bg: "#ffffff", text: "#111111", muted: "#444444", accent: "#222222", line: "#bbbbbb" }
  };
  const ENTRY = ["experience", "education", "projects", "certifications"];
  const SIDE = ["skills", "languages", "certifications"];

  HCV.TYPES = {
    profile:        { label: "Profile",        hint: "Line 1: your name. Line 2: your title. Then a short summary.", def: { w: 120, h: 40, text: "Your Full Name\nTarget Role / Professional Title\nWrite two to four concise lines about your experience, strengths and the kind of role you want." } },
    contact:        { label: "Contact",        hint: "One per line as Label: value", def: { w: 60, h: 36, title: "Contact", text: "Location: City, Country\nEmail: name@email.com\nPhone: +00 000 000 000\nLinks: linkedin.com/in/yourname" } },
    summary:        { label: "Summary",        hint: "A short paragraph about you.", def: { w: 120, h: 30, title: "Summary", text: "A short paragraph describing your strengths and goals." } },
    experience:     { label: "Experience",     hint: "Per entry: 'Job title | Dates', then the company, then lines starting with '-'. Blank line between entries.", def: { w: 120, h: 70, title: "Experience", text: "Job Title / Position | MM YYYY — Present\nCompany / Organisation · City\n- Describe a relevant responsibility or achievement and the result.\n- Add measurable outcomes when available.\n\nPrevious Job Title | MM YYYY — MM YYYY\nCompany / Organisation · City\n- Summarise your main responsibility or accomplishment." } },
    education:      { label: "Education",      hint: "Per entry: 'Degree | Years', then the school, then optional notes.", def: { w: 120, h: 34, title: "Education", text: "Degree / Qualification | YYYY — YYYY\nSchool / University · City\nOptional details such as coursework or honours." } },
    projects:       { label: "Projects",       hint: "Per entry: 'Project name | Year', then details.", def: { w: 120, h: 34, title: "Selected Projects", text: "Project Name | YEAR\nWhat you built or improved, your role and the outcome." } },
    certifications: { label: "Certifications", hint: "Per entry: 'Name | Year', then the issuer.", def: { w: 60, h: 28, title: "Certifications", text: "Certification Name | Year\nIssuing organisation" } },
    skills:         { label: "Skills",         hint: "One skill per line.", def: { w: 60, h: 40, title: "Core Skills", text: "Skill / Specialism\nCommunication\nProblem Solving" } },
    languages:      { label: "Languages",      hint: "One per line, for example: English — Native", def: { w: 60, h: 24, title: "Languages", text: "English — Native\nLanguage — Level" } },
    text:           { label: "Text",           hint: "Free text. Blank line starts a new paragraph.", def: { w: 80, h: 30, title: "Additional Information", text: "Volunteering, memberships, awards, interests." } },
    line:           { label: "Line",           decorative: true, def: { w: 80, h: 2, fs: 9 } },
    shape:          { label: "Box",            decorative: true, def: { w: 50, h: 30, frame: "thin", fs: 9 } }
  };
  HCV.FRAMES = { none: "None", thin: "Thin", panel: "Panel", bracket: "Bracket", tag: "Tag" };
  HCV.isDecor = (b) => !!HCV.TYPES[b.type].decorative;
  HCV.label = (b) => b.title || HCV.TYPES[b.type].label;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  HCV.esc = esc;
  HCV.uid = () => "b" + Math.random().toString(36).slice(2, 8);
  const r2 = (v) => Math.round(v * 100) / 100;

  /* ---------- Model ---------- */
  HCV.newBlock = (type, over) => {
    const d = HCV.TYPES[type].def;
    return Object.assign({
      id: HCV.uid(), type, x: 10, y: 10, w: d.w, h: d.h, frame: d.frame || "none",
      title: d.title || "", text: d.text || "", fs: d.fs || 9.5, locked: false, order: 0
    }, over || {});
  };
  HCV.defaultDoc = () => {
    const doc = {
      v: 1, layout: "auto", cols: 2,
      theme: Object.assign({ skin: "ember", font: "sans" }, HCV.SKINS.ember),
      page: { w: 210, h: 297, grid: 5, safe: 10, pattern: "none", frame: "none", inset: 6, corners: { tl: "", tr: "", bl: "", br: "" } },
      blocks: ["profile", "contact", "experience", "education", "skills", "languages"].map((t, i) => HCV.newBlock(t, { order: i }))
    };
    return doc;
  };
  HCV.normalize = (d) => {
    if (!d || !Array.isArray(d.blocks)) throw new Error("Not a HoundCV document");
    const base = HCV.defaultDoc();
    const out = Object.assign({}, base, d);
    out.theme = Object.assign({}, base.theme, d.theme || {});
    out.page = Object.assign({}, base.page, d.page || {});
    out.page.corners = Object.assign({}, base.page.corners, (d.page || {}).corners || {});
    out.blocks = d.blocks.filter((b) => HCV.TYPES[b.type]).map((b, i) => HCV.newBlock(b.type, Object.assign({ order: i }, b)));
    return out;
  };
  HCV.KEY = "houndcv.doc.v1";
  HCV.load = () => { try { const s = localStorage.getItem(HCV.KEY); return s ? HCV.normalize(JSON.parse(s)) : null; } catch (e) { return null; } };
  HCV.save = (doc) => { try { localStorage.setItem(HCV.KEY, JSON.stringify(doc)); return true; } catch (e) { return false; } };
  HCV.ordered = (doc) => doc.blocks.slice().sort((a, b) => a.order - b.order);
  HCV.autoOrder = (doc) => {
    doc.blocks.slice().sort((a, b) => (Math.abs(a.y - b.y) > 4 ? a.y - b.y : a.x - b.x)).forEach((b, i) => { b.order = i; });
  };
  HCV.name = (doc) => { const p = doc.blocks.find((b) => b.type === "profile"); return p ? (p.text.split("\n")[0] || "").trim() : ""; };

  /* ---------- Rendering ---------- */
  function entries(text) {
    return text.split(/\n\s*\n/).map((g) => g.split("\n").map((l) => l.trim()).filter(Boolean)).filter((g) => g.length);
  }
  function bodyLines(lines) {
    let html = "", ul = [];
    const flush = () => { if (ul.length) { html += "<ul>" + ul.map((x) => `<li>${esc(x)}</li>`).join("") + "</ul>"; ul = []; } };
    lines.forEach((l) => { if (l.startsWith("-")) ul.push(l.replace(/^-+\s*/, "")); else { flush(); html += `<p>${esc(l)}</p>`; } });
    flush();
    return html;
  }
  HCV.contentHTML = (b) => {
    const t = b.type, lines = (b.text || "").split("\n");
    if (t === "line" || t === "shape") return "";
    if (t === "profile") {
      const n = lines[0] || "", j = lines[1] || "", rest = lines.slice(2).join(" ").trim();
      return `<h1>${esc(n)}</h1>${j ? `<p class="job">${esc(j)}</p>` : ""}${rest ? `<p>${esc(rest)}</p>` : ""}`;
    }
    let h = b.title ? `<h2>${esc(b.title)}</h2>` : "";
    if (t === "contact") {
      h += lines.filter((l) => l.trim()).map((l) => {
        const i = l.indexOf(":");
        return i > 0 ? `<div class="ct"><span class="l">${esc(l.slice(0, i))}</span><span>${esc(l.slice(i + 1).trim())}</span></div>` : `<div class="ct"><span>${esc(l)}</span></div>`;
      }).join("");
    } else if (ENTRY.includes(t)) {
      h += entries(b.text || "").map((g) => {
        const [head, ...rest] = g, parts = head.split("|"), name = parts[0].trim(), date = (parts[1] || "").trim();
        let org = "";
        if (rest.length && !rest[0].startsWith("-") && (t === "experience" || t === "education" || t === "certifications")) org = `<div class="org">${esc(rest.shift())}</div>`;
        return `<div class="entry"><div class="eh"><h3>${esc(name)}</h3>${date ? `<span class="date">${esc(date)}</span>` : ""}</div>${org}${bodyLines(rest)}</div>`;
      }).join("");
    } else if (t === "skills" || t === "languages") {
      h += '<ul class="plainlist">' + lines.filter((l) => l.trim()).map((l) => `<li>${esc(l)}</li>`).join("") + "</ul>";
    } else {
      h += bodyLines((b.text || "").split("\n").map((l) => l.trim()).filter(Boolean));
    }
    return h;
  };
  HCV.blockHTML = (b, o) => {
    o = o || {};
    const st = o.measure ? "" : `left:calc(${r2(b.x)}*var(--mm));top:calc(${r2(b.y)}*var(--mm));width:calc(${r2(b.w)}*var(--mm));height:calc(${r2(b.h)}*var(--mm));z-index:${(o.z || 0) + 1};`;
    return `<div class="blk t-${b.type} f-${b.frame}${b.locked ? " locked" : ""}" data-id="${b.id}" style="${st}font-size:calc(${(b.fs * PT).toFixed(4)}*var(--mm))">${HCV.contentHTML(b)}</div>`;
  };
  HCV.pageVars = (doc, mm) => {
    const t = doc.theme, p = doc.page, fi = p.frame !== "none" ? p.inset : 4;
    return `--mm:${mm};--bg:${t.bg};--text:${t.text};--muted:${t.muted};--accent:${t.accent};--line:${t.line};--font:${HCV.FONTS[t.font] || HCV.FONTS.sans};--fi:${fi}`;
  };
  function tokens(s, doc) {
    return String(s || "").replace(/\{date\}/gi, new Date().toLocaleDateString(undefined, { year: "numeric", month: "short" }))
      .replace(/\{name\}/gi, HCV.name(doc)).replace(/\{page\}/gi, "1 / 1");
  }
  HCV.renderPage = (doc, host, o) => {
    o = o || {};
    const p = doc.page;
    let h = `<div class="page pat-${p.pattern}" style="${HCV.pageVars(doc, o.mm || "1mm")};width:calc(${p.w}*var(--mm));height:calc(${p.h}*var(--mm))">`;
    if (p.frame !== "none") h += `<div class="pframe pf-${p.frame}"></div>`;
    HCV.ordered(doc).forEach((b) => { h += HCV.blockHTML(b, { z: doc.blocks.indexOf(b) }); });
    ["tl", "tr", "bl", "br"].forEach((k) => { const t = tokens(p.corners[k], doc); if (t) h += `<div class="corner c-${k}">${esc(t)}</div>`; });
    if (o.interactive) {
      h += `<div class="ov-safe" style="left:calc(${p.safe}*var(--mm));top:calc(${p.safe}*var(--mm));right:calc(${p.safe}*var(--mm));bottom:calc(${p.safe}*var(--mm))"></div><div class="ov-guides"></div>`;
    }
    host.innerHTML = h + "</div>";
  };
  /* Plain, single-column, ATS-friendly version: reading order, no decoration. */
  HCV.plainHTML = (doc) => {
    const rows = HCV.ordered(doc).filter((b) => !HCV.isDecor(b)).map((b) => `<section class="blk-plain t-${b.type}">${HCV.contentHTML(b)}</section>`).join("");
    return `<div class="plain">${rows}</div>`;
  };

  /* ---------- Measuring & auto-layout ---------- */
  let mEl;
  HCV.measure = (doc, b, wMm) => {
    if (!mEl) { mEl = document.createElement("div"); mEl.style.cssText = "position:fixed;left:-9999px;top:0;visibility:hidden;pointer-events:none"; document.body.appendChild(mEl); }
    mEl.innerHTML = `<div class="page" style="${HCV.pageVars(doc, "1mm")};width:${wMm}mm;height:auto;overflow:visible">${HCV.blockHTML(Object.assign({}, b, { w: wMm }), { measure: true })}</div>`;
    const el = mEl.querySelector(".blk");
    el.style.position = "relative"; el.style.width = wMm + "mm"; el.style.height = "auto";
    return Math.ceil(el.offsetHeight * 25.4 / 96) + 1;
  };
  HCV.autoLayout = (doc) => {
    const g = doc.page.grid, m = doc.page.safe, W = doc.page.w - 2 * m;
    const up = (v) => Math.ceil(v / g) * g;
    const items = HCV.ordered(doc).filter((b) => !HCV.isDecor(b) && !b.locked);
    const set = (b, x, y, w) => { b.x = r2(x); b.y = r2(y); b.w = r2(w); b.h = HCV.measure(doc, b, w); };
    const seq = []; let bottom = m;
    if (doc.cols === 1) {
      let y = m;
      items.forEach((b) => { set(b, m, y, W); y = up(y + b.h + g); seq.push(b); });
      bottom = y;
    } else {
      const wM = Math.round(W * 0.62 / g) * g, wS = W - wM - g, xS = m + wM + g;
      const prof = items.find((b) => b.type === "profile");
      const cont = prof ? items.find((b) => b.type === "contact") : null;
      let y = m;
      if (prof) { set(prof, m, y, cont ? wM : W); seq.push(prof); }
      if (cont) { set(cont, xS, y, wS); seq.push(cont); }
      if (prof) y = up(y + Math.max(prof.h, cont ? cont.h : 0) + g);
      const rest = items.filter((b) => b !== prof && b !== cont);
      const side = rest.filter((b) => SIDE.includes(b.type) || b.type === "contact");
      const main = rest.filter((b) => !side.includes(b));
      let ym = y, ys = y;
      main.forEach((b) => { set(b, m, ym, wM); ym = up(ym + b.h + g); seq.push(b); });
      side.forEach((b) => { set(b, xS, ys, wS); ys = up(ys + b.h + g); seq.push(b); });
      bottom = Math.max(ym, ys);
    }
    seq.concat(doc.blocks.filter((b) => !seq.includes(b))).forEach((b, i) => { b.order = i; });
    doc.layout = "auto";
    return bottom - g;   // bottom edge of content (mm)
  };

  /* ---------- Snapping ---------- */
  HCV.targets = (doc, excludeId) => {
    const p = doc.page, m = p.safe, xs = [m, p.w - m, p.w / 2], ys = [m, p.h - m, p.h / 2];
    doc.blocks.forEach((o) => { if (o.id === excludeId) return; xs.push(o.x, o.x + o.w, o.x + o.w / 2); ys.push(o.y, o.y + o.h, o.y + o.h / 2); });
    return { xs, ys };
  };
  function pick(vals, targets, thr) {
    let best = null;
    vals.forEach((v) => targets.forEach((t) => { const d = t - v; if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, t }; }));
    return best;
  }
  HCV.snapMove = (doc, b, nx, ny, thr) => {
    const T = HCV.targets(doc, b.id), g = doc.page.grid, gx = [], gy = [];
    const bx = pick([nx, nx + b.w / 2, nx + b.w], T.xs, thr);
    if (bx) { nx += bx.d; gx.push(bx.t); } else nx = Math.round(nx / g) * g;
    const by = pick([ny, ny + b.h / 2, ny + b.h], T.ys, thr);
    if (by) { ny += by.d; gy.push(by.t); } else ny = Math.round(ny / g) * g;
    return { x: r2(nx), y: r2(ny), gx, gy };
  };
  HCV.snapEdge = (doc, id, v, axis, thr) => {
    const best = pick([v], HCV.targets(doc, id)[axis + "s"], thr), g = doc.page.grid;
    return best ? { v: r2(best.t), g: best.t } : { v: r2(Math.round(v / g) * g) };
  };

  /* ---------- Checks ---------- */
  HCV.check = (doc, host) => {
    const out = [], push = (level, msg) => out.push({ level, msg });
    const real = doc.blocks.filter((b) => !HCV.isDecor(b)), p = doc.page, m = p.safe;
    const prof = real.find((b) => b.type === "profile");
    if (!prof || !prof.text.trim() || /your full name/i.test(prof.text.split("\n")[0])) push("warn", "Add your real name in the Profile block.");
    if (!/\S+@\S+\.\S+/.test(real.map((b) => b.text).join("\n"))) push("warn", "No email address found.");
    if (real.some((b) => /name@email\.com|Job Title \/ Position|Describe a relevant|Degree \/ Qualification/.test(b.text))) push("info", "Placeholder text is still in your CV.");
    real.forEach((b) => {
      if (b.x < m - .01 || b.y < m - .01 || b.x + b.w > p.w - m + .01 || b.y + b.h > p.h - m + .01) push("warn", `"${HCV.label(b)}" is outside the safe zone.`);
      if (b.fs < 8) push("info", `"${HCV.label(b)}" uses very small text (${b.fs} pt).`);
    });
    for (let i = 0; i < real.length; i++) for (let j = i + 1; j < real.length; j++) {
      const a = real[i], c = real[j];
      if (a.x < c.x + c.w - .5 && c.x < a.x + a.w - .5 && a.y < c.y + c.h - .5 && c.y < a.y + a.h - .5) push("error", `"${HCV.label(a)}" overlaps "${HCV.label(c)}".`);
    }
    if (host) host.querySelectorAll(".blk").forEach((el) => {
      const b = doc.blocks.find((x) => x.id === el.dataset.id);
      if (b && !HCV.isDecor(b) && el.scrollHeight > el.clientHeight + 2) push("error", `"${HCV.label(b)}" text is cut off. Use Fit height or enlarge the block.`);
    });
    const side = real.some((a) => real.some((c) => a !== c && Math.abs(a.y - c.y) < 4 && a.x + a.w <= c.x + .5));
    if (side) push("info", "Multi-column layout: parsers follow the reading order in the Order tab. Use the plain export for strict systems.");
    if (!out.length) push("ok", "No problems found.");
    return out;
  };
})();
